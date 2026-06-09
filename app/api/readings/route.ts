import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    const readings = await prisma.sensorReading.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Return in chronological order (oldest first) so the UI charts can render it nicely from left to right
    return NextResponse.json(readings.reverse());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data readings",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
