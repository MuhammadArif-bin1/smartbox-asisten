import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  try {
    const schedules = await prisma.alarmSchedule.findMany({
      orderBy: { time: "asc" },
    });
    return NextResponse.json(schedules);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data jadwal alarm",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, time, track, active } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !TIME_PATTERN.test(time) ||
      typeof track !== "number" ||
      track < 1 ||
      track > 13
    ) {
      return NextResponse.json(
        { error: "Jadwal alarm tidak valid. Nama wajib diisi, waktu harus format HH:MM, dan track harus 1-13." },
        { status: 400 }
      );
    }

    const newSchedule = await prisma.alarmSchedule.create({
      data: {
        name: name.trim(),
        time,
        track,
        active: active !== undefined ? Boolean(active) : true,
        deviceId: "smartbox-001",
      },
    });

    return NextResponse.json(newSchedule, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal membuat jadwal alarm baru",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
