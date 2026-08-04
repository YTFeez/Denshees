import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncCrmAfterAppReply } from "@/lib/crm-sync";

export async function POST(request, { params }) {
  const campaignId = params.campaign_id;

  try {
    const { campaignEmailId, text, messageId } = await request.json();

    if (!campaignEmailId || !text) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    const campaignEmail = await prisma.campaignEmail.findUnique({
      where: { id: campaignEmailId },
      include: {
        cred: true,
        currentPitch: true,
        campaignMessages: {
          where: { sent: true },
          orderBy: { created: "desc" },
          take: 20,
          select: { messageId: true, pitchId: true },
        },
      },
    });

    if (!campaignEmail) {
      return NextResponse.json(
        { message: "Campaign email not found" },
        { status: 404 },
      );
    }

    if (campaignEmail.campaignId && campaignEmail.campaignId !== campaignId) {
      return NextResponse.json(
        { message: "Lead does not belong to this campaign" },
        { status: 400 },
      );
    }

    const recipientEmail = campaignEmail.email;
    const recipientName = campaignEmail.name;

    if (!campaignEmail.cred) {
      return NextResponse.json(
        { message: "No email credentials found for this contact" },
        { status: 404 },
      );
    }

    const emailCredential = campaignEmail.cred;

    
    const lastSent = campaignEmail.campaignMessages?.[0];
    const replyToId = messageId || lastSent?.messageId || null;
    const references = (campaignEmail.campaignMessages || [])
      .map((m) => m.messageId)
      .filter(Boolean);

    let subjectBase =
      campaignEmail.currentPitch?.subject ||
      recipientName ||
      "Your message";
    if (lastSent?.pitchId) {
      const pitch = await prisma.pitchEmail.findUnique({
        where: { id: lastSent.pitchId },
        select: { subject: true },
      });
      if (pitch?.subject) subjectBase = pitch.subject;
    }
    const subject = subjectBase.startsWith("Re:")
      ? subjectBase
      : `Re: ${subjectBase}`;

    const transporter = nodemailer.createTransport({
      host: emailCredential.host,
      port: emailCredential.port,
      secure: emailCredential.secure,
      auth: {
        user: emailCredential.username,
        pass: emailCredential.password,
      },
    });

    const mailOptions = {
      from: emailCredential.username,
      to: recipientEmail,
      subject,
      text,
    };
    if (replyToId) {
      mailOptions.inReplyTo = replyToId;
      mailOptions.references = references.length
        ? references.join(" ")
        : replyToId;
    }

    const info = await transporter.sendMail(mailOptions);

    await prisma.campaignMessage.create({
      data: {
        text,
        pitchId: lastSent?.pitchId || campaignEmail.currentPitchId || null,
        sent: true,
        messageId: info.messageId || null,
        campaignEmailId: campaignEmail.id,
        timestamp: new Date(),
      },
    });

    try {
      await syncCrmAfterAppReply(prisma, campaignEmail.id, text);
    } catch (crmErr) {
      console.error("[API] CRM sync after reply failed:", crmErr);
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId || null,
    });
  } catch (error) {
    console.error(
      `[API] Error sending reply for campaign ${campaignId}:`,
      error,
    );
    return NextResponse.json(
      { message: error?.message || "Failed to send reply" },
      { status: 500 },
    );
  }
}
