



import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { log } from "./logger.js";
import type { CredentialRecord } from "../models/email.js";


export const emailTransporters = new Map<string, nodemailer.Transporter>();



export function extractUniqueCredentials(
  campaignEmails: any[],
): CredentialRecord[] {
  const txId = uuidv4().substring(0, 8);
  log(
    "INFO",
    `Extracting unique credentials from ${campaignEmails.length} emails`,
    txId,
  );

  const credentialsMap = new Map<string, CredentialRecord>();
  let totalCredentialsFound = 0;

  campaignEmails.forEach((email: any) => {
    const creds = email.campaign?.campaignEmailCredentials;
    if (creds && Array.isArray(creds)) {
      creds.forEach((cec: any) => {
        const cred = cec.emailCredential;
        if (cred && cred.id) {
          totalCredentialsFound++;
          credentialsMap.set(cred.id, cred);
        }
      });
    }
  });

  const uniqueCredentials = Array.from(credentialsMap.values());

  log(
    "INFO",
    `Extracted ${uniqueCredentials.length} unique credentials from ${totalCredentialsFound} total credentials`,
    txId,
  );
  return uniqueCredentials;
}



export function setupEmailTransporters(
  credentialsList: CredentialRecord[],
): void {
  const txId = uuidv4().substring(0, 8);
  log(
    "INFO",
    `Setting up email transporters for ${credentialsList.length} credentials`,
    txId,
  );

  let newTransporters = 0;
  let skippedTransporters = 0;
  let failedTransporters = 0;

  credentialsList.forEach((cred) => {
    
    if (emailTransporters.has(cred.id)) {
      log("INFO", `Transporter already exists for credential ${cred.id}`, txId);
      skippedTransporters++;
      return;
    }

    
    if (!cred.host || !cred.username || !cred.password) {
      log(
        "ERROR",
        `Invalid credential data for ID ${cred.id}. Missing required fields`,
        txId,
        {
          hasHost: !!cred.host,
          hasUsername: !!cred.username,
          hasPassword: !!cred.password,
        },
      );
      failedTransporters++;
      return;
    }

    try {
      log("INFO", `Creating new transporter for credential ${cred.id}`, txId, {
        host: cred.host,
        port: cred.port || (cred.secure ? 465 : 587),
        secure: cred.secure,
      });

      const transporter = nodemailer.createTransport({
        host: cred.host,
        port: cred.port || (cred.secure ? 465 : 587), 
        secure: cred.secure,
        auth: {
          user: cred.username,
          pass: cred.password,
        },
        
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        
        connectionTimeout: 10000,
        
        opportunisticTLS: false,
        
        requireTLS: cred.host.includes("gmail"),
        
        debug: process.env.NODE_ENV !== "production",
        logger: process.env.NODE_ENV !== "production",
      });

      emailTransporters.set(cred.id, transporter);
      newTransporters++;

      
      const maskedUsername = cred.username.includes("@")
        ? cred.username.substring(0, 3) + "***@" + cred.username.split("@")[1]
        : cred.username.substring(0, 3) + "***";

      log("INFO", `Created new transporter for credential ${cred.id}`, txId, {
        host: cred.host,
        username: maskedUsername,
      });
    } catch (error: any) {
      log(
        "ERROR",
        `Error creating transporter for credential ${cred.id}`,
        txId,
        {
          error: error.message,
          stack: error.stack,
        },
      );
      failedTransporters++;
    }
  });

  log("INFO", `Email transporters setup complete`, txId, {
    total: credentialsList.length,
    new: newTransporters,
    skipped: skippedTransporters,
    failed: failedTransporters,
  });
}



export function getEmailTransporter(
  credentialId: string,
): nodemailer.Transporter | null {
  const txId = uuidv4().substring(0, 8);

  const transporter = emailTransporters.get(credentialId);

  if (!transporter) {
    log("WARN", `No transporter found for credential ${credentialId}`, txId);
    return null;
  } else {
    log("INFO", `Retrieved transporter for credential ${credentialId}`, txId);
    return transporter;
  }
}
