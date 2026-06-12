import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_DAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function parseDays(days: unknown): string[] | null {
  try {
    const parsed = typeof days === "string" ? JSON.parse(days) : days;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const normalized = parsed.map(String).map((day) => day.toLowerCase());
    return normalized.every((day) => VALID_DAYS.has(day)) ? normalized : null;
  } catch {
    return null;
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await request.json();
    const { name, relayNumber, startTime, endTime, days, enabled } = body;
    const activeDays = days === undefined ? undefined : parseDays(days);

    if (
      (name !== undefined && (typeof name !== "string" || !name.trim())) ||
      (relayNumber !== undefined && ![1, 2].includes(Number(relayNumber))) ||
      (startTime !== undefined && !TIME_PATTERN.test(startTime)) ||
      (endTime !== undefined && !TIME_PATTERN.test(endTime)) ||
      (days !== undefined && !activeDays)
    ) {
      return NextResponse.json(
        { error: "Jadwal tidak valid. Gunakan relay 1/2, waktu HH:MM, dan minimal satu hari aktif." },
        { status: 400 }
      );
    }

    const updatedSchedule = await prisma.relaySchedule.update({
      where: { id },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        relayNumber: relayNumber !== undefined ? Number(relayNumber) : undefined,
        startTime,
        endTime,
        days: activeDays ? JSON.stringify(activeDays) : undefined,
        enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      },
    });

    return NextResponse.json(updatedSchedule);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui jadwal",
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

    await prisma.relaySchedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Jadwal berhasil dihapus" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal menghapus jadwal",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
