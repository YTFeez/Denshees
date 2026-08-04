import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const TYPES = ["START", "EMAIL", "WAIT", "END"];

const EMAIL_TEMPLATE = {
  subject: "Re: {{name}} — un petit suivi",
  message: `Bonjour {{name}},

Je me permets un petit message de suivi.

Merci,
Daniel Ferras
EP Digital`,
};

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = body.campaignId || body.campaign;
  const type = String(body.type || "").toUpperCase();
  const flowX = body.flowX != null ? Number(body.flowX) : 200;
  const flowY = body.flowY != null ? Number(body.flowY) : 200;
  const config = body.config || null;

  if (!campaignId) {
    return NextResponse.json(
      { message: "campaignId is required" },
      { status: 400 },
    );
  }
  if (!TYPES.includes(type)) {
    return NextResponse.json({ message: "invalid type" }, { status: 400 });
  }

  try {
    if (type === "START" || type === "END") {
      const existing = await prisma.campaignFlowNode.findFirst({
        where: { campaignId, type },
      });
      if (existing) {
        return NextResponse.json(
          { message: `Campaign already has a ${type} block` },
          { status: 400 },
        );
      }
    }

    const node = await prisma.$transaction(async (tx) => {
      let pitchId = null;

      if (type === "EMAIL") {
        const last = await tx.pitchEmail.findFirst({
          where: { campaignId },
          orderBy: { stage: "desc" },
          select: { stage: true },
        });
        const stage = (last?.stage ?? -1) + 1;
        const pitch = await tx.pitchEmail.create({
          data: {
            title: body.title || `Email ${stage}`,
            subject: body.subject || EMAIL_TEMPLATE.subject,
            message: body.message || EMAIL_TEMPLATE.message,
            campaignId,
            stage,
            delayDays: Number(body.delayDays ?? 1),
          },
        });
        pitchId = pitch.id;
        await tx.campaign.update({
          where: { id: campaignId },
          data: { maxStageCount: stage + 1 },
        });
      }

      let nodeConfig = config;
      if (type === "WAIT") {
        nodeConfig = {
          delayDays: Number(config?.delayDays ?? body.delayDays ?? 3),
        };
      }

      return tx.campaignFlowNode.create({
        data: {
          campaignId,
          type,
          pitchId,
          config: nodeConfig,
          flowX,
          flowY,
        },
      });
    });

    return NextResponse.json(node);
  } catch (error) {
    console.error("[API] Error creating flow node:", error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}
