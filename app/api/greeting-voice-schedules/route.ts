import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  try {
    const schedules = await prisma.greetingVoiceSchedule.findMany({
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json(schedules);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data jadwal greeting voice",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, active, startTime, endTime, cooldown, mode, tracks, days } = body;

    // Validate fields
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Nama jadwal wajib diisi." }, { status: 400 });
    }
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return NextResponse.json({ error: "Format waktu mulai dan selesai harus HH:MM." }, { status: 400 });
    }
    if (typeof cooldown !== "number" || cooldown < 20) {
      return NextResponse.json({ error: "Jeda/cooldown minimal 20 detik." }, { status: 400 });
    }
    if (mode !== "random" && mode !== "custom") {
      return NextResponse.json({ error: "Mode pemutaran harus 'random' atau 'custom'." }, { status: 400 });
    }

    // Check unique start time
    const existing = await prisma.greetingVoiceSchedule.findFirst({
      where: { startTime },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Jadwal dengan jam mulai yang sama (${startTime}) sudah terdaftar.` },
        { status: 400 }
      );
    }

    const newSchedule = await prisma.greetingVoiceSchedule.create({
      data: {
        name: name.trim(),
        active: active !== undefined ? Boolean(active) : true,
        startTime,
        endTime,
        cooldown,
        mode,
        tracks: typeof tracks === "string" ? tracks : "[]",
        days: typeof days === "string" ? days : "[]",
      },
    });

    return NextResponse.json(newSchedule, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal membuat jadwal greeting voice baru",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
