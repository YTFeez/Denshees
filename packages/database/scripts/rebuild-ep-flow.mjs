


import { PrismaClient } from "@denshees/database/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "node:crypto";

const CAMP = "cms7rh4390001lcvtvdsmf783";
const url = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const id = () => `c${randomBytes(12).toString("hex")}`;

const BREAKUP = {
  title: "Email 3 - Break-up humain",
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
  delayDays: 5,
};

async function main() {
  
  await prisma.campaignEmail.updateMany({
    where: { campaignId: CAMP },
    data: { currentNodeId: null },
  });

  await prisma.campaignFlowWire.deleteMany({ where: { campaignId: CAMP } });
  await prisma.campaignFlowNode.deleteMany({ where: { campaignId: CAMP } });

  
  const pitches = await prisma.pitchEmail.findMany({
    where: { campaignId: CAMP },
    orderBy: { stage: "asc" },
  });
  const keep = pitches.filter((p) => p.stage === 0 || p.stage === 1);
  const drop = pitches.filter((p) => p.stage !== 0 && p.stage !== 1);
  for (const p of drop) {
    await prisma.pitchEmail.delete({ where: { id: p.id } }).catch(() => {});
  }

  let e1 = keep.find((p) => p.stage === 0);
  let e2 = keep.find((p) => p.stage === 1);
  if (!e1 || !e2) throw new Error("Missing Email 1/2");

  
  let e3 = await prisma.pitchEmail.findFirst({
    where: { campaignId: CAMP, stage: 2 },
  });
  if (!e3) {
    e3 = await prisma.pitchEmail.create({
      data: {
        campaignId: CAMP,
        stage: 2,
        title: BREAKUP.title,
        subject: BREAKUP.subject,
        message: BREAKUP.message,
        delayDays: BREAKUP.delayDays,
      },
    });
  }

  await prisma.pitchEmail.update({
    where: { id: e2.id },
    data: { delayDays: 3 },
  });
  await prisma.pitchEmail.update({
    where: { id: e3.id },
    data: { delayDays: 5 },
  });
  await prisma.campaign.update({
    where: { id: CAMP },
    data: { maxStageCount: 3 },
  });

  const ordered = [e1, e2, e3];
  const now = new Date();
  const startId = id();
  const endId = id();
  const emailNodes = {};
  const waitNodes = {};
  const nodes = [
    {
      id: startId,
      campaignId: CAMP,
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
      campaignId: CAMP,
      type: "END",
      pitchId: null,
      config: null,
      flowX: 1280,
      flowY: 200,
      created: now,
      updated: now,
    },
  ];

  ordered.forEach((p, i) => {
    const eid = id();
    const wid = id();
    emailNodes[p.id] = eid;
    waitNodes[p.id] = wid;
    const x = 220 + i * 340;
    nodes.push({
      id: eid,
      campaignId: CAMP,
      type: "EMAIL",
      pitchId: p.id,
      config: null,
      flowX: x,
      flowY: 160,
      created: now,
      updated: now,
    });
    const next = ordered[i + 1];
    nodes.push({
      id: wid,
      campaignId: CAMP,
      type: "WAIT",
      pitchId: null,
      config: { delayDays: next?.delayDays ?? 3 },
      flowX: x + 150,
      flowY: 180,
      created: now,
      updated: now,
    });
  });

  const wires = [];
  const wire = (sourceNodeId, sourceHandle, targetNodeId) => {
    wires.push({
      id: id(),
      campaignId: CAMP,
      sourceNodeId,
      sourceHandle,
      targetNodeId,
      targetHandle: "in",
      created: now,
      updated: now,
    });
  };

  wire(startId, "out", emailNodes[e1.id]);
  ordered.forEach((p, i) => {
    const next = ordered[i + 1];
    wire(emailNodes[p.id], "out", waitNodes[p.id]);
    wire(waitNodes[p.id], "replied", endId);
    wire(waitNodes[p.id], "opened", endId); 
    if (next) {
      wire(waitNodes[p.id], "no_reply", emailNodes[next.id]);
      
    } else {
      wire(waitNodes[p.id], "no_reply", endId);
    }
  });

  await prisma.campaignFlowNode.createMany({ data: nodes });
  await prisma.campaignFlowWire.createMany({ data: wires });

  
  const leads = await prisma.campaignEmail.findMany({ where: { campaignId: CAMP } });
  for (const lead of leads) {
    let nodeId = startId;
    if (lead.status === "COMPLETED") nodeId = endId;
    else if (lead.currentPitchId && waitNodes[lead.currentPitchId]) {
      nodeId = waitNodes[lead.currentPitchId];
    }
    await prisma.campaignEmail.update({
      where: { id: lead.id },
      data: { currentNodeId: nodeId },
    });
  }

  console.log(
    `EP rebuilt: ${nodes.length} nodes, ${wires.length} wires, ${leads.length} leads`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
