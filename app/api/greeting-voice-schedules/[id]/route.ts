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
    const { name, active, startTime, endTime, cooldown, mode, tracks, days } = body;

    // Validate fields if provided
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json({ error: "Nama jadwal tidak boleh kosong." }, { status: 400 });
    }
    if (startTime !== undefined && !TIME_PATTERN.test(startTime)) {
      return NextResponse.json({ error: "Format waktu mulai tidak valid (harus HH:MM)." }, { status: 400 });
    }
    if (endTime !== undefined && !TIME_PATTERN.test(endTime)) {
      return NextResponse.json({ error: "Format waktu selesai tidak valid (harus HH:MM)." }, { status: 400 });
    }
    if (cooldown !== undefined && (typeof cooldown !== "number" || cooldown < 20)) {
      return NextResponse.json({ error: "Jeda/cooldown minimal 20 detik." }, { status: 400 });
    }
    if (mode !== undefined && mode !== "random" && mode !== "custom") {
      return NextResponse.json({ error: "Mode pemutaran harus 'random' atau 'custom'." }, { status: 400 });
    }

    // Check unique start time if startTime is being updated
    if (startTime !== undefined) {
      const existing = await prisma.greetingVoiceSchedule.findFirst({
        where: {
          startTime,
          NOT: { id },
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Jadwal dengan jam mulai yang sama (${startTime}) sudah terdaftar.` },
          { status: 400 }
        );
      }
    }

    const updatedSchedule = await prisma.greetingVoiceSchedule.update({
      where: { id },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
        startTime,
        endTime,
        cooldown: cooldown !== undefined ? Number(cooldown) : undefined,
        mode,
        tracks: typeof tracks === "string" ? tracks : undefined,
        days: typeof days === "string" ? days : undefined,
      },
    });

    return NextResponse.json(updatedSchedule);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui jadwal greeting voice",
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

    await prisma.greetingVoiceSchedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Jadwal greeting voice berhasil dihapus" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal menghapus jadwal greeting voice",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
