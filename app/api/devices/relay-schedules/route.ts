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

export async function GET() {
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

    const activeDays = parseDays(days);
    if (
      typeof name !== "string" ||
      !name.trim() ||
      ![1, 2].includes(Number(relayNumber)) ||
      !TIME_PATTERN.test(startTime) ||
      !TIME_PATTERN.test(endTime) ||
      !activeDays
    ) {
      return NextResponse.json(
        { error: "Jadwal tidak valid. Gunakan relay 1/2, waktu HH:MM, dan minimal satu hari aktif." },
        { status: 400 }
      );
    }

    const newSchedule = await prisma.relaySchedule.create({
      data: {
        name: name.trim(),
        relayNumber: Number(relayNumber),
        startTime,
        endTime,
        days: JSON.stringify(activeDays),
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
