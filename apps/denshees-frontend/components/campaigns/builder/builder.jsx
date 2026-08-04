"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import useSWR from "swr";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import fetcher from "@/lib/fetcher";
import { patch, post, remove } from "@/lib/apis";
import UpdateTemplate from "@/components/campaigns/builder/update-template";
import BlockStart from "@/components/campaigns/builder/flow/nodes/block-start";
import BlockEmail from "@/components/campaigns/builder/flow/nodes/block-email";
import BlockWait from "@/components/campaigns/builder/flow/nodes/block-wait";
import BlockEnd from "@/components/campaigns/builder/flow/nodes/block-end";
import { useBlockFlow } from "@/components/campaigns/builder/flow/use-block-flow";
import AutoFit from "@/components/campaigns/builder/flow/auto-fit";
import { BLOCK_HANDLES } from "@/components/campaigns/builder/flow/block-meta";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const nodeTypes = {
  blockStart: BlockStart,
  blockEmail: BlockEmail,
  blockWait: BlockWait,
  blockEnd: BlockEnd,
};

const PALETTE = [
  { type: "EMAIL", label: "+ Email" },
  { type: "WAIT", label: "+ Wait" },
  { type: "END", label: "+ End" },
];

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const Builder = ({ campaign }) => {
  const flowKey = `/api/flow?campaign=${campaign}`;
  const {
    data: flowData,
    isLoading,
    mutate,
  } = useSWR(flowKey, fetcher);
  const { data: contactsData } = useSWR(
    `/api/contacts?campaign=${campaign}`,
    fetcher,
  );

  const [selectedPitch, setSelectedPitch] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const flowNodes = flowData?.nodes || [];
  const wires = flowData?.wires || [];
  const pitches = flowData?.pitches || [];

  const stats = useMemo(
    () => ({
      totalContacts: (contactsData || []).length,
    }),
    [contactsData],
  );

  const handleAddBlock = useCallback(
    async (type) => {
      setBusy(true);
      try {
        const count = flowNodes.filter((n) => n.type === type).length;
        await post("/api/flow/nodes", {
          arg: {
            campaignId: campaign,
            type,
            flowX: 180 + count * 40,
            flowY: 320 + count * 30,
            delayDays: type === "WAIT" ? 3 : 1,
          },
        });
        await mutate();
        toast.success(`${type} block added`);
      } catch (error) {
        toast.error(errorMessage(error, "Could not add block"));
      } finally {
        setBusy(false);
      }
    },
    [campaign, flowNodes, mutate],
  );

  const handleSaveDelay = useCallback(
    async (node, delayDays) => {
      try {
        await patch(`/api/flow/nodes/${node.id}`, {
          arg: { delayDays },
        });
        await mutate();
      } catch (error) {
        toast.error(errorMessage(error, "Could not update delay"));
      }
    },
    [mutate],
  );

  const confirmDeleteNode = useCallback(async () => {
    const node = pendingDelete;
    if (!node) return;
    setPendingDelete(null);
    setBusy(true);
    try {
      await remove(`/api/flow/nodes/${node.id}`);
      if (selectedPitch && node.pitchId === selectedPitch.id) {
        setSelectedPitch(null);
      }
      await mutate();
      toast.success("Block removed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete block"));
    } finally {
      setBusy(false);
    }
  }, [pendingDelete, selectedPitch, mutate]);

  const handlers = useMemo(
    () => ({
      onOpenPitch: setSelectedPitch,
      onDeleteNode: setPendingDelete,
      onSaveDelay: handleSaveDelay,
      busy,
    }),
    [handleSaveDelay, busy],
  );

  const { nodes: graphNodes, edges: graphEdges } = useBlockFlow({
    nodes: flowNodes,
    wires,
    pitches,
    stats,
    handlers,
    selectedPitchId: selectedPitch?.id,
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const structureKey = useMemo(
    () =>
      `${flowNodes.map((n) => n.id).join("|")}::${wires.map((w) => w.id).join("|")}`,
    [flowNodes, wires],
  );

  const nodeById = useMemo(
    () => Object.fromEntries(flowNodes.map((n) => [n.id, n])),
    [flowNodes],
  );

  const onConnect = useCallback(
    async (connection) => {
      const source = nodeById[connection.source];
      if (!source) return;
      const allowed = (BLOCK_HANDLES[source.type]?.outputs || []).map(
        (o) => o.id,
      );
      if (!allowed.includes(connection.sourceHandle)) {
        toast.error("Invalid output pin");
        return;
      }
      if (nodeById[connection.target]?.type === "START") {
        toast.error("Cannot wire into Start");
        return;
      }

      setBusy(true);
      try {
        setEdges((eds) => {
          const filtered = eds.filter(
            (e) =>
              !(
                e.source === connection.source &&
                e.sourceHandle === connection.sourceHandle
              ),
          );
          return addEdge({ ...connection, type: "smoothstep" }, filtered);
        });
        await post("/api/flow/wires", {
          arg: {
            campaignId: campaign,
            sourceNodeId: connection.source,
            sourceHandle: connection.sourceHandle,
            targetNodeId: connection.target,
            targetHandle: connection.targetHandle || "in",
          },
        });
        await mutate();
        toast.success("Wired");
      } catch (error) {
        toast.error(errorMessage(error, "Could not wire"));
        await mutate();
      } finally {
        setBusy(false);
      }
    },
    [nodeById, campaign, mutate, setEdges],
  );

  const onEdgesDelete = useCallback(
    async (deleted) => {
      setBusy(true);
      try {
        for (const edge of deleted) {
          if (edge.id) {
            await remove(`/api/flow/wires/${edge.id}`).catch(() => {});
          }
        }
        await mutate();
      } catch (error) {
        toast.error(errorMessage(error, "Could not delete wire"));
        await mutate();
      } finally {
        setBusy(false);
      }
    },
    [mutate],
  );

  const onNodeDragStop = useCallback(
    async (_e, node) => {
      try {
        await patch(`/api/flow/nodes/${node.id}`, {
          arg: { flowX: node.position.x, flowY: node.position.y },
        });
        mutate(
          (cur) => {
            if (!cur?.nodes) return cur;
            return {
              ...cur,
              nodes: cur.nodes.map((n) =>
                n.id === node.id
                  ? { ...n, flowX: node.position.x, flowY: node.position.y }
                  : n,
              ),
            };
          },
          { revalidate: false },
        );
      } catch {
        toast.error("Could not save position");
      }
    },
    [mutate],
  );

  const isValidConnection = useCallback(
    (connection) => {
      const source = nodeById[connection.source];
      const target = nodeById[connection.target];
      if (!source || !target) return false;
      if (target.type === "START") return false;
      if (connection.source === connection.target) return false;
      const allowed = (BLOCK_HANDLES[source.type]?.outputs || []).map(
        (o) => o.id,
      );
      return allowed.includes(connection.sourceHandle);
    },
    [nodeById],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-lg font-medium">Loading blocks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-grow">
      <div className="relative h-[640px] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-[#f4f4f5]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={onNodeDragStop}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.25}
          maxZoom={1.5}
          connectionLineStyle={{ stroke: "#111827", strokeWidth: 2 }}
        >
          <AutoFit structureKey={structureKey} />
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls />
          <MiniMap pannable zoomable className="!border-2 !border-black" />

          <Panel
            position="top-left"
            className="bg-white p-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-w-[280px]"
          >
            <h3 className="text-sm font-bold">Blocks</h3>
            <p className="mt-1 text-xs text-gray-600 leading-snug">
              Wire freely: Email → Wait → Email → End. Connect Wait branches
              (Replied / Opened / No reply) as needed.
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {PALETTE.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  disabled={busy}
                  onClick={() => handleAddBlock(item.type)}
                  className="w-full text-xs font-bold border-2 border-black px-2 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 text-left"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>

        <AnimatePresence>
          {selectedPitch && (
            <motion.div
              className="absolute inset-0 z-10 bg-white p-4 overflow-auto"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">
                  {selectedPitch.title || "Email"}
                </h3>
                <button
                  onClick={() => setSelectedPitch(null)}
                  className="px-3 py-1 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  Back to flow
                </button>
              </div>
              <UpdateTemplate
                campaign={campaign}
                stage={selectedPitch}
                message={selectedPitch.message}
                subject={selectedPitch.subject}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {busy && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="bg-white px-4 py-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm font-medium">
                Updating...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this block?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.type} block will be deleted with its wires.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteNode}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Builder;
