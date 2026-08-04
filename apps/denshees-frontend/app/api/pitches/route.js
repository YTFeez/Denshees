import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const campaign = searchParams.get("campaign");

  try {
    const [items, totalItems, edges] = await Promise.all([
      prisma.pitchEmail.findMany({
        where: { campaignId: campaign },
        orderBy: { stage: "asc" },
        take: 50,
      }),
      prisma.pitchEmail.count({ where: { campaignId: campaign } }),
      prisma.pitchFlowEdge.findMany({
        where: { campaignId: campaign },
        orderBy: { created: "asc" },
      }),
    ]);

    return NextResponse.json({
      items,
      edges,
      totalItems,
      page: 1,
      perPage: 50,
    });
  } catch (error) {
    console.error(
      `[API] Error getting pitches for campaign ${campaign}:`,
      error,
    );
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
