import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }

  try {
    await prisma.campaignFlowWire.delete({ where: { id } });
    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    console.error(`[API] Error deleting wire ${id}:`, error);
    return NextResponse.json(
      { message: "Something went wrong", detail: String(error?.message) },
      { status: 500 },
    );
  }
}
