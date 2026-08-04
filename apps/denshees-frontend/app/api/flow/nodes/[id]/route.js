import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const data = {};
  if (body.flowX !== undefined) data.flowX = Number(body.flowX);
  if (body.flowY !== undefined) data.flowY = Number(body.flowY);
  if (body.config !== undefined) data.config = body.config;
  if (body.pitchId !== undefined) data.pitchId = body.pitchId;

  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ message: "nothing to update" }, { status: 400 });
  }

  try {
    const node = await prisma.campaignFlowNode.update({
      where: { id },
      data,
    });

    
    if (body.delayDays !== undefined && node.type === "WAIT") {
      const updated = await prisma.campaignFlowNode.update({
        where: { id },
        data: {
          config: {
            ...(typeof node.config === "object" && node.config ? node.config : {}),
            delayDays: Number(body.delayDays),
          },
        },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json(node);
  } catch (error) {
    console.error(`[API] Error updating flow node ${id}:`, error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  try {
    const node = await prisma.campaignFlowNode.findUnique({
      where: { id },
      select: { id: true, type: true, pitchId: true, campaignId: true },
    });
    if (!node) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    if (node.type === "START" || node.type === "END") {
      return NextResponse.json(
        { message: `Cannot delete ${node.type} block` },
        { status: 400 },
      );
    }

    const inFlight = await prisma.campaignEmail.count({
      where: {
        currentNodeId: id,
        status: { in: ["PENDING", "RUNNING", "REPLIED"] },
      },
    });
    if (inFlight > 0) {
      return NextResponse.json(
        {
          message: `Can't delete — ${inFlight} lead(s) are on this block`,
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.campaignFlowWire.deleteMany({
        where: {
          OR: [{ sourceNodeId: id }, { targetNodeId: id }],
        },
      });
      await tx.campaignFlowNode.delete({ where: { id } });

      if (node.type === "EMAIL" && node.pitchId) {
        const stillLinked = await tx.campaignFlowNode.count({
          where: { pitchId: node.pitchId },
        });
        if (!stillLinked) {
          await tx.pitchEmail.delete({ where: { id: node.pitchId } }).catch(() => {});
        }
      }
    });

    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    console.error(`[API] Error deleting flow node ${id}:`, error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}
