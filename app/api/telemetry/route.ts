import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || process.env.NEXT_PUBLIC_DEVICE_ID || "smartbox-001";

  try {
    const snapshots = await prisma.sensorSnapshot.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: 24,
    });

    // Return in chronological order
    return NextResponse.json(snapshots.reverse());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal mengambil data telemetry",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      deviceId,
      gasEnabled = true,
      gasRaw,
      gasDetected = false,
      tempEnabled = true,
      temperatureC,
      flameDetected = false,
      pirDetected = false,
      obstacleNear = false,
    } = body;

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId wajib diisi" }, { status: 400 });
    }

    // Ensure the device exists and is marked online
    await prisma.device.upsert({
      where: { deviceId },
      update: { status: "online", lastSeenAt: new Date(), updatedAt: new Date() },
      create: {
        id: deviceId,
        deviceId,
        name: "SmartBox Assistant S3",
        status: "online",
        lastSeenAt: new Date(),
      },
    });

    // Create sensor snapshot record
    const snapshot = await prisma.sensorSnapshot.create({
      data: {
        deviceId,
        gasEnabled,
        gasRaw: typeof gasRaw === "number" ? Math.round(gasRaw) : null,
        gasDetected: Boolean(gasDetected),
        tempEnabled,
        temperatureC: typeof temperatureC === "number" ? temperatureC : null,
        flameDetected: Boolean(flameDetected),
        pirDetected: Boolean(pirDetected),
        obstacleNear: Boolean(obstacleNear),
      },
    });

    // Create a device event if there is a warning state
    if (gasDetected) {
      await prisma.deviceEvent.create({
        data: {
          deviceId,
          type: "GAS_WARNING",
          severity: "critical",
          message: `Sensor MQ-2 mendeteksi gas berbahaya! Kadar: ${gasRaw} raw.`,
        },
      });
    }

    if (temperatureC !== undefined && temperatureC !== null && temperatureC > 37.0) {
      await prisma.deviceEvent.create({
        data: {
          deviceId,
          type: "TEMP_WARNING",
          severity: "warning",
          message: `Suhu ruangan panas terdeteksi: ${temperatureC}°C.`,
        },
      });
    }

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gagal menyimpan data telemetry",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
