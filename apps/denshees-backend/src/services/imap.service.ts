

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import EmailBounceParser from "email-bounce-parser";
import { prisma } from "./prisma.service.js";
import { syncCrmForLeadEvent } from "./crm-sync.service.js";

const IMAP_DEFAULT_PORT = 993;
const IMAP_DEFAULT_SECURE = true;

async function processEmail(msg: any, username: string) {
  const messageId = msg.envelope.inReplyTo;
  if (!messageId) return;

  try {
    const emailAddress: string = msg.envelope.from?.[0]?.address;

    
    const campaignMessage = await prisma.campaignMessage.findFirst({
      where: { messageId, sent: true },
    });

    if (!campaignMessage) return;

    const parsedMessage = await simpleParser(msg.source);
    console.log("Processing reply!", parsedMessage.subject);

    
    const bounceParser = new EmailBounceParser();
    const bounceResult = bounceParser.read(parsedMessage.text || "");

    const hasErrorCode =
      bounceResult.data?.error?.code?.basic ||
      bounceResult.data?.error?.code?.enhanced;
    const hasErrorType = bounceResult.data?.error?.type;
    const hasRecipient = bounceResult.data?.recipient;
    const isBounce =
      bounceResult.bounce && (hasErrorCode || hasErrorType || hasRecipient);

    if (isBounce) {
      console.log("Saving bounced status", campaignMessage.campaignEmailId);
      if (campaignMessage.campaignEmailId) {
        await prisma.campaignEmail.update({
          where: { id: campaignMessage.campaignEmailId },
          data: { status: "BOUNCED" },
        });
        await syncCrmForLeadEvent(campaignMessage.campaignEmailId, "BOUNCE");
      }
      return;
    }

    
    const lastRepliedMessage = await prisma.campaignMessage.findFirst({
      where: { messageId, sent: false },
      orderBy: { timestamp: "desc" },
    });

    if (
      lastRepliedMessage?.timestamp &&
      msg.envelope.date < lastRepliedMessage.timestamp
    ) {
      return;
    }

    
    await prisma.campaignMessage.create({
      data: {
        messageId: msg.envelope.messageId,
        sent: false,
        text: parsedMessage.text ?? null,
        pitchId: campaignMessage.pitchId,
        campaignEmailId: campaignMessage.campaignEmailId,
        timestamp: msg.envelope.date ? new Date(msg.envelope.date) : new Date(),
      },
    });

    
    if (campaignMessage.campaignEmailId) {
      await prisma.campaignEmail.update({
        where: { id: campaignMessage.campaignEmailId },
        data: { status: "REPLIED" },
      });
      await syncCrmForLeadEvent(campaignMessage.campaignEmailId, "REPLY", {
        messageExcerpt: parsedMessage.text ?? undefined,
      });
    }
  } catch (error: any) {
    console.log(`Error processing email for ${username}:`, error);
  }
}

async function fetchNewEmails(credential: {
  id: string;
  imapEmail: string | null;
  imapPassword: string | null;
  imapHost: string | null;
  lastCheckedTime: Date | null;
}) {
  const {
    id,
    imapEmail: username,
    imapPassword: password,
    imapHost: host,
    lastCheckedTime,
  } = credential;

  if (!username || !password || !host) {
    console.warn(`Credential ${id} is missing IMAP configuration, skipping.`);
    return { success: false, error: "Missing IMAP configuration" };
  }

  console.log(
    `Fetching new emails for ${username} since ${lastCheckedTime?.toISOString() || "beginning"}`,
  );

  let client: InstanceType<typeof ImapFlow> | null = null;

  try {
    client = new ImapFlow({
      host,
      port: IMAP_DEFAULT_PORT,
      secure: IMAP_DEFAULT_SECURE,
      auth: { user: username, pass: password },
      logger: false,
    });

    await client.connect();
    console.log(`Connected to IMAP for ${username}...`);

    
    await prisma.emailCredential.update({
      where: { id },
      data: { status: "Active" },
    });

    const lock = await client.getMailboxLock("INBOX");
    try {
      let searchCriteria: any;
      let exactLastCheckedTime: number | null = null;

      if (lastCheckedTime) {
        exactLastCheckedTime = new Date(lastCheckedTime).getTime();
        const sinceDate = new Date(lastCheckedTime);
        sinceDate.setHours(0, 0, 0, 0);
        searchCriteria = { since: sinceDate };
      } else {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        searchCriteria = { since: oneDayAgo };
      }

      const searchResult = await client.search(searchCriteria);
      const messages = Array.isArray(searchResult) ? searchResult : [];
      console.log(
        `Found ${messages.length} messages matching date criteria for ${username}`,
      );

      if (messages.length > 0) {
        const fetchedMessages = client.fetch(messages, {
          uid: true,
          envelope: true,
          source: true,
        });

        let processedCount = 0;
        let skippedCount = 0;

        for await (const msg of fetchedMessages) {
          if (exactLastCheckedTime !== null && msg.envelope) {
            const envDate = msg.envelope.date;
            if (envDate) {
              const messageTime = new Date(envDate).getTime();
              if (messageTime <= exactLastCheckedTime) {
                skippedCount++;
                continue;
              }
            }
          }
          await processEmail(msg, username);
          processedCount++;
        }

        console.log(
          `Processed ${processedCount} new messages, skipped ${skippedCount} already seen messages`,
        );
      }

      
      const currentTime = new Date();
      await prisma.emailCredential.update({
        where: { id },
        data: { lastCheckedTime: currentTime },
      });

      return {
        success: true,
        messagesProcessed: messages.length,
        lastCheckedTime: currentTime.toISOString(),
      };
    } finally {
      lock.release();
    }
  } catch (error: any) {
    console.error(`Error fetching emails for ${username}:`, error.message);
    await prisma.emailCredential.update({
      where: { id },
      data: { status: "Error" },
    });
    return { success: false, error: error.message };
  } finally {
    if (client) {
      try {
        await client.logout();
        console.log(`IMAP connection closed for ${username}`);
      } catch (e: any) {
        console.log(
          `Non-critical error closing IMAP connection for ${username}:`,
          e.message,
        );
      }
    }
  }
}

export async function checkEmails(credentialId?: string) {
  try {
    let credentials;

    if (credentialId) {
      const credential = await prisma.emailCredential.findUnique({
        where: { id: credentialId },
      });
      credentials = credential ? [credential] : [];
    } else {
      credentials = await prisma.emailCredential.findMany();
    }

    const results = [];

    for (const credential of credentials) {
      const result = await fetchNewEmails(credential);
      results.push({
        credentialId: credential.id,
        email: credential.imapEmail,
        ...result,
      });
    }

    return results;
  } catch (error) {
    console.error("Error checking emails:", error);
    throw error;
  }
}

export async function testImapConnection(
  username: string,
  password: string,
  host: string,
  port: number = IMAP_DEFAULT_PORT,
  secure: boolean = IMAP_DEFAULT_SECURE,
): Promise<{ success: boolean; error?: string }> {
  let client: InstanceType<typeof ImapFlow> | null = null;

  try {
    client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user: username, pass: password },
      logger: false,
    });

    await client.connect();
    await client.logout();

    return { success: true };
  } catch (error: any) {
    console.error("IMAP connection test failed:", error.message);
    return { success: false, error: error.message };
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        
      }
    }
  }
}
