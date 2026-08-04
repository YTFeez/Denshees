


import { PrismaClient } from "@denshees/database/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

function id() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function migrateCampaign(campaignId) {
  const existing = await prisma.campaignFlowNode.count({
    where: { campaignId },
  });
  if (existing > 0) {
    console.log(`skip ${campaignId} (already has ${existing} nodes)`);
    return;
  }

  const pitches = await prisma.pitchEmail.findMany({
    where: { campaignId },
    orderBy: { stage: "asc" },
  });
  if (!pitches.length) {
    console.log(`skip ${campaignId} (no pitches)`);
    return;
  }

  const edges = await prisma.pitchFlowEdge.findMany({
    where: { campaignId },
  });

  const now = new Date();
  const startId = id();
  const endId = id();
  const emailByPitch = {};
  const waitByPitch = {};

  const nodes = [
    {
      id: startId,
      campaignId,
      type: "START",
      pitchId: null,
      config: null,
      flowX: 40,
      flowY: 200,
      created: now,
      updated: now,
    },
    {
      id: endId,
      campaignId,
      type: "END",
      pitchId: null,
      config: null,
      flowX: 40 + pitches.length * 360 + 280,
      flowY: 200,
      created: now,
      updated: now,
    },
  ];

  pitches.forEach((p, i) => {
    const emailNodeId = id();
    const waitNodeId = id();
    emailByPitch[p.id] = emailNodeId;
    waitByPitch[p.id] = waitNodeId;

    const baseX = 280 + i * 360;
    nodes.push({
      id: emailNodeId,
      campaignId,
      type: "EMAIL",
      pitchId: p.id,
      config: null,
      flowX: p.flowX ?? baseX,
      flowY: p.flowY ?? 180,
      created: now,
      updated: now,
    });

    
    const nr = edges.find(
      (e) => e.fromPitchId === p.id && e.condition === "NO_REPLY",
    );
    const target = nr?.toPitchId
      ? pitches.find((x) => x.id === nr.toPitchId)
      : null;
    const delayDays = target?.delayDays ?? p.delayDays ?? 1;

    nodes.push({
      id: waitNodeId,
      campaignId,
      type: "WAIT",
      pitchId: null,
      config: { delayDays },
      flowX: (p.flowX ?? baseX) + 160,
      flowY: (p.flowY ?? 180) + 20,
      created: now,
      updated: now,
    });
  });

  const wires = [];
  const wire = (sourceNodeId, sourceHandle, targetNodeId) => {
    wires.push({
      id: id(),
      campaignId,
      sourceNodeId,
      sourceHandle,
      targetNodeId,
      targetHandle: "in",
      created: now,
      updated: now,
    });
  };

  
  const always = edges.find(
    (e) => e.condition === "ALWAYS" && e.fromPitchId == null,
  );
  const firstPitchId = always?.toPitchId || pitches[0].id;
  wire(startId, "out", emailByPitch[firstPitchId]);

  for (const p of pitches) {
    const emailNodeId = emailByPitch[p.id];
    const waitNodeId = waitByPitch[p.id];
    
    wire(emailNodeId, "out", waitNodeId);

    const outs = edges.filter((e) => e.fromPitchId === p.id);
    const byCond = Object.fromEntries(outs.map((e) => [e.condition, e]));

    for (const [handle, cond] of [
      ["replied", "REPLIED"],
      ["opened", "OPENED"],
      ["no_reply", "NO_REPLY"],
    ]) {
      const e = byCond[cond];
      if (!e) {
        wire(waitNodeId, handle, endId);
        continue;
      }
      if (!e.toPitchId) {
        wire(waitNodeId, handle, endId);
      } else if (emailByPitch[e.toPitchId]) {
        wire(waitNodeId, handle, emailByPitch[e.toPitchId]);
      } else {
        wire(waitNodeId, handle, endId);
      }
    }
    
  }

  await prisma.$transaction([
    prisma.campaignFlowNode.createMany({ data: nodes }),
    prisma.campaignFlowWire.createMany({ data: wires }),
  ]);

  
  const leads = await prisma.campaignEmail.findMany({
    where: { campaignId },
    select: { id: true, currentPitchId: true, status: true },
  });

  for (const lead of leads) {
    let nodeId = startId;
    if (lead.currentPitchId && waitByPitch[lead.currentPitchId]) {
      nodeId = waitByPitch[lead.currentPitchId];
    }
    if (lead.status === "COMPLETED") {
      nodeId = endId;
    }
    await prisma.campaignEmail.update({
      where: { id: lead.id },
      data: { currentNodeId: nodeId },
    });
  }

  console.log(
    `migrated ${campaignId}: ${nodes.length} nodes, ${wires.length} wires, ${leads.length} leads`,
  );
}

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { deleted: false },
    select: { id: true, title: true },
  });
  for (const c of campaigns) {
    await migrateCampaign(c.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
