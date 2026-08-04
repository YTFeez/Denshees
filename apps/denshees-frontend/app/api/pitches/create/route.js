import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const TEMPLATES = {
  followup: {
    title: (stage) => `Follow-up ${stage}`,
    subject: "Re: {{name}} — un petit suivi",
    message: `Bonjour {{name}},

Je me permets un petit message de suivi, sans pressure.

Si mon précédent mail est passé à côté, dites-moi simplement si le sujet peut vous parler — même un court « ok » ou « pas maintenant » m'aide.

Merci,
Daniel Ferras
EP Digital

—
Répondez « stop » pour ne plus recevoir de message.`,
  },
  breakup: {
    title: (stage) => `Break-up ${stage}`,
    subject: "Je m'arrête là, {{name}}",
    message: `Bonjour {{name}},

Dernier message de ma part — promis.

Si le sujet n'est pas d'actualité pour vous, je m'arrête là, aucun souci.
Si un jour vous voulez en reparler, répondez quand vous voulez.

Bonne continuation,
Daniel Ferras
EP Digital

—
Répondez « stop » si vous voulez sortir de la liste.`,
  },
};

function resolveTemplate(kind, nextStage, body) {
  const key = kind === "breakup" ? "breakup" : "followup";
  const base = TEMPLATES[key];
  return {
    title: body.title || base.title(nextStage),
    subject: body.subject || base.subject,
    message: body.message || base.message,
  };
}

async function resolveFromPitchId(campaignId, condition, fromPitchId) {
  if (fromPitchId) return fromPitchId;
  if (condition === "ALWAYS") return null;

  const always = await prisma.pitchFlowEdge.findFirst({
    where: { campaignId, condition: "ALWAYS", fromPitchId: null },
  });
  if (!always?.toPitchId) {
    const last = await prisma.pitchEmail.findFirst({
      where: { campaignId },
      orderBy: { stage: "desc" },
      select: { id: true },
    });
    return last?.id ?? null;
  }

  let id = always.toPitchId;
  let lastId = id;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    lastId = id;
    const next = await prisma.pitchFlowEdge.findFirst({
      where: { campaignId, condition: "NO_REPLY", fromPitchId: id },
    });
    id = next?.toPitchId || null;
  }
  return lastId;
}

async function seedDefaultOutEdges(tx, campaignId, pitchId) {
  for (const cond of ["REPLIED", "OPENED", "NO_REPLY"]) {
    const has = await tx.pitchFlowEdge.findFirst({
      where: { campaignId, fromPitchId: pitchId, condition: cond },
    });
    if (!has) {
      await tx.pitchFlowEdge.create({
        data: {
          campaignId,
          fromPitchId: pitchId,
          toPitchId: null,
          condition: cond,
        },
      });
    }
  }
}

export async function POST(request) {
  const searchParams = new URL(request.url).searchParams;
  const campaign = searchParams.get("campaign");
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "followup").toLowerCase();
  const orphan = Boolean(body.orphan);
  const conditionRaw = body.condition;
  const condition = orphan
    ? null
    : String(conditionRaw || "NO_REPLY").toUpperCase();
  const delayDays =
    body.delayDays !== undefined && body.delayDays !== null
      ? Number(body.delayDays)
      : 3;
  const flowX =
    body.flowX !== undefined && body.flowX !== null ? Number(body.flowX) : null;
  const flowY =
    body.flowY !== undefined && body.flowY !== null ? Number(body.flowY) : null;

  if (!campaign) {
    return NextResponse.json(
      { message: "campaign is required" },
      { status: 400 },
    );
  }

  if (
    !orphan &&
    !["ALWAYS", "REPLIED", "OPENED", "NO_REPLY"].includes(condition)
  ) {
    return NextResponse.json(
      { message: "invalid condition" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(delayDays) || delayDays < 0) {
    return NextResponse.json(
      { message: "delayDays must be a non-negative number" },
      { status: 400 },
    );
  }

  try {
    const last = await prisma.pitchEmail.findFirst({
      where: { campaignId: campaign },
      orderBy: { stage: "desc" },
      select: { stage: true },
    });

    const nextStage = (last?.stage ?? -1) + 1;
    const template = resolveTemplate(kind, nextStage, body);

    let fromPitchId = null;
    if (!orphan) {
      fromPitchId = await resolveFromPitchId(
        campaign,
        condition,
        body.fromPitchId || null,
      );
      if (condition !== "ALWAYS" && !fromPitchId) {
        return NextResponse.json(
          { message: "fromPitchId required (or create first email)" },
          { status: 400 },
        );
      }
    }

    const pitch = await prisma.$transaction(async (tx) => {
      const created = await tx.pitchEmail.create({
        data: {
          title: template.title,
          message: template.message,
          subject: template.subject,
          campaignId: campaign,
          stage: nextStage,
          delayDays,
          flowX: Number.isFinite(flowX) ? flowX : null,
          flowY: Number.isFinite(flowY) ? flowY : null,
        },
      });

      await tx.campaign.update({
        where: { id: campaign },
        data: { maxStageCount: nextStage + 1 },
      });

      if (!orphan) {
        const existing = await tx.pitchFlowEdge.findFirst({
          where: {
            campaignId: campaign,
            fromPitchId,
            condition,
          },
        });

        if (existing) {
          await tx.pitchFlowEdge.update({
            where: { id: existing.id },
            data: { toPitchId: created.id },
          });
        } else {
          await tx.pitchFlowEdge.create({
            data: {
              campaignId: campaign,
              fromPitchId,
              toPitchId: created.id,
              condition,
            },
          });
        }
      }

      await seedDefaultOutEdges(tx, campaign, created.id);

      return created;
    });

    return NextResponse.json(pitch);
  } catch (error) {
    console.error(`[API] Error creating pitch for campaign ${campaign}:`, error);
    return NextResponse.json(
      {
        message: "Something went wrong",
        detail: process.env.NODE_ENV !== "production" ? String(error?.message || error) : undefined,
      },
      { status: 500 },
    );
  }
}
