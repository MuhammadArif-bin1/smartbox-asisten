import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const schedules = await prisma.relaySchedule.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(schedules);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data jadwal",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, relayNumber, startTime, endTime, days, enabled } = body;

    if (!name || typeof relayNumber !== "number" || !startTime || !endTime || !days) {
      return NextResponse.json(
        { error: "Field name, relayNumber, startTime, endTime, dan days wajib diisi" },
        { status: 400 }
      );
    }

    const newSchedule = await prisma.relaySchedule.create({
      data: {
        name,
        relayNumber: Number(relayNumber),
        startTime,
        endTime,
        days: typeof days === "string" ? days : JSON.stringify(days),
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      },
    });

    return NextResponse.json(newSchedule, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal membuat jadwal baru",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
