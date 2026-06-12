/**
 * /api/smartbox/events - Log events dari ESP32 dan browser
 *
 * GET  - Ambil events terbaru
 * POST - Simpan event baru
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId") || "smartbox-001";
    const type = searchParams.get("type") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const level = searchParams.get("level") || undefined;
    const source = searchParams.get("source") || undefined;

    const events = await prisma.smartboxEvent.findMany({
      where: {
        deviceId,
        ...(type ? { type } : {}),
        ...(level ? { level } : {}),
        ...(source ? { source } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      count: events.length,
      deviceId,
      events,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EVENTS GET] Error:", message);
    return NextResponse.json(
      { error: "Gagal mengambil events", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceId = "smartbox-001",
      level = "INFO",
      type,
      message,
      source = "esp32",
      payload,
      track,
      trackName,
      sensorValue,
      sensorType,
    } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "type dan message wajib diisi" },
        { status: 400 }
      );
    }

    const event = await prisma.smartboxEvent.create({
      data: {
        deviceId,
        level,
        type,
        message,
        source,
        payload: payload || undefined,
        track: track || undefined,
        trackName: trackName || undefined,
        sensorValue: sensorValue || undefined,
        sensorType: sensorType || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      event,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EVENTS POST] Error:", message);
    return NextResponse.json(
      { error: "Gagal menyimpan event", detail: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId") || "smartbox-001";
    const olderThanDays = parseInt(searchParams.get("days") || "7");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.smartboxEvent.deleteMany({
      where: {
        deviceId,
        createdAt: { lt: cutoffDate },
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      cutoffDate: cutoffDate.toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Gagal hapus events", detail: message },
      { status: 500 }
    );
  }
}
