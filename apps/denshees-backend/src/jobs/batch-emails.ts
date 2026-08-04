



import { v4 as uuidv4 } from "uuid";
import { log } from "../utils/logger.js";
import { delay } from "../utils/helpers.js";
import {
  extractUniqueCredentials,
  setupEmailTransporters,
} from "../utils/credential-service.js";
import { fetchCampaignEmails } from "../services/campaign-service.js";
import { sendCampaignEmail } from "../services/email-service.js";
import type { EmailRecord } from "../models/email.js";
import { removeEnqueuedEmailIds } from "../queues/batch-email.queue.js";



export async function processEmailBatchJob(
  data: string[] | { emailIds: string[] },
): Promise<EmailRecord[]> {
  
  const emailIds = Array.isArray(data) ? data : data.emailIds;

  const batchId = uuidv4().substring(0, 8);
  const startTime = Date.now();

  log("INFO", `Starting email batch job`, batchId, {
    emailCount: emailIds?.length || 0,
    emailIds,
  });

  try {
    if (!emailIds || emailIds.length === 0) {
      log("WARN", `No email IDs provided`, batchId);
      return [];
    }

    log("INFO", `Fetching campaign emails`, batchId);
    const campaignEmails = await fetchCampaignEmails(emailIds);
    log("INFO", `Fetched ${campaignEmails.length} campaign emails`, batchId);

    
    log("INFO", `Extracting unique credentials`, batchId);
    const uniqueCredentials = extractUniqueCredentials(campaignEmails);
    log(
      "INFO",
      `Found ${uniqueCredentials.length} unique credentials`,
      batchId,
    );

    setupEmailTransporters(uniqueCredentials);

    
    const emailsByCredential = groupEmailsByCredential(campaignEmails);

    log("INFO", `Grouped emails by credential`, batchId, {
      credentialCount: emailsByCredential.size,
      distribution: Array.from(emailsByCredential.entries()).map(
        ([credId, emails]) => ({
          credId,
          emailCount: emails.length,
        }),
      ),
    });

    
    const results = await processEmailsByCredential(
      emailsByCredential,
      batchId,
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    log("INFO", `Completed email batch job`, batchId, {
      duration: `${duration}ms`,
      totalEmails: campaignEmails.length,
      successCount: results.length,
      failureCount: campaignEmails.length - results.length,
      successRate:
        campaignEmails.length > 0
          ? `${Math.round((results.length / campaignEmails.length) * 100)}%`
          : "N/A",
    });

    removeEnqueuedEmailIds(emailIds);

    return results;
  } catch (error: any) {
    log("ERROR", `Error processing email batch job`, batchId, {
      error: error.message,
      stack: error.stack,
    });
    removeEnqueuedEmailIds(emailIds);

    return [];
  }
}



function groupEmailsByCredential(
  campaignEmails: EmailRecord[],
): Map<string, EmailRecord[]> {
  const emailsByCredential = new Map<string, EmailRecord[]>();

  for (const email of campaignEmails) {
    const credId = email.credId || "unassigned";
    if (!emailsByCredential.has(credId)) {
      emailsByCredential.set(credId, []);
    }
    emailsByCredential.get(credId)?.push(email);
  }

  return emailsByCredential;
}



async function processEmailsByCredential(
  emailsByCredential: Map<string, EmailRecord[]>,
  batchId: string,
): Promise<EmailRecord[]> {
  const results: EmailRecord[] = [];

  for (const [credId, emails] of emailsByCredential.entries()) {
    log("INFO", `Processing emails for credential ${credId}`, batchId, {
      emailCount: emails.length,
    });

    
    for (const email of emails) {
      const emailTxId = `${batchId}:${email.id.substring(0, 6)}`;
      try {
        log("INFO", `Processing email ${email.id}`, emailTxId);
        await sendCampaignEmail(email, emailTxId);
        results.push(email);

        
        const delayMs = 20000 + Math.random() * 2000;
        log(
          "INFO",
          `Delaying ${Math.round(delayMs)}ms before next email`,
          emailTxId,
        );
        await delay(delayMs);
      } catch (error: any) {
        log("ERROR", `Error processing email ${email.id}`, emailTxId, {
          error: error.message,
          stack: error.stack,
        });
      }
    }

    
    if (credId !== "unassigned" && emailsByCredential.size > 1) {
      const delayMs = 10000 + Math.random() * 5000;
      log(
        "INFO",
        `Delaying ${Math.round(delayMs)}ms before next credential`,
        batchId,
      );
      await delay(delayMs);
    }
  }

  return results;
}
