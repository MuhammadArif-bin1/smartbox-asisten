import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

  try {
    // Ensure the device exists
    await prisma.device.upsert({
      where: { deviceId },
      update: {},
      create: {
        id: deviceId,
        deviceId,
        name: "SmartBox Assistant S3",
        status: "offline",
      },
    });

    let alarms = await prisma.alarm.findMany({
      where: { deviceId },
      orderBy: { time: "asc" },
    });

    if (alarms.length === 0) {
      // Seed default alarms
      await prisma.alarm.createMany({
        data: [
          { id: "morning", deviceId, label: "Pagi", time: "07:00", greeting: "Pengingat aktivitas pagi", dfTrack: 4, enabled: true },
          { id: "noon", deviceId, label: "Siang", time: "12:30", greeting: "Pengingat istirahat siang", dfTrack: 5, enabled: true },
          { id: "evening", deviceId, label: "Malam", time: "19:30", greeting: "Pengingat istirahat malam", dfTrack: 6, enabled: true },
        ],
      });
      alarms = await prisma.alarm.findMany({
        where: { deviceId },
        orderBy: { time: "asc" },
      });
    }

    return NextResponse.json(alarms);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data alarm",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, label, time, greeting, dfTrack, enabled } = body;

    if (!id) {
      return NextResponse.json({ error: "Alarm ID wajib diisi" }, { status: 400 });
    }
    if (
      (time !== undefined && !TIME_PATTERN.test(time)) ||
      (dfTrack !== undefined && (!Number.isInteger(Number(dfTrack)) || Number(dfTrack) < 1 || Number(dfTrack) > 13))
    ) {
      return NextResponse.json(
        { error: "Alarm tidak valid. Waktu harus HH:MM dan track harus 1-13." },
        { status: 400 }
      );
    }

    const updatedAlarm = await prisma.alarm.update({
      where: { id },
      data: {
        label,
        time,
        greeting,
        dfTrack: dfTrack !== undefined ? Number(dfTrack) : undefined,
        enabled: enabled !== undefined ? Boolean(enabled) : undefined,
        timezone: "Asia/Jakarta",
      },
    });

    // Create a log in DeviceEvent for audit trail
    await prisma.deviceEvent.create({
      data: {
        deviceId: updatedAlarm.deviceId,
        type: "ALARM_UPDATED",
        severity: "info",
        message: `Alarm '${updatedAlarm.label}' diperbarui ke jam ${updatedAlarm.time} (${updatedAlarm.enabled ? "Aktif" : "Nonaktif"})`,
      },
    });

    return NextResponse.json(updatedAlarm);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal memperbarui alarm",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
