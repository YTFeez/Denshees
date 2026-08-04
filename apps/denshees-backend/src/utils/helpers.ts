



import Hogan from "hogan.js";
import { v4 as uuidv4 } from "uuid";
import { log } from "./logger.js";
import type { PitchRecord } from "../models/email.js";
import he from "he";



export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}



export function normalizeEmailBody(html: string): string {
  if (!html) return "";

  return (
    html
      .replace(/&nbsp;/gi, " ")
      // Block boundary = a single line break, matching how the editor renders a
      // paragraph break. Intentional blank lines are authored as <br><br> INSIDE
      // a paragraph and are preserved as-is — mapping </p> to <br><br> here would
      // double them, inserting empty lines the author never added.
      .replace(/<\/(p|div)>/gi, "<br>")
      .replace(/<(p|div)[^>]*>/gi, "")
      // Drop editor pretty-print newlines that follow a <br> (kept invisible in
      // HTML but they bloat the text/plain alt with blank lines).
      .replace(/(<br\s*\/?>)[ \t]*\n[ \t]*/gi, "$1")
      
      .replace(/(<br\s*\/?>)\s+(?=<br)/gi, "$1")
      
      .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
      
      .replace(/^(\s*<br\s*\/?>\s*)+/i, "")
      .replace(/(\s*<br\s*\/?>\s*)+$/i, "")
      // Strip inline styles left over from pasted content.
      .replace(/\s*style="[^"]*"/gi, "")
      .trim()
  );
}

/**
 * Applies Hogan.js personalization for email templates.
 * @param pitch - Pitch template with subject and message.
 * @param data - Personalization data.
 * @returns Personalized subject and body.
 */
export function applyHoganPersonalization(
  pitch: PitchRecord,
  data: Record<string, any>
): { subject: string; body: string } {
  const txId = uuidv4().substring(0, 8);
  log("INFO", `Applying Hogan personalization`, txId);

  try {
    const applyDefaults = (template: string): string =>
      template.replace(
        /\{\{\s*(\w+)\s*\|\s*"([^"]+)"\s*\}\}/g,
        (_, variable, defaultValue) =>
          data[variable] !== undefined && data[variable] !== null
            ? `{{${variable}}}`
            : defaultValue
      );

    const processedSubject = applyDefaults(pitch.subject);
    const processedBody = applyDefaults(pitch.message);

    log("INFO", `Compiling templates with Hogan`, txId);

    const compiledSubject = Hogan.compile(processedSubject);
    const compiledBody = Hogan.compile(processedBody);

    const renderedSubject = compiledSubject.render(data);
    const renderedBody = compiledBody.render(data);

    log("INFO", `Personalization complete`, txId, {
      subjectLength: renderedSubject.length,
      bodyLength: renderedBody.length,
    });

    return {
      subject: he.decode(renderedSubject),
      body: renderedBody,
    };
  } catch (error: any) {
    log("ERROR", `Error applying personalization`, txId, {
      error: error.message,
      stack: error.stack,
    });

    
    return {
      subject: pitch.subject || "No Subject",
      body: pitch.message || "Email content could not be personalized.",
    };
  }
}



export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return email;

  const username = parts[0];
  const domain = parts[1];

  
  const maskedUsername =
    username.length > 3 ? username.substring(0, 3) + "***" : username + "***";

  return `${maskedUsername}@${domain}`;
}
