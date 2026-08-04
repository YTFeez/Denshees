



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
];

async function ensureStages(prisma, campaignId) {
  const existing = await prisma.crmStage.findMany({ where: { campaignId } });
  if (existing.length === 0) {
    for (const stage of DEFAULT_STAGES) {
      await prisma.crmStage.create({ data: { ...stage, campaignId } });
    }
    return prisma.crmStage.findMany({ where: { campaignId } });
  }
  for (const stage of existing) {
    if (stage.key) continue;
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

async function ensureDeal(prisma, leadId, campaignId, stages) {
  let deal = await prisma.crmDeal.findFirst({
    where: { leadId },
    include: { stage: true },
  });
  if (deal) return deal;
  const emailAdded =
    stages.find((s) => s.key === "email_added") || stages[0];
  if (!emailAdded) return null;
  return prisma.crmDeal.create({
    data: { leadId, campaignId, stageId: emailAdded.id },
    include: { stage: true },
  });
}



export async function syncCrmAfterAppReply(prisma, leadId, excerpt) {
  const lead = await prisma.campaignEmail.findUnique({
    where: { id: leadId },
    include: { campaign: { include: { user: true } } },
  });
  if (!lead?.campaignId) return;

  const stages = await ensureStages(prisma, lead.campaignId);
  const deal = await ensureDeal(prisma, leadId, lead.campaignId, stages);
  if (!deal) return;

  await prisma.crmActivity.create({
    data: {
      dealId: deal.id,
      campaignId: lead.campaignId,
      type: "EMAIL_SENT",
      description: excerpt
        ? `Manual reply: ${excerpt.slice(0, 500)}`
        : "Manual reply sent from app",
    },
  });

  if (lead.campaign?.userId) {
    await prisma.notification.create({
      data: {
        userId: lead.campaign.userId,
        campaignId: lead.campaignId,
        dealId: deal.id,
        leadId,
        type: "EMAIL_SENT",
        title: `Reply sent to ${lead.name || lead.email}`,
        body: (excerpt || "").slice(0, 500),
        read: false,
      },
    });
  }
}
