import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
  const limit = parseInt(searchParams.get("limit") || "15", 10);

  try {
    const logs = await prisma.eventLog.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil log event",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
