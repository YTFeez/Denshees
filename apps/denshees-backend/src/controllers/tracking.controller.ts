



import type { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { log } from "../utils/logger.js";
import { trackEmailOpen } from "../services/tracking.service.js";


const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);



export async function handleEmailOpen(c: Context): Promise<Response> {
  const txId = uuidv4().substring(0, 8);
  const emailId = c.req.query("id");

  
  c.header("Content-Type", "image/gif");
  c.header(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");

  if (!emailId) {
    log("WARN", "Missing email ID in tracking pixel request", txId);
    return c.body(TRACKING_PIXEL);
  }

  try {
    
    const userAgent = c.req.header("user-agent") || "Unknown";
    const ip =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "Unknown";

    
    await trackEmailOpen(emailId, ip, userAgent, txId);
  } catch (error: any) {
    log("ERROR", `Error handling email open tracking`, txId, {
      emailId,
      error: error.message,
      stack: error.stack,
    });
  }

  
  return c.body(TRACKING_PIXEL);
}
