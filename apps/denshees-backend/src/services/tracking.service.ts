

import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma.service.js";
import { log } from "../utils/logger.js";
import { syncCrmForLeadEvent } from "./crm-sync.service.js";

export async function trackEmailOpen(
  emailId: string,
  ip: string,
  userAgent: string,
  txId = uuidv4().substring(0, 8),
): Promise<void> {
  try {
    
    const email = await prisma.campaignEmail.findUnique({
      where: { id: emailId },
    });

    if (!email) {
      log("WARN", `Email not found: ${emailId}`, txId);
      return;
    }

    log("INFO", `Tracking open for email: ${emailId}`, txId);

    
    await prisma.campaignOpen.create({
      data: { campaignEmailId: emailId },
    });

    
    await prisma.campaignEmail.update({
      where: { id: emailId },
      data: { opened: { increment: 1 } },
    });

    try {
      await syncCrmForLeadEvent(emailId, "OPENED");
    } catch (crmErr: any) {
      log("WARN", `CRM sync on OPENED failed`, txId, {
        error: crmErr?.message,
      });
    }

    log("INFO", `Successfully tracked open for email: ${emailId}`, txId);
  } catch (error: any) {
    log("ERROR", `Error tracking email open`, txId, {
      emailId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export async function getEmailOpenStats(campaignId: string): Promise<any> {
  const txId = uuidv4().substring(0, 8);

  try {
    
    const emails = await prisma.campaignEmail.findMany({
      where: { campaignId: campaignId },
    });

    
    const totalEmails = emails.length;
    const openedEmails = emails.filter(
      (email) => email.opened && email.opened > 0,
    ).length;
    const openRate = totalEmails > 0 ? (openedEmails / totalEmails) * 100 : 0;

    log("INFO", `Retrieved open stats for campaign: ${campaignId}`, txId, {
      totalEmails,
      openedEmails,
      openRate: `${openRate.toFixed(2)}%`,
    });

    return {
      totalEmails,
      openedEmails,
      openRate: Number.parseFloat(openRate.toFixed(2)),
    };
  } catch (error: any) {
    log("ERROR", `Error getting email open stats`, txId, {
      campaignId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
