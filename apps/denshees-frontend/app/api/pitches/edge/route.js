import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CONDITIONS = ["ALWAYS", "REPLIED", "OPENED", "NO_REPLY"];


async function wouldCreateCycle(campaignId, fromPitchId, toPitchId) {
  if (!toPitchId || !fromPitchId) return false;
  if (fromPitchId === toPitchId) return true;

  const edges = await prisma.pitchFlowEdge.findMany({
    where: { campaignId, toPitchId: { not: null } },
    select: { fromPitchId: true, toPitchId: true },
  });

  const adj = new Map();
  for (const e of edges) {
    if (!e.fromPitchId || !e.toPitchId) continue;
    if (!adj.has(e.fromPitchId)) adj.set(e.fromPitchId, []);
    adj.get(e.fromPitchId).push(e.toPitchId);
  }
  
  if (!adj.has(fromPitchId)) adj.set(fromPitchId, []);
  adj.get(fromPitchId).push(toPitchId);

  const seen = new Set();
  const stack = [toPitchId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === fromPitchId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) || []) stack.push(next);
  }
  return false;
}


export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const campaignId = body.campaignId || body.campaign;
  const condition = String(body.condition || "").toUpperCase();
  const fromPitchId =
    body.fromPitchId === undefined || body.fromPitchId === ""
      ? null
      : body.fromPitchId;
  const toPitchId =
    body.toPitchId === undefined || body.toPitchId === ""
      ? null
      : body.toPitchId;

  if (!campaignId) {
    return NextResponse.json(
      { message: "campaignId is required" },
      { status: 400 },
    );
  }
  if (!CONDITIONS.includes(condition)) {
    return NextResponse.json(
      { message: "invalid condition" },
      { status: 400 },
    );
  }

  if (condition === "ALWAYS" && fromPitchId !== null) {
    return NextResponse.json(
      { message: "ALWAYS must start from Campaign start" },
      { status: 400 },
    );
  }

  if (condition !== "ALWAYS" && !fromPitchId) {
    return NextResponse.json(
      { message: "fromPitchId required for this condition" },
      { status: 400 },
    );
  }

  try {
    if (toPitchId && (await wouldCreateCycle(campaignId, fromPitchId, toPitchId))) {
      return NextResponse.json(
        { message: "This connection would create a cycle" },
        { status: 400 },
      );
    }

    const existing = await prisma.pitchFlowEdge.findFirst({
      where: { campaignId, fromPitchId, condition },
    });

    const edge = existing
      ? await prisma.pitchFlowEdge.update({
          where: { id: existing.id },
          data: { toPitchId },
        })
      : await prisma.pitchFlowEdge.create({
          data: { campaignId, fromPitchId, toPitchId, condition },
        });

    return NextResponse.json(edge);
  } catch (error) {
    console.error("[API] Error upserting pitch flow edge:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
