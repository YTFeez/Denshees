



import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma.service.js";
import { log } from "../utils/logger.js";



export async function getCredentialSentCount(
  credentialId: string,
): Promise<number> {
  const txId = uuidv4().substring(0, 8);

  try {
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentCount = await prisma.campaignMessage.count({
      where: {
        campaignEmail: {
          credId: credentialId,
        },
        sent: true,
        created: { gte: twentyFourHoursAgo },
      },
    });

    log(
      "INFO",
      `Found ${sentCount} emails sent in last 24h for credential ${credentialId}`,
      txId,
    );
    return sentCount;
  } catch (error: any) {
    log(
      "ERROR",
      `Error fetching sent count for credential ${credentialId}`,
      txId,
      {
        error: error.message,
        stack: error.stack,
      },
    );
    return 0;
  }
}
