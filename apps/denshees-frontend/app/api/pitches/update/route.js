import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request) {
  const searchParams = new URL(request.url).searchParams;
  const pitch = searchParams.get("pitch");
  const body = await request.json().catch(() => ({}));
  const { message, subject, delayDays, flowX, flowY } = body;

  
  
  const data = {};
  if (message !== undefined) data.message = message;
  if (subject !== undefined) data.subject = subject;
  if (delayDays !== undefined) data.delayDays = Number(delayDays);
  if (flowX !== undefined) {
    data.flowX = flowX === null ? null : Number(flowX);
  }
  if (flowY !== undefined) {
    data.flowY = flowY === null ? null : Number(flowY);
  }

  if (!pitch) {
    return NextResponse.json({ message: "pitch is required" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { message: "No fields to update" },
      { status: 400 },
    );
  }

  try {
    const record = await prisma.pitchEmail.update({
      where: { id: pitch },
      data,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error(`[API] Error updating pitch ${pitch}:`, error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
