



import nodemailer from "nodemailer";
import { prisma } from "./prisma.service.js";
import { log } from "../utils/logger.js";

const DEFAULT_STAGES = [
  {
    name: "Email Added",
    key: "email_added",
    order: 0,
    color: "#6B7280",
    isWon: false,
    isLost: false,
  },
  {
    name: "LinkedIn Reached",
    key: "linkedin",
    order: 1,
    color: "#3B82F6",
    isWon: false,
    isLost: false,
  },
  {
    name: "Reply Received",
    key: "reply_received",
    order: 2,
    color: "#8B5CF6",
    isWon: false,
    isLost: false,
  },
  {
    name: "Meeting",
    key: "meeting",
    order: 3,
    color: "#F59E0B",
    isWon: false,
    isLost: false,
  },
  {
    name: "Deal Won",
    key: "won",
    order: 4,
    color: "#10B981",
    isWon: true,
    isLost: false,
  },
  {
    name: "No Reply",
    key: "no_reply",
    order: 5,
    color: "#EF4444",
    isWon: false,
    isLost: true,
  },
  {
    name: "Deal Lost",
    key: "lost",
    order: 6,
    color: "#DC2626",
    isWon: false,
    isLost: true,
  },
] as const;

type CrmEvent = "SENT" | "OPENED" | "REPLY" | "BOUNCE" | "FLOW_DONE";

async function ensureStages(campaignId: string) {
  const existing = await prisma.crmStage.findMany({ where: { campaignId } });
  if (existing.length === 0) {
    for (const stage of DEFAULT_STAGES) {
      await prisma.crmStage.create({
        data: { ...stage, campaignId },
      });
    }
    return prisma.crmStage.findMany({ where: { campaignId } });
  }

  for (const stage of existing) {
    if ((stage as any).key) continue;
    const match = DEFAULT_STAGES.find(
      (s) => s.name.toLowerCase() === (stage.name || "").toLowerCase(),
    );
    if (match) {
      await prisma.crmStage.update({
        where: { id: stage.id },
        data: { key: match.key },
      });
    }
  }
  return prisma.crmStage.findMany({ where: { campaignId } });
}

function stageByKey(stages: any[], key: string) {
  return stages.find((s) => s.key === key) || null;
}

async function ensureDeal(leadId: string, campaignId: string, stages: any[]) {
  let deal = await prisma.crmDeal.findFirst({
    where: { leadId },
    include: { stage: true },
  });
  if (deal) return deal;

  const emailAdded = stageByKey(stages, "email_added") || stages[0];
  if (!emailAdded) return null;

  deal = await prisma.crmDeal.create({
    data: {
      leadId,
      campaignId,
      stageId: emailAdded.id,
    },
    include: { stage: true },
  });
  return deal;
}

async function addActivity(
  dealId: string,
  campaignId: string,
  type: string,
  description: string,
  fromStageId?: string | null,
  toStageId?: string | null,
) {
  return prisma.crmActivity.create({
    data: {
      dealId,
      campaignId,
      type,
      description,
      fromStageId: fromStageId || null,
      toStageId: toStageId || null,
    },
  });
}

async function createNotification(opts: {
  userId: string;
  campaignId: string;
  dealId: string;
  leadId: string;
  type: string;
  title: string;
  body: string;
}) {
  return prisma.notification.create({
    data: {
      userId: opts.userId,
      campaignId: opts.campaignId,
      dealId: opts.dealId,
      leadId: opts.leadId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      read: false,
    },
  });
}

async function maybeMoveStage(
  deal: any,
  stages: any[],
  targetKey: string,
  campaignId: string,
  description: string,
) {
  if (deal.stageLocked) return deal;
  const current = deal.stage || stages.find((s) => s.id === deal.stageId);
  if (current?.isWon || current?.isLost) return deal;

  const target = stageByKey(stages, targetKey);
  if (!target || target.id === deal.stageId) return deal;

  const updated = await prisma.crmDeal.update({
    where: { id: deal.id },
    data: { stageId: target.id },
    include: { stage: true },
  });

  await addActivity(
    deal.id,
    campaignId,
    "STAGE_AUTO",
    description,
    deal.stageId,
    target.id,
  );
  return updated;
}

async function sendEmailNotification(
  campaignId: string,
  ownerEmail: string | null | undefined,
  subject: string,
  text: string,
  txId: string,
) {
  if (!ownerEmail) return;
  try {
    const link = await prisma.campaignEmailCredential.findFirst({
      where: { campaignId },
      include: { emailCredential: true },
    });
    const cred = link?.emailCredential;
    if (!cred?.host || !cred?.username || !cred?.password) {
      log("WARN", `No SMTP cred for CRM email notif`, txId, { campaignId });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: cred.host,
      port: cred.port || 587,
      secure: !!cred.secure,
      auth: { user: cred.username, pass: cred.password },
    });

    await transporter.sendMail({
      from: cred.username,
      to: ownerEmail,
      subject,
      text,
    });
  } catch (err: any) {
    log("WARN", `CRM email notif failed`, txId, { error: err.message });
  }
}

async function openNotifThrottled(leadId: string, type: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({
    where: {
      leadId,
      type,
      created: { gte: oneHourAgo },
    },
  });
  return !!recent;
}



export async function syncCrmForLeadEvent(
  leadId: string,
  event: CrmEvent,
  opts: { messageExcerpt?: string; pitchSubject?: string } = {},
): Promise<void> {
  const txId = `crm-${leadId.slice(0, 6)}`;
  try {
    const lead = await prisma.campaignEmail.findUnique({
      where: { id: leadId },
      include: {
        campaign: { include: { user: true } },
      },
    });

    if (!lead?.campaignId || !lead.campaign) {
      log("WARN", `CRM sync: lead/campaign missing`, txId, { leadId });
      return;
    }

    const campaignId = lead.campaignId;
    const userId = lead.campaign.userId;
    const ownerEmail = lead.campaign.user?.email;
    const leadLabel = lead.name || lead.email || leadId;

    const stages = await ensureStages(campaignId);
    let deal = await ensureDeal(leadId, campaignId, stages);
    if (!deal) {
      log("WARN", `CRM sync: could not create deal`, txId);
      return;
    }

    if (event === "SENT") {
      await addActivity(
        deal.id,
        campaignId,
        "EMAIL_SENT",
        opts.pitchSubject
          ? `Email sent: ${opts.pitchSubject}`
          : "Campaign email sent",
      );
      if (userId) {
        await createNotification({
          userId,
          campaignId,
          dealId: deal.id,
          leadId,
          type: "EMAIL_SENT",
          title: `Email sent to ${leadLabel}`,
          body: opts.pitchSubject || "Campaign email sent",
        });
      }
      await sendEmailNotification(
        campaignId,
        ownerEmail,
        `[Denshees] Email sent — ${leadLabel}`,
        `An email was sent to ${leadLabel} (${lead.email}).\n\nSubject: ${opts.pitchSubject || "—"}\nCampaign: ${lead.campaign.title || campaignId}`,
        txId,
      );
      return;
    }

    if (event === "OPENED") {
      await addActivity(deal.id, campaignId, "EMAIL_OPENED", "Email opened");
      if (userId && !(await openNotifThrottled(leadId, "EMAIL_OPENED"))) {
        await createNotification({
          userId,
          campaignId,
          dealId: deal.id,
          leadId,
          type: "EMAIL_OPENED",
          title: `${leadLabel} opened your email`,
          body: lead.email || "",
        });
        await sendEmailNotification(
          campaignId,
          ownerEmail,
          `[Denshees] Open — ${leadLabel}`,
          `${leadLabel} (${lead.email}) opened a campaign email.`,
          txId,
        );
      }
      return;
    }

    if (event === "REPLY") {
      const excerpt = (opts.messageExcerpt || "").slice(0, 500);
      await addActivity(
        deal.id,
        campaignId,
        "REPLY",
        excerpt ? `Reply: ${excerpt}` : "Reply received",
      );
      deal = await maybeMoveStage(
        deal,
        stages,
        "reply_received",
        campaignId,
        "Auto-moved to Reply Received",
      );
      if (userId) {
        await createNotification({
          userId,
          campaignId,
          dealId: deal.id,
          leadId,
          type: "REPLY",
          title: `Reply from ${leadLabel}`,
          body: excerpt || "New reply received",
        });
      }
      await sendEmailNotification(
        campaignId,
        ownerEmail,
        `[Denshees] Reply — ${leadLabel}`,
        `${leadLabel} (${lead.email}) replied.\n\n${excerpt || "(no text)"}`,
        txId,
      );
      return;
    }

    if (event === "BOUNCE") {
      await addActivity(deal.id, campaignId, "BOUNCE", "Email bounced");
      deal = await maybeMoveStage(
        deal,
        stages,
        "no_reply",
        campaignId,
        "Auto-moved after bounce",
      );
      if (userId) {
        await createNotification({
          userId,
          campaignId,
          dealId: deal.id,
          leadId,
          type: "BOUNCE",
          title: `Bounce — ${leadLabel}`,
          body: lead.email || "",
        });
      }
      await sendEmailNotification(
        campaignId,
        ownerEmail,
        `[Denshees] Bounce — ${leadLabel}`,
        `Email to ${leadLabel} (${lead.email}) bounced.`,
        txId,
      );
      return;
    }

    if (event === "FLOW_DONE") {
      if (lead.status === "REPLIED") return;
      await maybeMoveStage(
        deal,
        stages,
        "no_reply",
        campaignId,
        "Sequence finished without reply",
      );
    }
  } catch (error: any) {
    log("ERROR", `CRM sync failed`, txId, {
      leadId,
      event,
      error: error.message,
      stack: error.stack,
    });
  }
}
