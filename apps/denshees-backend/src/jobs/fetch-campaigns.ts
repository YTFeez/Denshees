import { DateTime } from "luxon";
import { prisma } from "../services/prisma.service.js";
import {
  enqueueEmailBatches,
  getEnqueuedEmailIds,
} from "../queues/batch-email.queue.js";
import { isLeadReadyToProcess } from "../services/campaign-service.js";

async function processCampaignJob() {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        deleted: false,
        userId: { not: null },
      },
      include: { user: true },
    });

    if (campaigns.length === 0) {
      console.log("No campaigns found.");
      return [];
    }

    const validCampaigns = campaigns.filter(passesDeliveryAndCreditCheck);
    const campaignIds = validCampaigns.map((c: any) => c.id);
    if (campaignIds.length === 0) {
      console.log(
        "No valid campaigns found based on delivery time and credits.",
      );
      return [];
    }

    const campaignEmails = await prisma.campaignEmail.findMany({
      where: {
        campaignId: { in: campaignIds },
        campaign: { status: "RUNNING" },
        status: { in: ["PENDING", "RUNNING", "REPLIED"] },
        NOT: [{ status: "BOUNCED" }],
      },
      include: {
        campaign: {
          include: {
            pitches: true,
            pitchFlowEdges: true,
            flowNodes: true,
            flowWires: true,
          },
        },
      },
      orderBy: { stage: "asc" },
    });

    const readyFlags = await Promise.all(
      campaignEmails.map(async (email: any) => {
        try {
          
          if (email.status === "REPLIED") {
            const hasFlow = (email.campaign?.flowNodes || []).length > 0;
            if (!hasFlow) return false;
          }
          return await isLeadReadyToProcess(email);
        } catch (err) {
          console.error("Error checking lead readiness", email.id, err);
          return false;
        }
      }),
    );

    let emailIds = campaignEmails
      .filter((_, i) => readyFlags[i])
      .map((email: any) => email.id);

    if (emailIds.length === 0) {
      console.log("No valid emails to process.");
      return [];
    }

    const alreadyEnqueuedIds = await getEnqueuedEmailIds();
    emailIds = emailIds.filter((id: any) => !alreadyEnqueuedIds.has(id));

    if (emailIds.length === 0) {
      console.log("No new emails to enqueue (all are already queued).");
      return [];
    }

    console.log("Enqueuing email IDs:", emailIds);
    await enqueueEmailBatches(emailIds);

    return emailIds;
  } catch (error) {
    console.error("Error processing campaign job:", error);
    return [];
  }
}

function isCampaignActiveToday(campaign: any, currentTime: DateTime) {
  const activeDays = campaign.activeDays;
  if (!activeDays || !Array.isArray(activeDays) || activeDays.length === 0) {
    return true;
  }

  const dayNames = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const currentDayName = dayNames[currentTime.weekday - 1];
  return activeDays.map((d: string) => d.toLowerCase()).includes(currentDayName);
}

function passesDeliveryAndCreditCheck(campaign: any) {
  const user = campaign.user;
  if (!user || (user.credits ?? 0) <= 0) return false;

  const timezone = user.timezone || "UTC";
  let currentTime: DateTime;
  try {
    currentTime = DateTime.now().setZone(timezone);
  } catch {
    currentTime = DateTime.utc();
  }

  if (!isCampaignActiveToday(campaign, currentTime)) return false;

  const deliveryPeriod = campaign.emailDeliveryPeriod || "MORNING";
  return isWithinDeliveryPeriod(currentTime, deliveryPeriod);
}

function isWithinDeliveryPeriod(currentTime: DateTime, deliveryPeriod: string) {
  if (typeof deliveryPeriod !== "string") {
    console.warn(`Invalid delivery period: ${deliveryPeriod}`);
    return false;
  }

  const key = deliveryPeriod.toUpperCase();
  
  if (key === "ALL_DAY" || key === "ALWAYS") return true;

  const periods: Record<string, { start: number; end: number }> = {
    MORNING: { start: 6, end: 12 },
    EVENING: { start: 12, end: 18 },
    NIGHT: { start: 18, end: 24 },
    MIDNIGHT: { start: 0, end: 6 },
  };

  const period = periods[key];
  if (!period) {
    console.warn(`Unrecognized delivery period: ${deliveryPeriod}`);
    return false;
  }

  const currentHour = currentTime.hour;
  return currentHour >= period.start && currentHour < period.end;
}

export { processCampaignJob };
