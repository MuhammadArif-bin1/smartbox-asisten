/**
 * /api/smartbox/voice-log - Log interaksi suara AI
 *
 * GET  - Ambil daftar interaksi suara terbaru
 * POST - Simpan interaksi suara baru secara manual
 */

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId") || "smartbox-001";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    const logs = await prisma.voiceInteraction.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      deviceId,
      count: logs.length,
      logs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[VOICE-LOG GET] Error:", message);
    return NextResponse.json(
      { error: "Gagal mengambil log suara", detail: message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceId = "smartbox-001",
      transcript,
      replyText,
      audioUrl,
      status = "success",
    } = body;

    const voiceLog = await prisma.voiceInteraction.create({
      data: {
        deviceId,
        transcript,
        replyText,
        audioUrl,
        status,
      },
    });

    return NextResponse.json({
      success: true,
      voiceLog,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[VOICE-LOG POST] Error:", message);
    return NextResponse.json(
      { error: "Gagal menyimpan log suara", detail: message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
