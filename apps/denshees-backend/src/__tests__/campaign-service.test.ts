import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/prisma.service.js", () => ({
  prisma: {
    campaignEmail: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pitchEmail: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    pitchFlowEdge: {
      findMany: vi.fn(),
    },
    campaignFlowNode: {
      findMany: vi.fn(),
    },
    campaignFlowWire: {
      findMany: vi.fn(),
    },
    campaignMessage: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock("../utils/logger.js", () => ({
  log: vi.fn(),
}));

import { prisma } from "../services/prisma.service.js";
import {
  fetchCampaignEmails,
  fetchPitch,
  resolveFlow,
  updateEmailStatus,
  createCampaignMessage,
} from "../services/campaign-service.js";
import type { EmailRecord, PitchRecord } from "../models/email.js";

function makeEmail(overrides: Partial<EmailRecord> = {}): EmailRecord {
  return {
    id: "email-1",
    email: "test@example.com",
    name: "Test User",
    stage: 0,
    status: "PENDING",
    personalization: {},
    campaign: {
      id: "campaign-1",
      maxStageCount: 3,
      user: { id: "user-1", email: "owner@example.com", credits: 10 },
    },
    ...overrides,
  };
}

function makePitch(overrides: Partial<PitchRecord> = {}): PitchRecord {
  return {
    id: "pitch-1",
    subject: "Hello {{name}}",
    message: "<p>Hi {{name}}</p>",
    ...overrides,
  };
}

describe("fetchCampaignEmails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns campaign emails from prisma", async () => {
    const fakeEmails = [makeEmail()];
    vi.mocked(prisma.campaignEmail.findMany).mockResolvedValue(
      fakeEmails as any,
    );

    const result = await fetchCampaignEmails(["email-1"]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("email-1");
  });
});

describe("resolveFlow / fetchPitch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.campaignMessage.findFirst).mockResolvedValue(null);
  });

  it("legacy stage lookup when no flow nodes and no edges", async () => {
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([]);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([]);
    vi.mocked(prisma.pitchFlowEdge.findMany).mockResolvedValue([]);
    vi.mocked(prisma.pitchEmail.findFirst).mockResolvedValue(null);

    await fetchPitch(makeEmail());

    expect(prisma.pitchEmail.findFirst).toHaveBeenCalled();
  });

  it("sends EMAIL node pitch from Start", async () => {
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([
      { id: "n-start", type: "START", pitchId: null, config: null },
      { id: "n-email", type: "EMAIL", pitchId: "pitch-1", config: null },
    ] as any);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([
      {
        sourceNodeId: "n-start",
        sourceHandle: "out",
        targetNodeId: "n-email",
      },
    ] as any);
    vi.mocked(prisma.pitchEmail.findUnique).mockResolvedValue(
      makePitch() as any,
    );

    const result = await resolveFlow(
      makeEmail({ currentNodeId: "n-start" } as any),
    );

    expect(result.kind).toBe("send");
    if (result.kind === "send") {
      expect(result.pitch.id).toBe("pitch-1");
    }
  });

  it("WAIT returns waiting when delay not elapsed", async () => {
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([
      {
        id: "n-wait",
        type: "WAIT",
        pitchId: null,
        config: { delayDays: 5 },
      },
    ] as any);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([]);

    const result = await resolveFlow(
      makeEmail({
        currentNodeId: "n-wait",
        sentAt: new Date(),
        status: "RUNNING",
      } as any),
    );

    expect(result.kind).toBe("waiting");
  });

  it("WAIT opened does not fall through to no_reply", async () => {
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([
      {
        id: "n-wait",
        type: "WAIT",
        pitchId: null,
        config: { delayDays: 0 },
      },
      { id: "n-end", type: "END", pitchId: null, config: null },
      {
        id: "n-email2",
        type: "EMAIL",
        pitchId: "pitch-2",
        config: null,
      },
    ] as any);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([
      {
        sourceNodeId: "n-wait",
        sourceHandle: "opened",
        targetNodeId: "n-end",
      },
      {
        sourceNodeId: "n-wait",
        sourceHandle: "no_reply",
        targetNodeId: "n-email2",
      },
    ] as any);

    const result = await resolveFlow(
      makeEmail({
        currentNodeId: "n-wait",
        status: "RUNNING",
        opened: 1,
        sentAt: new Date(Date.now() - 86400000 * 2),
      } as any),
    );

    expect(result.kind).toBe("done");
  });

  it("WAIT replied goes to END → done", async () => {
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([
      {
        id: "n-wait",
        type: "WAIT",
        pitchId: null,
        config: { delayDays: 0 },
      },
      { id: "n-end", type: "END", pitchId: null, config: null },
    ] as any);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([
      {
        sourceNodeId: "n-wait",
        sourceHandle: "replied",
        targetNodeId: "n-end",
      },
    ] as any);

    const result = await resolveFlow(
      makeEmail({
        currentNodeId: "n-wait",
        status: "REPLIED",
        sentAt: new Date(Date.now() - 86400000 * 2),
      } as any),
    );

    expect(result.kind).toBe("done");
  });
});

describe("updateEmailStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("advances to Wait after Email.out", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.campaignEmail.update).mockResolvedValue({} as any);
    vi.mocked(prisma.campaignFlowNode.findMany).mockResolvedValue([
      { id: "n-email", type: "EMAIL", pitchId: "pitch-1", config: null },
      { id: "n-wait", type: "WAIT", pitchId: null, config: { delayDays: 3 } },
    ] as any);
    vi.mocked(prisma.campaignFlowWire.findMany).mockResolvedValue([
      {
        sourceNodeId: "n-email",
        sourceHandle: "out",
        targetNodeId: "n-wait",
      },
    ] as any);

    await updateEmailStatus(
      makeEmail(),
      makePitch({ id: "pitch-1", stage: 0 } as any),
    );

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        currentPitchId: "pitch-1",
        currentNodeId: "n-wait",
        status: "RUNNING",
      }),
    });
  });
});

describe("createCampaignMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates message record", async () => {
    vi.mocked(prisma.campaignMessage.create).mockResolvedValue({} as any);
    await createCampaignMessage(makeEmail(), makePitch(), "msg-1");
    expect(prisma.campaignMessage.create).toHaveBeenCalled();
  });
});
