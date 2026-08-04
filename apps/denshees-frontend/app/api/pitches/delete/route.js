import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(request) {
  const searchParams = new URL(request.url).searchParams;
  const pitchId = searchParams.get("pitch");

  if (!pitchId) {
    return NextResponse.json({ message: "pitch is required" }, { status: 400 });
  }

  try {
    const pitch = await prisma.pitchEmail.findUnique({
      where: { id: pitchId },
      select: { id: true, stage: true, campaignId: true },
    });

    if (!pitch) {
      return NextResponse.json({ message: "Pitch not found" }, { status: 404 });
    }

    if ((pitch.stage ?? 0) === 0) {
      return NextResponse.json(
        { message: "The first email cannot be deleted." },
        { status: 400 },
      );
    }

    
    const inFlight = await prisma.campaignEmail.count({
      where: {
        campaignId: pitch.campaignId,
        currentPitchId: pitch.id,
        status: { in: ["PENDING", "RUNNING", "REPLIED"] },
      },
    });

    if (inFlight > 0) {
      return NextResponse.json(
        {
          message: `Can't remove this follow-up — ${inFlight} lead(s) are currently on it. Wait until they progress or reply.`,
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const outgoingNoReply = await tx.pitchFlowEdge.findFirst({
        where: {
          campaignId: pitch.campaignId,
          fromPitchId: pitch.id,
          condition: "NO_REPLY",
        },
      });
      const nextId = outgoingNoReply?.toPitchId ?? null;

      const incoming = await tx.pitchFlowEdge.findMany({
        where: {
          campaignId: pitch.campaignId,
          toPitchId: pitch.id,
        },
      });

      for (const edge of incoming) {
        const rewire =
          edge.condition === "NO_REPLY" || edge.condition === "ALWAYS"
            ? nextId
            : null;
        await tx.pitchFlowEdge.update({
          where: { id: edge.id },
          data: { toPitchId: rewire },
        });
      }

      await tx.pitchFlowEdge.deleteMany({
        where: { fromPitchId: pitch.id },
      });

      await tx.pitchEmail.delete({ where: { id: pitch.id } });

      const remaining = await tx.pitchEmail.count({
        where: { campaignId: pitch.campaignId },
      });
      await tx.campaign.update({
        where: { id: pitch.campaignId },
        data: { maxStageCount: Math.max(remaining, 1) },
      });
    });

    return NextResponse.json({
      message: "Follow-up removed",
      stage: pitch.stage,
    });
  } catch (error) {
    console.error(`[API] Error deleting pitch ${pitchId}:`, error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
