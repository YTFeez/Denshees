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

// Appends a new follow-up stage to a campaign. The new stage is always added at
// the end (stage = current max + 1) to keep the stage sequence contiguous, and
// Campaign.maxStageCount is bumped in lockstep so the sender's completion cap
// stays in sync with the actual pitch rows.
export async function POST(request) {
  const searchParams = new URL(request.url).searchParams;
  const campaign = searchParams.get("campaign");
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "followup").toLowerCase();
  const delayDays =
    body.delayDays !== undefined && body.delayDays !== null
      ? Number(body.delayDays)
      : kind === "breakup"
        ? 4
        : 3;

  if (!campaign) {
    return NextResponse.json(
      { message: "campaign is required" },
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

    const [pitch] = await prisma.$transaction([
      prisma.pitchEmail.create({
        data: {
          title: template.title,
          message: template.message,
          subject: template.subject,
          campaignId: campaign,
          stage: nextStage,
          delayDays,
        },
      }),
      prisma.campaign.update({
        where: { id: campaign },
        data: { maxStageCount: nextStage + 1 },
      }),
    ]);

    return NextResponse.json(pitch);
  } catch (error) {
    console.error(`[API] Error creating pitch for campaign ${campaign}:`, error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
