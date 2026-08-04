import { NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";
import prisma from "@/lib/prisma";



export async function GET(request, { params }) {
  try {
    const { id } = params;
    const token = request.headers.get("authorization");
    const currUser = jwtDecode(token);

    if (!currUser?.userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.userId !== currUser.userId) {
      return NextResponse.json(
        { error: "Unauthorized access to campaign" },
        { status: 403 },
      );
    }

    
    
    const dailyStats = await prisma.$queryRaw`
      WITH msg_stats AS (
        SELECT
          DATE(cm.created) as day,
          COUNT(*) FILTER (WHERE cm.sent = true) as sent,
          COUNT(*) FILTER (WHERE cm.sent = false) as replies
        FROM campaign_messages cm
        JOIN campaigns_email ce ON cm.campaign_email = ce.id
        WHERE ce.campaign = ${id}
        GROUP BY DATE(cm.created)
      ),
      open_stats AS (
        SELECT
          DATE(co.created) as day,
          COUNT(*) as opens
        FROM campaign_opens co
        JOIN campaigns_email ce ON co.campaign_email = ce.id
        WHERE ce.campaign = ${id}
        GROUP BY DATE(co.created)
      )
      SELECT
        ms.day,
        ${id}::text as campaign,
        COALESCE(ms.sent, 0) as sent,
        COALESCE(ms.replies, 0) as replies,
        COALESCE(os.opens, 0) as opens
      FROM msg_stats ms
      LEFT JOIN open_stats os ON ms.day = os.day
      ORDER BY ms.day DESC
    `;

    
    const stats = dailyStats.map((row) => ({
      campaign: id,
      day: row.day,
      sent: Number(row.sent),
      replies: Number(row.replies),
      opens: Number(row.opens),
    }));

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching daily stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily stats" },
      { status: 500 },
    );
  }
}
