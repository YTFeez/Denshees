import { NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";
import prisma from "@/lib/prisma";

export async function GET(request) {
  const token = request.headers.get("authorization");
  if (!token || typeof token !== "string") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let user;
  try {
    user = jwtDecode(token);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!user?.userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [campaigns, totalItems] = await Promise.all([
      prisma.campaign.findMany({
        where: { userId: user.userId, deleted: false },
        orderBy: { created: "desc" },
        take: 25,
      }),
      prisma.campaign.count({ where: { userId: user.userId, deleted: false } }),
    ]);

    return NextResponse.json({
      items: campaigns,
      totalItems,
      page: 1,
      perPage: 25,
    });
  } catch (error) {
    console.error("[API] Error getting campaigns:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
