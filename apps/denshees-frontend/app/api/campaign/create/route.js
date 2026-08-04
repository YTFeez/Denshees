import { jwtDecode } from "jwt-decode";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { seedFlowGraphFromPitches } from "@/lib/seed-flow-graph";

const DEFAULT_STAGE_COUNT = 4;
const DEFAULT_DELAY_DAYS = 1;

export async function POST(request) {
  const { title, max_stage_count, days_interval, desc, email_delivery_period } =
    await request.json();
  const token = request.headers.get("authorization");
  const user = jwtDecode(token);

  const stageCount = max_stage_count ?? DEFAULT_STAGE_COUNT;
  const delayDays = days_interval ?? DEFAULT_DELAY_DAYS;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        title,
        userId: user.userId,
        maxStageCount: stageCount,
        daysInterval: delayDays,
        desc,
        emailDeliveryPeriod: email_delivery_period,
        status: "PENDING",
        setuped: false,
      },
    });

    const subject_1 = "You should check this out {{name}}!";
    const first_pitch =
      "Hey {{name}}, I am reaching out to you for the first time. Looking forward to your reply.";
    const later_pitches =
      "Hey {{name}}, I am just following up on my previous emails.";
    const follow_up_subject = "Following Up {{name}}!";

    const createdPitches = [];

    createdPitches.push(
      await prisma.pitchEmail.create({
        data: {
          title: "First Reach out",
          message: first_pitch,
          subject: subject_1,
          campaignId: campaign.id,
          stage: 0,
          delayDays,
        },
      }),
    );

    if (stageCount > 1) {
      for (let i = 1; i < stageCount; i++) {
        createdPitches.push(
          await prisma.pitchEmail.create({
            data: {
              title: `Follow Up ${i}`,
              message: later_pitches,
              subject: follow_up_subject,
              campaignId: campaign.id,
              stage: i,
              delayDays,
            },
          }),
        );
      }
    }

    
    const edgeRows = [
      {
        campaignId: campaign.id,
        fromPitchId: null,
        toPitchId: createdPitches[0].id,
        condition: "ALWAYS",
      },
    ];
    for (let i = 0; i < createdPitches.length; i++) {
      const pitch = createdPitches[i];
      const next = createdPitches[i + 1];
      edgeRows.push({
        campaignId: campaign.id,
        fromPitchId: pitch.id,
        toPitchId: next ? next.id : null,
        condition: "NO_REPLY",
      });
      edgeRows.push({
        campaignId: campaign.id,
        fromPitchId: pitch.id,
        toPitchId: null,
        condition: "REPLIED",
      });
      edgeRows.push({
        campaignId: campaign.id,
        fromPitchId: pitch.id,
        toPitchId: null,
        condition: "OPENED",
      });
    }
    await prisma.pitchFlowEdge.createMany({ data: edgeRows });
    await seedFlowGraphFromPitches(prisma, campaign.id, createdPitches);

    return NextResponse.json({ message: "Campaign created", campaign });
  } catch (error) {
    console.error("[API] Error creating campaign:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
