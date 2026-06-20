import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await request.json();
    const { name, time, track, active, days, buzzerActive, buzzerDuration, buzzerDelay, repeatCount, repeatDelay } = body;

    if (
      (name !== undefined && (typeof name !== "string" || !name.trim())) ||
      (time !== undefined && !TIME_PATTERN.test(time)) ||
      (track !== undefined && (typeof track !== "number" || track < 1 || track > 14))
    ) {
      return NextResponse.json(
        { error: "Perubahan tidak valid. Waktu harus format HH:MM dan track harus 1-14." },
        { status: 400 }
      );
    }

    const updatedSchedule = await prisma.alarmSchedule.update({
      where: { id },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        time,
        track: track !== undefined ? Number(track) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
        days: typeof days === "string" ? days : undefined,
        buzzerActive: buzzerActive !== undefined ? Boolean(buzzerActive) : undefined,
        buzzerDuration: typeof buzzerDuration === "number" ? buzzerDuration : undefined,
        buzzerDelay: typeof buzzerDelay === "number" ? buzzerDelay : undefined,
        repeatCount: typeof repeatCount === "number" ? repeatCount : undefined,
        repeatDelay: typeof repeatDelay === "number" ? repeatDelay : undefined,
      },
    });

    return NextResponse.json(updatedSchedule);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui jadwal alarm",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    await prisma.alarmSchedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Jadwal alarm berhasil dihapus" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal menghapus jadwal alarm",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
