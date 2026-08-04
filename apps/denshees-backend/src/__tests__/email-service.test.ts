import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/prisma.service.js", () => ({
  prisma: {
    campaignEmail: { update: vi.fn() },
    campaignMessage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../utils/logger.js", () => ({ log: vi.fn() }));

vi.mock("../utils/helpers.js", () => ({
  isValidEmail: vi.fn((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  applyHoganPersonalization: vi.fn(() => ({
    subject: "Test Subject",
    body: "<p>Test body</p>",
  })),
  normalizeEmailBody: vi.fn((html: string) => html),
}));

vi.mock("../utils/credential-service.js", () => ({
  getEmailTransporter: vi.fn(),
}));

vi.mock("../services/campaign-service.js", () => ({
  resolveFlow: vi.fn(),
  updateEmailStatus: vi.fn(),
  createCampaignMessage: vi.fn(),
}));

vi.mock("../services/credential-service.js", () => ({
  getCredentialSentCount: vi.fn(),
}));

vi.mock("html-to-text", () => ({
  htmlToText: vi.fn(() => "plain text"),
}));

import { prisma } from "../services/prisma.service.js";
import { getEmailTransporter } from "../utils/credential-service.js";
import {
  resolveFlow,
  updateEmailStatus,
  createCampaignMessage,
} from "../services/campaign-service.js";
import { getCredentialSentCount } from "../services/credential-service.js";
import { sendCampaignEmail } from "../services/email-service.js";
import type { EmailRecord } from "../models/email.js";

const sendResult = {
  kind: "send" as const,
  pitch: {
    id: "pitch-1",
    subject: "Hello {{name}}",
    message: "<p>Hi {{name}}</p>",
  },
  emailNodeId: "node-email-1",
};

function makeCred(overrides: Record<string, any> = {}) {
  return {
    id: "cred-1",
    host: "smtp.example.com",
    port: 587,
    secure: false,
    username: "sender@example.com",
    password: "secret",
    dailyLimit: 50,
    ...overrides,
  };
}

function makeEmail(overrides: Partial<any> = {}): EmailRecord {
  return {
    id: "email-1",
    email: "recipient@example.com",
    name: "Recipient",
    stage: 0,
    status: "PENDING",
    personalization: {},
    campaign: {
      id: "campaign-1",
      maxStageCount: 3,
      isTrackingEnabled: false,
      user: { id: "user-1", email: "owner@test.com", credits: 10 },
      campaignEmailCredentials: [{ emailCredential: makeCred() }],
    },
    ...overrides,
  } as any;
}

const mockTransporter = {
  sendMail: vi.fn().mockResolvedValue({ messageId: "<msg-123@smtp>" }),
};

function setupHappyPath() {
  vi.mocked(resolveFlow).mockResolvedValue(sendResult);
  vi.mocked(getCredentialSentCount).mockResolvedValue(0);
  vi.mocked(getEmailTransporter).mockReturnValue(mockTransporter as any);
  vi.mocked(prisma.campaignEmail.update).mockResolvedValue({} as any);
  vi.mocked(updateEmailStatus).mockResolvedValue();
  vi.mocked(createCampaignMessage).mockResolvedValue();
  mockTransporter.sendMail.mockResolvedValue({ messageId: "<msg-123@smtp>" });
}

describe("sendCampaignEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  

  it("sends email successfully on happy path", async () => {
    await sendCampaignEmail(makeEmail(), "tx-test");

    expect(resolveFlow).toHaveBeenCalled();
    expect(mockTransporter.sendMail).toHaveBeenCalled();
    expect(updateEmailStatus).toHaveBeenCalled();
    expect(createCampaignMessage).toHaveBeenCalled();
  });

  

  it("marks FAILED when recipient email is missing", async () => {
    const email = makeEmail({ email: null });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
    expect(resolveFlow).not.toHaveBeenCalled();
  });

  it("marks FAILED when recipient email is invalid", async () => {
    const email = makeEmail({ email: "not-an-email" });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("completes when flow resolves to done (no more sends)", async () => {
    vi.mocked(resolveFlow).mockResolvedValue({ kind: "done" });

    await sendCampaignEmail(makeEmail(), "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "COMPLETED" },
    });
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  it("returns early when flow is waiting", async () => {
    vi.mocked(resolveFlow).mockResolvedValue({ kind: "waiting" });

    await sendCampaignEmail(makeEmail(), "tx");

    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  

  it("marks FAILED when campaign has no email credentials", async () => {
    const email = makeEmail({
      campaign: {
        id: "campaign-1",
        maxStageCount: 3,
        isTrackingEnabled: false,
        user: { id: "user-1", email: "o@t.com", credits: 10 },
        campaignEmailCredentials: [],
      },
    });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("returns early (no FAILED) when all credentials at daily limit for stage 0", async () => {
    vi.mocked(getCredentialSentCount).mockResolvedValue(100);

    await sendCampaignEmail(makeEmail(), "tx");

    
    expect(prisma.campaignEmail.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  

  it("marks FAILED for follow-up when credId is missing", async () => {
    const email = makeEmail({
      stage: 1,
      credId: undefined,
    });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  it("succeeds for follow-up when credId is present", async () => {
    const email = makeEmail({
      stage: 1,
      credId: "cred-1",
    });

    await sendCampaignEmail(email, "tx");

    expect(mockTransporter.sendMail).toHaveBeenCalled();
  });

  it("marks FAILED when saved credential not found in campaign creds", async () => {
    const email = makeEmail({
      stage: 1,
      credId: "nonexistent-cred-id",
    });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("returns early (no FAILED) when follow-up credential at daily limit", async () => {
    vi.mocked(getCredentialSentCount).mockResolvedValue(100);

    const email = makeEmail({
      stage: 1,
      credId: "cred-1",
    });

    await sendCampaignEmail(email, "tx");

    
    expect(prisma.campaignEmail.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
  });

  

  it("marks FAILED when credential has no username", async () => {
    const email = makeEmail({
      campaign: {
        id: "campaign-1",
        maxStageCount: 3,
        isTrackingEnabled: false,
        user: { id: "user-1", email: "o@t.com", credits: 10 },
        campaignEmailCredentials: [
          { emailCredential: makeCred({ username: null }) },
        ],
      },
    });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  it("marks FAILED when credential has no password", async () => {
    const email = makeEmail({
      campaign: {
        id: "campaign-1",
        maxStageCount: 3,
        isTrackingEnabled: false,
        user: { id: "user-1", email: "o@t.com", credits: 10 },
        campaignEmailCredentials: [
          { emailCredential: makeCred({ password: null }) },
        ],
      },
    });

    await sendCampaignEmail(email, "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("returns early (no FAILED) when no transporter found", async () => {
    vi.mocked(getEmailTransporter).mockReturnValue(null);

    await sendCampaignEmail(makeEmail(), "tx");

    
    expect(prisma.campaignEmail.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });

  

  it("marks FAILED on EENVELOPE sendMail error", async () => {
    const envelopeError = Object.assign(new Error("Recipient rejected"), {
      code: "EENVELOPE",
    });
    mockTransporter.sendMail.mockRejectedValue(envelopeError);

    await sendCampaignEmail(makeEmail(), "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("does NOT mark FAILED on rate limit error (retryable)", async () => {
    const rateLimitError = Object.assign(new Error("Rate limited"), {
      code: "EAUTH",
      responseCode: 454,
      response: "Too many login attempts, please try again later",
    });
    mockTransporter.sendMail.mockRejectedValue(rateLimitError);

    await sendCampaignEmail(makeEmail(), "tx");

    
    expect(prisma.campaignEmail.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
  });

  

  it("marks FAILED on generic sendMail errors", async () => {
    mockTransporter.sendMail.mockRejectedValue(
      new Error("SMTP connection lost"),
    );

    await sendCampaignEmail(makeEmail(), "tx");

    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { status: "FAILED" },
    });
  });

  

  it("does NOT mark FAILED on unexpected outer error", async () => {
    vi.mocked(resolveFlow).mockRejectedValue(new Error("unexpected crash"));

    await sendCampaignEmail(makeEmail(), "tx");

    
    expect(prisma.campaignEmail.update).not.toHaveBeenCalled();
  });

  

  it("adds tracking pixel when isTrackingEnabled is true", async () => {
    const email = makeEmail({
      campaign: {
        id: "campaign-1",
        maxStageCount: 3,
        isTrackingEnabled: true,
        user: { id: "user-1", email: "o@t.com", credits: 10 },
        campaignEmailCredentials: [{ emailCredential: makeCred() }],
      },
    });

    await sendCampaignEmail(email, "tx");

    const sendCall = mockTransporter.sendMail.mock.calls[0][0];
    expect(sendCall.html).toContain("tracking/open?id=email-1");
  });

  it("does NOT add tracking pixel when isTrackingEnabled is false", async () => {
    await sendCampaignEmail(makeEmail(), "tx");

    const sendCall = mockTransporter.sendMail.mock.calls[0][0];
    expect(sendCall.html).not.toContain("tracking/open");
  });

  

  it("saves selected credential to email record for stage 0", async () => {
    await sendCampaignEmail(makeEmail(), "tx");

    
    expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: { credId: "cred-1" },
    });
  });

  

  it("adds threading headers for follow-up emails (stage > 0)", async () => {
    vi.mocked(prisma.campaignMessage.findFirst).mockResolvedValue({
      messageId: "<original-msg@smtp>",
    } as any);
    vi.mocked(prisma.campaignMessage.findMany).mockResolvedValue([
      { messageId: "<original-msg@smtp>" },
      { messageId: "<reply-msg@smtp>" },
    ] as any);

    const email = makeEmail({ stage: 1, credId: "cred-1" });

    await sendCampaignEmail(email, "tx");

    const sendCall = mockTransporter.sendMail.mock.calls[0][0];
    expect(sendCall.inReplyTo).toBe("<original-msg@smtp>");
    expect(sendCall.references).toEqual([
      "<original-msg@smtp>",
      "<reply-msg@smtp>",
    ]);
  });
});
