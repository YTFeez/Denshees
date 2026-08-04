


export async function seedFlowGraphFromPitches(prisma, campaignId, pitches) {
  if (!pitches?.length) return;

  const existing = await prisma.campaignFlowNode.count({
    where: { campaignId },
  });
  if (existing > 0) return;

  const start = await prisma.campaignFlowNode.create({
    data: {
      campaignId,
      type: "START",
      flowX: 40,
      flowY: 200,
    },
  });
  const end = await prisma.campaignFlowNode.create({
    data: {
      campaignId,
      type: "END",
      flowX: 40 + pitches.length * 340 + 200,
      flowY: 200,
    },
  });

  const emailByPitch = {};
  const waitByPitch = {};

  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i];
    const baseX = 220 + i * 340;
    const emailNode = await prisma.campaignFlowNode.create({
      data: {
        campaignId,
        type: "EMAIL",
        pitchId: p.id,
        flowX: baseX,
        flowY: 160,
      },
    });
    emailByPitch[p.id] = emailNode.id;

    const next = pitches[i + 1];
    const delayDays = next?.delayDays ?? p.delayDays ?? 3;
    const waitNode = await prisma.campaignFlowNode.create({
      data: {
        campaignId,
        type: "WAIT",
        config: { delayDays },
        flowX: baseX + 150,
        flowY: 180,
      },
    });
    waitByPitch[p.id] = waitNode.id;
  }

  const wire = (sourceNodeId, sourceHandle, targetNodeId) =>
    prisma.campaignFlowWire.create({
      data: {
        campaignId,
        sourceNodeId,
        sourceHandle,
        targetNodeId,
        targetHandle: "in",
      },
    });

  await wire(start.id, "out", emailByPitch[pitches[0].id]);

  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i];
    const next = pitches[i + 1];
    const emailId = emailByPitch[p.id];
    const waitId = waitByPitch[p.id];
    await wire(emailId, "out", waitId);
    await wire(waitId, "replied", end.id);
    await wire(waitId, "opened", end.id);
    if (next) {
      await wire(waitId, "no_reply", emailByPitch[next.id]);
    } else {
      await wire(waitId, "no_reply", end.id);
    }
    
  }
}
