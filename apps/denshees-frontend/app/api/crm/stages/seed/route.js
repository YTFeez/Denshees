import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

async function backfillKeys(campaignId) {
  const existing = await prisma.crmStage.findMany({ where: { campaignId } });
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
  return prisma.crmStage.findMany({
    where: { campaignId },
    orderBy: { order: "asc" },
  });
}

export async function POST(request) {
  const { campaign } = await request.json();

  if (!campaign) {
    return NextResponse.json(
      { message: "campaign is required" },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.crmStage.findMany({
      where: { campaignId: campaign },
    });

    if (existing.length > 0) {
      const updated = await backfillKeys(campaign);
      return NextResponse.json(updated);
    }

    const created = [];
    for (const stage of DEFAULT_STAGES) {
      const record = await prisma.crmStage.create({
        data: { ...stage, campaignId: campaign },
      });
      created.push(record);
    }

    return NextResponse.json(created);
  } catch (error) {
    console.error("[API] Error seeding CRM stages:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
