import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_TRACKS = new Set([10, 11, 12]);
const VALID_PLAY_MODES = new Set(["cooldown", "once_schedule", "once_motion"]);
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
    let setting = await prisma.pirGreetingSetting.findFirst();
    if (!setting) {
      setting = await prisma.pirGreetingSetting.create({
        data: {
          enabled: false,
          track: 10,
          startTime: "07:00",
          endTime: "22:00",
          cooldownSeconds: 10,
          playMode: "cooldown",
          days: JSON.stringify(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
        },
      });
    }
    return NextResponse.json(setting);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data setting PIR",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { enabled, track, startTime, endTime, cooldownSeconds, playMode, days } = body;
    const normalizedTrack = track === undefined ? undefined : Number(track);
    const normalizedCooldown = cooldownSeconds === undefined ? undefined : Number(cooldownSeconds);
    const activeDays = days === undefined ? undefined : parseDays(days);

    if (
      (normalizedTrack !== undefined && !VALID_TRACKS.has(normalizedTrack)) ||
      (startTime !== undefined && !TIME_PATTERN.test(startTime)) ||
      (endTime !== undefined && !TIME_PATTERN.test(endTime)) ||
      (normalizedCooldown !== undefined && (!Number.isFinite(normalizedCooldown) || normalizedCooldown < 10)) ||
      (playMode !== undefined && !VALID_PLAY_MODES.has(playMode)) ||
      (days !== undefined && !activeDays)
    ) {
      return NextResponse.json(
        { error: "Setting PIR tidak valid. Track harus 10-12, cooldown minimal 10 detik, dan waktu memakai HH:MM." },
        { status: 400 }
      );
    }

    let setting = await prisma.pirGreetingSetting.findFirst();
    if (setting) {
      setting = await prisma.pirGreetingSetting.update({
        where: { id: setting.id },
        data: {
          enabled: enabled !== undefined ? Boolean(enabled) : undefined,
          track: normalizedTrack,
          startTime: startTime !== undefined ? startTime : undefined,
          endTime: endTime !== undefined ? endTime : undefined,
          cooldownSeconds: normalizedCooldown,
          playMode: playMode !== undefined ? playMode : undefined,
          days: activeDays ? JSON.stringify(activeDays) : undefined,
        },
      });
    } else {
      setting = await prisma.pirGreetingSetting.create({
        data: {
          enabled: enabled !== undefined ? Boolean(enabled) : false,
          track: normalizedTrack ?? 10,
          startTime: startTime !== undefined ? startTime : "07:00",
          endTime: endTime !== undefined ? endTime : "22:00",
          cooldownSeconds: normalizedCooldown ?? 10,
          playMode: playMode !== undefined ? playMode : "cooldown",
          days: JSON.stringify(activeDays ?? ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
        },
      });
    }

    return NextResponse.json(setting);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui data setting PIR",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
