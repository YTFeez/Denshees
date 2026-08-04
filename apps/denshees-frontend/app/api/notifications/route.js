import { NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";
import prisma from "@/lib/prisma";

function getUserId(request) {
  const token = request.headers.get("authorization");
  if (!token || typeof token !== "string") return null;
  try {
    const user = jwtDecode(token);
    return user?.userId || null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 100);

  try {
    const where = { userId };
    if (unreadOnly) where.read = false;

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { created: "desc" },
        take: limit,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return NextResponse.json({ items, unreadCount });
  } catch (error) {
    console.error("[API] Error listing notifications:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    if (body.markAllRead) {
      await prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
    if (!ids.length) {
      return NextResponse.json({ message: "ids required" }, { status: 400 });
    }

    await prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error updating notifications:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 },
    );
  }
}
