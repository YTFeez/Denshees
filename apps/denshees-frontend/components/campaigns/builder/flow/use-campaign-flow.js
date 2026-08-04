import { useMemo } from "react";
import { MarkerType } from "@xyflow/react";
import {
  NODE_SIZE,
  autoLayoutPositions,
  resolvePitchPosition,
} from "./layout";
import {
  CONDITION_COLORS,
  END_NODE_ID,
  START_NODE_ID,
} from "./pins";

const sized = (type, node) => ({ ...node, ...NODE_SIZE[type] });

function pitchLabel(pitch, indexHint) {
  if ((pitch.stage ?? 0) === 0) return "First email";
  return pitch.title || `Email ${indexHint ?? pitch.stage}`;
}

export function useCampaignFlow({
  pitches,
  flowEdges = [],
  stats,
  handlers,
  selectedPitchId,
}) {
  return useMemo(() => {
    if (!pitches?.length && !flowEdges.length) {
      
      return {
        nodes: [
          sized("start", {
            id: START_NODE_ID,
            type: "start",
            position: { x: 40, y: 180 },
            data: { totalContacts: stats.totalContacts },
            draggable: false,
          }),
          sized("end", {
            id: END_NODE_ID,
            type: "end",
            position: { x: 400, y: 190 },
            data: {},
            draggable: false,
          }),
        ],
        edges: [],
      };
    }

    const autoPositions = autoLayoutPositions(pitches, flowEdges);
    const byId = Object.fromEntries(pitches.map((p) => [p.id, p]));

    const nodes = [
      sized("start", {
        id: START_NODE_ID,
        type: "start",
        position: { x: 40, y: 180 },
        data: { totalContacts: stats.totalContacts },
        draggable: false,
      }),
    ];

    pitches.forEach((pitch, index) => {
      const stageIndex = pitch.stage ?? index;
      nodes.push(
        sized("email", {
          id: `email-${pitch.id}`,
          type: "email",
          position: resolvePitchPosition(pitch, autoPositions),
          data: {
            label: pitchLabel(pitch, stageIndex),
            pitch,
            isSelected: selectedPitchId === pitch.id,
            isDeletable: (pitch.stage ?? 0) > 0,
            onOpen: handlers.onOpenPitch,
            onDelete: handlers.onDeletePitch,
            contactCount: stats.contactsPerStage[stageIndex] ?? 0,
            replyCount: stats.repliesPerStage[stageIndex] ?? 0,
            totalContacts: stats.totalContacts,
          },
          draggable: true,
        }),
      );
    });

    
    let maxX = 400;
    let avgY = 180;
    let count = 0;
    nodes.forEach((n) => {
      if (n.type !== "email") return;
      maxX = Math.max(maxX, n.position.x + (n.width || 260));
      avgY += n.position.y;
      count += 1;
    });
    avgY = count ? avgY / count : 190;

    nodes.push(
      sized("end", {
        id: END_NODE_ID,
        type: "end",
        position: { x: maxX + 120, y: avgY },
        data: {},
        draggable: false,
      }),
    );

    const edges = [];
    for (const edge of flowEdges) {
      const condition = edge.condition;
      const color = CONDITION_COLORS[condition] || "#111827";
      const source =
        edge.fromPitchId == null
          ? START_NODE_ID
          : `email-${edge.fromPitchId}`;
      const target = edge.toPitchId
        ? `email-${edge.toPitchId}`
        : END_NODE_ID;

      
      if (edge.fromPitchId && !byId[edge.fromPitchId]) continue;
      if (edge.toPitchId && !byId[edge.toPitchId]) continue;

      const targetPitch = edge.toPitchId ? byId[edge.toPitchId] : null;
      const delayLabel =
        targetPitch && condition !== "ALWAYS"
          ? `+${targetPitch.delayDays ?? 1}d`
          : null;

      edges.push({
        id: `flow-${edge.id}`,
        source,
        sourceHandle: condition,
        target,
        targetHandle: "in",
        type: "smoothstep",
        animated: condition !== "ALWAYS",
        label: delayLabel
          ? `${condition.replace("_", " ")} · ${delayLabel}`
          : condition === "ALWAYS"
            ? "Start"
            : condition.replace("_", " "),
        labelStyle: { fontSize: 10, fontWeight: 600, fill: color },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92 },
        style: { stroke: color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: {
          edgeId: edge.id,
          condition,
          fromPitchId: edge.fromPitchId,
          toPitchId: edge.toPitchId,
        },
      });
    }

    return { nodes, edges };
  }, [pitches, flowEdges, stats, handlers, selectedPitchId]);
}
