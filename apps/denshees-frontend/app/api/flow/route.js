import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request) {
  const campaign = new URL(request.url).searchParams.get("campaign");
  if (!campaign) {
    return NextResponse.json(
      { message: "campaign is required" },
      { status: 400 },
    );
  }

  try {
    const [nodes, wires, pitches] = await Promise.all([
      prisma.campaignFlowNode.findMany({
        where: { campaignId: campaign },
        orderBy: { created: "asc" },
      }),
      prisma.campaignFlowWire.findMany({
        where: { campaignId: campaign },
        orderBy: { created: "asc" },
      }),
      prisma.pitchEmail.findMany({
        where: { campaignId: campaign },
        orderBy: { stage: "asc" },
      }),
    ]);

    return NextResponse.json({ nodes, wires, pitches });
  } catch (error) {
    console.error(`[API] Error getting flow for ${campaign}:`, error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}
