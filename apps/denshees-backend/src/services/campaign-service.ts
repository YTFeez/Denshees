

import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma.service.js";
import { log } from "../utils/logger.js";
import type { EmailRecord, PitchRecord } from "../models/email.js";

type FlowNode = {
  id: string;
  type: string;
  pitchId: string | null;
  config: any;
};

type FlowWire = {
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
};

export type FlowResolveResult =
  | { kind: "send"; pitch: PitchRecord; emailNodeId: string }
  | { kind: "waiting" }
  | { kind: "done" }
  | { kind: "idle" };

export async function fetchCampaignEmails(
  emailIds: string[],
  chunkSize = 50,
): Promise<EmailRecord[]> {
  const txId = uuidv4().substring(0, 8);
  log("INFO", `Fetching campaign emails in chunks`, txId, {
    totalEmails: emailIds.length,
    chunkSize,
  });

  const chunkedRequests = [];

  for (let i = 0; i < emailIds.length; i += chunkSize) {
    const chunk = emailIds.slice(i, i + chunkSize);
    chunkedRequests.push(
      prisma.campaignEmail.findMany({
        where: { id: { in: chunk } },
        include: {
          campaign: {
            include: {
              user: true,
              campaignEmailCredentials: {
                include: { emailCredential: true },
              },
            },
          },
        },
      }),
    );
  }

  try {
    const results = await Promise.all(chunkedRequests);
    return results.flat();
  } catch (error: any) {
    log("ERROR", `Error fetching campaign emails`, txId, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

function daysPassed(isoDateString: string | null | undefined): number {
  if (!isoDateString) return Number.POSITIVE_INFINITY;
  const pastDate = new Date(isoDateString);
  if (isNaN(pastDate.getTime())) return 0;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - pastDate.getTime()) / msPerDay);
}

function pickWaitHandle(email: EmailRecord): string[] {
  
  
  
  if (email.status === "REPLIED") return ["replied", "mail"];
  if ((email.opened ?? 0) > 0) return ["opened", "mail"];
  return ["no_reply", "mail"];
}

async function loadFlow(campaignId: string) {
  const [nodes, wires] = await Promise.all([
    prisma.campaignFlowNode.findMany({ where: { campaignId } }),
    prisma.campaignFlowWire.findMany({ where: { campaignId } }),
  ]);
  return {
    nodes: nodes as FlowNode[],
    wires: wires as FlowWire[],
    byId: Object.fromEntries(nodes.map((n) => [n.id, n as FlowNode])),
  };
}

function follow(
  wires: FlowWire[],
  sourceNodeId: string,
  handle: string,
): string | null {
  const w = wires.find(
    (e) => e.sourceNodeId === sourceNodeId && e.sourceHandle === handle,
  );
  return w?.targetNodeId ?? null;
}

export async function resolveFlow(
  email: EmailRecord,
): Promise<FlowResolveResult> {
  const txId = uuidv4().substring(0, 8);
  const campaignId = email.campaign?.id;
  if (!campaignId) return { kind: "idle" };

  try {
    const flow = await loadFlow(campaignId);

    
    if (!flow.nodes.length) {
      const legacy = await resolveLegacyPitch(email, campaignId);
      if (!legacy) return { kind: "done" };
      return {
        kind: "send",
        pitch: legacy,
        emailNodeId: "",
      };
    }

    let nodeId =
      (email as any).currentNodeId ||
      flow.nodes.find((n) => n.type === "START")?.id ||
      null;

    if (!nodeId) return { kind: "idle" };

    const visited = new Set<string>();

    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = flow.byId[nodeId];
      if (!node) return { kind: "idle" };

      if (node.type === "START") {
        nodeId = follow(flow.wires, node.id, "out");
        continue;
      }

      if (node.type === "END") {
        return { kind: "done" };
      }

      if (node.type === "EMAIL") {
        if (!node.pitchId) {
          nodeId = follow(flow.wires, node.id, "out");
          continue;
        }

        const alreadySent = await prisma.campaignMessage.findFirst({
          where: {
            campaignEmailId: email.id,
            pitchId: node.pitchId,
            sent: true,
          },
        });

        if (alreadySent) {
          
          nodeId = follow(flow.wires, node.id, "out");
          continue;
        }

        const pitch = await prisma.pitchEmail.findUnique({
          where: { id: node.pitchId },
        });
        if (!pitch) {
          nodeId = follow(flow.wires, node.id, "out");
          continue;
        }

        log("INFO", `Flow: send pitch via EMAIL node`, txId, {
          nodeId: node.id,
          pitchId: pitch.id,
        });
        return {
          kind: "send",
          pitch: pitch as unknown as PitchRecord,
          emailNodeId: node.id,
        };
      }

      if (node.type === "WAIT") {
        const delayDays = Number(node.config?.delayDays ?? 1);
        const elapsed = daysPassed(email.sentAt?.toISOString?.() ?? null);
        if (elapsed < delayDays) {
          log("INFO", `Flow: waiting on WAIT node`, txId, {
            nodeId: node.id,
            delayDays,
            elapsed,
          });
          return { kind: "waiting" };
        }

        const handles = pickWaitHandle(email);
        let next: string | null = null;
        for (const h of handles) {
          next = follow(flow.wires, node.id, h);
          if (next) {
            log("INFO", `Flow: WAIT branch ${h}`, txId, { next });
            break;
          }
        }
        if (!next) return { kind: "done" };
        nodeId = next;
        continue;
      }

      
      return { kind: "idle" };
    }

    return { kind: "idle" };
  } catch (error: any) {
    log("ERROR", `Error resolving flow`, txId, {
      error: error.message,
      stack: error.stack,
      campaignId,
    });
    return { kind: "idle" };
  }
}

async function resolveLegacyPitch(
  email: EmailRecord,
  campaignId: string,
): Promise<PitchRecord | null> {
  const edges = await prisma.pitchFlowEdge.findMany({ where: { campaignId } });
  if (!edges.length) {
    const result = await prisma.pitchEmail.findFirst({
      where: { stage: email.stage, campaignId },
    });
    return (result as unknown as PitchRecord) || null;
  }

  const currentPitchId = (email as any).currentPitchId ?? null;
  let condition = "ALWAYS";
  let fromPitchId: string | null = null;
  if (!currentPitchId) {
    condition = "ALWAYS";
  } else if (email.status === "REPLIED") {
    condition = "REPLIED";
    fromPitchId = currentPitchId;
  } else if ((email.opened ?? 0) > 0) {
    condition = "OPENED";
    fromPitchId = currentPitchId;
  } else {
    condition = "NO_REPLY";
    fromPitchId = currentPitchId;
  }

  const findEdge = (cond: string, from: string | null) =>
    edges.find(
      (e) =>
        e.condition === cond &&
        (from === null ? e.fromPitchId === null : e.fromPitchId === from),
    );

  let edge = findEdge(condition, fromPitchId);
  if (!edge && condition === "OPENED") edge = findEdge("NO_REPLY", fromPitchId);
  if (!edge?.toPitchId) return null;

  const alreadySent = await prisma.campaignMessage.findFirst({
    where: {
      campaignEmailId: email.id,
      pitchId: edge.toPitchId,
      sent: true,
    },
  });
  if (alreadySent) return null;

  const result = await prisma.pitchEmail.findUnique({
    where: { id: edge.toPitchId },
  });
  return (result as unknown as PitchRecord) || null;
}

export async function fetchPitch(
  email: EmailRecord,
): Promise<PitchRecord | null> {
  const result = await resolveFlow(email);
  return result.kind === "send" ? result.pitch : null;
}

export async function updateEmailStatus(
  email: EmailRecord,
  pitch?: PitchRecord | null,
): Promise<void> {
  const txId = uuidv4().substring(0, 8);

  try {
    const user = email.campaign?.user;

    if (user && user.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: 1 } },
      });
    }

    const sentPitchId = pitch?.id ?? null;
    const nextStage =
      typeof (pitch as any)?.stage === "number"
        ? (pitch as any).stage + 1
        : (email.stage ?? 0) + 1;

    let nextStatus = "RUNNING";
    let nextNodeId: string | null = (email as any).currentNodeId ?? null;

    if (sentPitchId && email.campaign?.id) {
      const flow = await loadFlow(email.campaign.id);
      if (flow.nodes.length) {
        const emailNode = flow.nodes.find(
          (n) => n.type === "EMAIL" && n.pitchId === sentPitchId,
        );
        if (emailNode) {
          nextNodeId = follow(flow.wires, emailNode.id, "out");
          const nextNode = nextNodeId ? flow.byId[nextNodeId] : null;
          if (!nextNode || nextNode.type === "END") {
            nextStatus = "COMPLETED";
            nextNodeId =
              nextNode?.id ||
              flow.nodes.find((n) => n.type === "END")?.id ||
              null;
          }
        }
      } else {
        
        const outgoing = await prisma.pitchFlowEdge.findMany({
          where: {
            campaignId: email.campaign.id,
            fromPitchId: sentPitchId,
            toPitchId: { not: null },
          },
        });
        const hasContinue = outgoing.some((e) =>
          ["NO_REPLY", "OPENED", "REPLIED"].includes(e.condition),
        );
        if (!hasContinue) nextStatus = "COMPLETED";
      }
    } else {
      const maxStage = email.campaign?.maxStageCount || 1;
      nextStatus =
        (email.stage ?? 0) >= maxStage - 1 ? "COMPLETED" : "RUNNING";
    }

    if (email.status === "REPLIED") {
      nextStatus = "REPLIED";
    }

    log("INFO", `Updating email status`, txId, {
      emailId: email.id,
      sentPitchId,
      nextStage,
      nextStatus,
      nextNodeId,
    });

    await prisma.campaignEmail.update({
      where: { id: email.id },
      data: {
        status: nextStatus,
        stage: nextStage,
        currentPitchId: sentPitchId,
        currentNodeId: nextNodeId,
        sentAt: new Date(),
      },
    });
  } catch (error: any) {
    log("ERROR", `Error updating email status`, txId, {
      error: error.message,
      stack: error.stack,
      emailId: email.id,
    });
    throw error;
  }
}

export async function createCampaignMessage(
  email: EmailRecord,
  pitch: PitchRecord,
  messageId: string,
): Promise<void> {
  const txId = uuidv4().substring(0, 8);

  try {
    await prisma.campaignMessage.create({
      data: {
        text: pitch.message || "",
        pitchId: pitch.id,
        sent: true,
        messageId,
        campaignEmailId: email.id,
        timestamp: new Date(),
      },
    });
    log("INFO", `Campaign message created`, txId, {
      emailId: email.id,
      pitchId: pitch.id,
      messageId,
    });
  } catch (error: any) {
    log("ERROR", `Error creating campaign message`, txId, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export async function isLeadReadyToProcess(
  email: any,
): Promise<boolean> {
  const result = await resolveFlow(email);
  return result.kind === "send";
}
