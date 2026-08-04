import { useMemo } from "react";
import { MarkerType } from "@xyflow/react";
import { HANDLE_COLORS, NODE_SIZE } from "./block-meta";

const typeToRf = {
  START: "blockStart",
  EMAIL: "blockEmail",
  WAIT: "blockWait",
  END: "blockEnd",
};

const sizeKey = {
  START: "start",
  EMAIL: "email",
  WAIT: "wait",
  END: "end",
};



export function useBlockFlow({
  nodes: flowNodes = [],
  wires = [],
  pitches = [],
  stats,
  handlers,
  selectedPitchId,
}) {
  return useMemo(() => {
    const pitchById = Object.fromEntries(pitches.map((p) => [p.id, p]));

    const nodes = flowNodes.map((node) => {
      const key = sizeKey[node.type] || "email";
      const size = NODE_SIZE[key];
      const pitch = node.pitchId ? pitchById[node.pitchId] : null;
      const rfType = typeToRf[node.type] || "blockEmail";

      return {
        id: node.id,
        type: rfType,
        position: {
          x: node.flowX ?? 100,
          y: node.flowY ?? 100,
        },
        width: size.width,
        height: size.height,
        draggable: node.type !== "START",
        data: {
          node,
          pitch,
          totalContacts: stats.totalContacts,
          isSelected: pitch && selectedPitchId === pitch.id,
          canDelete: node.type !== "START" && node.type !== "END",
          onOpen: handlers.onOpenPitch,
          onDelete: handlers.onDeleteNode,
          onSaveDelay: handlers.onSaveDelay,
        },
      };
    });

    const edges = wires.map((wire) => {
      const color = HANDLE_COLORS[wire.sourceHandle] || "#111827";
      const isBranch = ["replied", "opened", "no_reply", "mail", "resend"].includes(
        wire.sourceHandle,
      );
      return {
        id: wire.id,
        source: wire.sourceNodeId,
        sourceHandle: wire.sourceHandle,
        target: wire.targetNodeId,
        targetHandle: wire.targetHandle || "in",
        type: "smoothstep",
        animated: isBranch,
        
        label: isBranch ? wire.sourceHandle.replace("_", " ") : undefined,
        labelStyle: isBranch
          ? { fontSize: 10, fontWeight: 600, fill: color }
          : undefined,
        labelBgStyle: isBranch
          ? { fill: "#fff", fillOpacity: 0.92 }
          : undefined,
        style: { stroke: color, strokeWidth: isBranch ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: { wireId: wire.id },
      };
    });

    return { nodes, edges };
  }, [flowNodes, wires, pitches, stats, handlers, selectedPitchId]);
}
