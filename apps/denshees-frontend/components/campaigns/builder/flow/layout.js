export const NODE_SIZE = {
  start: { width: 180, height: 72 },
  email: { width: 240, height: 130 },
  wait: { width: 220, height: 168 },
  end: { width: 130, height: 64 },
};

const COL_GAP = 320;
const ROW_GAP = 200;

export function autoLayoutPositions(pitches, flowEdges) {
  const byId = Object.fromEntries(pitches.map((p) => [p.id, p]));
  const positions = {};

  const always = flowEdges.find(
    (e) => e.condition === "ALWAYS" && e.fromPitchId == null,
  );

  const spine = [];
  const seen = new Set();
  let id = always?.toPitchId || null;
  if (!id && pitches.length) {
    const sorted = [...pitches].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
    id = sorted[0]?.id;
  }
  while (id && byId[id] && !seen.has(id)) {
    seen.add(id);
    spine.push(byId[id]);
    const next = flowEdges.find(
      (e) => e.condition === "NO_REPLY" && e.fromPitchId === id && e.toPitchId,
    );
    id = next?.toPitchId || null;
  }

  
  const rest = pitches.filter((p) => !seen.has(p.id));

  spine.forEach((pitch, index) => {
    positions[pitch.id] = { x: index * COL_GAP + 280, y: 180 };
  });

  
  let branchSlot = 0;
  for (const edge of flowEdges) {
    if (!edge.toPitchId || !edge.fromPitchId) continue;
    if (edge.condition === "NO_REPLY" || edge.condition === "ALWAYS") continue;
    if (seen.has(edge.toPitchId) && positions[edge.toPitchId]) continue;
    const parentPos = positions[edge.fromPitchId];
    if (!parentPos) continue;
    const yOff = edge.condition === "OPENED" ? ROW_GAP : -ROW_GAP;
    positions[edge.toPitchId] = {
      x: parentPos.x + COL_GAP * 0.85,
      y: parentPos.y + yOff,
    };
    seen.add(edge.toPitchId);
  }

  rest.forEach((pitch) => {
    if (positions[pitch.id]) return;
    positions[pitch.id] = {
      x: 280 + (spine.length + branchSlot) * 40,
      y: 180 + ROW_GAP * 1.5 + branchSlot * 40,
    };
    branchSlot += 1;
  });

  return positions;
}

export function resolvePitchPosition(pitch, autoPositions) {
  if (
    pitch.flowX != null &&
    pitch.flowY != null &&
    Number.isFinite(pitch.flowX) &&
    Number.isFinite(pitch.flowY)
  ) {
    return { x: pitch.flowX, y: pitch.flowY };
  }
  return autoPositions[pitch.id] || { x: 280, y: 180 };
}
