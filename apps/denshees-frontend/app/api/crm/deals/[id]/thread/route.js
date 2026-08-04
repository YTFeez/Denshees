import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";


export async function GET(_request, { params }) {
  const dealId = params.id;

  try {
    const deal = await prisma.crmDeal.findUnique({
      where: { id: dealId },
      include: { lead: true },
    });

    if (!deal) {
      return NextResponse.json({ message: "Deal not found" }, { status: 404 });
    }

    const leadId = deal.leadId;
    const [activities, messages, opens] = await Promise.all([
      prisma.crmActivity.findMany({
        where: { dealId },
        orderBy: { created: "desc" },
        include: { fromStage: true, toStage: true },
      }),
      leadId
        ? prisma.campaignMessage.findMany({
            where: { campaignEmailId: leadId },
            orderBy: { created: "desc" },
            take: 50,
          })
        : [],
      leadId
        ? prisma.campaignOpen.findMany({
            where: { campaignEmailId: leadId },
            orderBy: { created: "desc" },
            take: 20,
          })
        : [],
    ]);

    const timeline = [
      ...activities.map((a) => ({
        id: `act-${a.id}`,
        kind: "activity",
        type: a.type,
        description: a.description,
        created: a.created,
        fromStage: a.fromStage?.name,
        toStage: a.toStage?.name,
      })),
      ...messages.map((m) => ({
        id: `msg-${m.id}`,
        kind: "message",
        type: m.sent ? "EMAIL_SENT" : "REPLY",
        description: m.text,
        created: m.timestamp || m.created,
        sent: m.sent,
        messageId: m.messageId,
      })),
      ...opens.map((o) => ({
        id: `open-${o.id}`,
        kind: "open",
        type: "EMAIL_OPENED",
        description: "Email opened",
        created: o.created,
      })),
    ].sort((a, b) => new Date(b.created) - new Date(a.created));

    return NextResponse.json({
      dealId,
      leadId,
      lead: deal.lead,
      timeline,
    });
  } catch (error) {
    console.error(`[API] Error loading deal thread ${dealId}:`, error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
