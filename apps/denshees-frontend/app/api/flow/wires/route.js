import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const HANDLES = {
  START: ["out"],
  EMAIL: ["out", "resend"],
  WAIT: ["replied", "opened", "no_reply", "mail"],
  END: [],
};

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = body.campaignId || body.campaign;
  const sourceNodeId = body.sourceNodeId;
  const sourceHandle = String(body.sourceHandle || "out");
  const targetNodeId = body.targetNodeId;
  const targetHandle = String(body.targetHandle || "in");

  if (!campaignId || !sourceNodeId || !targetNodeId) {
    return NextResponse.json(
      { message: "campaignId, sourceNodeId, targetNodeId required" },
      { status: 400 },
    );
  }

  try {
    const [source, target] = await Promise.all([
      prisma.campaignFlowNode.findUnique({ where: { id: sourceNodeId } }),
      prisma.campaignFlowNode.findUnique({ where: { id: targetNodeId } }),
    ]);

    if (!source || !target) {
      return NextResponse.json({ message: "Node not found" }, { status: 404 });
    }
    if (source.campaignId !== campaignId || target.campaignId !== campaignId) {
      return NextResponse.json({ message: "Campaign mismatch" }, { status: 400 });
    }
    if (target.type === "START") {
      return NextResponse.json(
        { message: "Cannot wire into Start" },
        { status: 400 },
      );
    }

    const allowed = HANDLES[source.type] || [];
    if (!allowed.includes(sourceHandle)) {
      return NextResponse.json(
        { message: `Invalid handle ${sourceHandle} for ${source.type}` },
        { status: 400 },
      );
    }

    const existing = await prisma.campaignFlowWire.findFirst({
      where: { campaignId, sourceNodeId, sourceHandle },
    });

    const wire = existing
      ? await prisma.campaignFlowWire.update({
          where: { id: existing.id },
          data: { targetNodeId, targetHandle },
        })
      : await prisma.campaignFlowWire.create({
          data: {
            campaignId,
            sourceNodeId,
            sourceHandle,
            targetNodeId,
            targetHandle,
          },
        });

    return NextResponse.json(wire);
  } catch (error) {
    console.error("[API] Error upserting wire:", error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}
