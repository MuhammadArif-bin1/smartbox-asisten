/**
 * /api/gemini/chat-audio - Server-side AI Chat untuk tombol hitam
 *
 * POST body: { message: string, deviceId?: string, context?: string }
 * - message: teks pertanyaan pengguna (direkam via browser mic atau dikirim langsung)
 * - deviceId: ID perangkat ESP32 (default: smartbox-001)
 * - context: konteks tambahan (status sensor saat ini, dll)
 *
 * Returns: { text: string, audioUrl?: string, track?: number }
 *
 * KEAMANAN: API key Gemini HANYA ada di server-side.
 * Browser mengirim TEKS (bukan audio raw), AI menjawab dengan teks + TTS.
 *
 * Flow:
 * 1. Browser merekam suara user via Web Speech API
 * 2. Browser mengirim teks ke /api/gemini/chat-audio
 * 3. Server mengirim ke Gemini text API
 * 4. Server mengambil jawaban, kirim ke Gemini TTS
 * 5. Simpan audio jawaban ke public/generated/ai/
 * 6. Return { text, audioUrl } ke browser untuk diputar
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Context sistem untuk Smartbox Assistant
const SYSTEM_PROMPT = `Kamu adalah Smartbox Assistant, asisten rumah pintar berbahasa Indonesia yang ramah, singkat, dan profesional.

Kamu diintegrasikan dengan:
- Sensor MQ-2 (gas/asap)
- Sensor PIR (gerakan)
- Sensor suhu DS3231 RTC
- Relay 1 dan 2 (stop kontak pintar)
- DFPlayer Mini (pemutar suara lokal)
- LCD I2C 16x2

Aturan menjawab:
- Jawab dalam bahasa Indonesia yang natural
- Maksimal 2-3 kalimat untuk jawaban biasa
- Jika ada peringatan sensor, sampaikan dengan tegas dan jelas
- Jangan menyebut nama model AI atau detail teknis internal
- Jika ditanya tentang status sensor, jawab berdasarkan konteks yang diberikan`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      deviceId = "smartbox-001",
      context = "",
      voice = "Charon",
    } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message tidak boleh kosong" },
        { status: 400 }
      );
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY belum dikonfigurasi di .env",
          text: "Maaf, fitur AI belum dikonfigurasi. Silakan hubungi administrator.",
        },
        { status: 500 }
      );
    }

    const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";

    // Step 1: Kirim ke Gemini text model untuk mendapatkan jawaban
    const fullPrompt = context
      ? `${SYSTEM_PROMPT}\n\nStatus sensor saat ini:\n${context}\n\nPertanyaan pengguna: ${message}`
      : `${SYSTEM_PROMPT}\n\nPertanyaan pengguna: ${message}`;

    const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${GEMINI_API_KEY}`;

    const textResponse = await fetch(textUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.7,
        },
      }),
    });

    if (!textResponse.ok) {
      const errText = await textResponse.text();
      console.error("[CHAT-AUDIO] Gemini text error:", errText);
      return NextResponse.json(
        { error: "Gemini text API gagal", detail: errText },
        { status: 502 }
      );
    }

    const textData = await textResponse.json();
    const aiText =
      textData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Maaf, saya tidak dapat memproses pertanyaan Anda saat ini.";

    console.log(`[CHAT-AUDIO] Pertanyaan: "${message}"`);
    console.log(`[CHAT-AUDIO] Jawaban AI: "${aiText}"`);

    // Step 2: Convert jawaban ke audio via Gemini TTS
    let audioUrl: string | null = null;
    let audioSize = 0;

    try {
      const ttsModel =
        process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
      const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${GEMINI_API_KEY}`;

      const ttsResponse = await fetch(ttsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Bicara dengan jelas dan natural dalam bahasa Indonesia.\n\n${aiText}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      });

      if (ttsResponse.ok) {
        const ttsData = await ttsResponse.json();
        const parts = ttsData.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find(
          (p: { inlineData?: { mimeType?: string } }) =>
            p.inlineData?.mimeType?.startsWith("audio/")
        );

        if (audioPart?.inlineData?.data) {
          const audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
          const mimeType = audioPart.inlineData.mimeType || "audio/wav";
          const ext = "mp3";

          // Simpan audio AI ke public/generated/ai/
          const aiDir = path.join(process.cwd(), "public", "generated", "ai");
          if (!existsSync(aiDir)) {
            await mkdir(aiDir, { recursive: true });
          }

          const timestamp = Date.now();
          const aiFilename = `ai_response_${timestamp}.${ext}`;
          await writeFile(path.join(aiDir, aiFilename), audioBuffer);

          audioUrl = `/generated/ai/${aiFilename}`;
          audioSize = audioBuffer.length;

          console.log(`[CHAT-AUDIO] Audio disimpan: ${aiFilename} (${audioSize} bytes)`);
        }
      } else {
        console.warn("[CHAT-AUDIO] TTS gagal, hanya kembalikan teks");
      }
    } catch (ttsErr) {
      console.warn("[CHAT-AUDIO] TTS error (non-fatal):", ttsErr);
    }

    // Simpan event ke database (optional, tidak block response)
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      await prisma.smartboxEvent.create({
        data: {
          deviceId,
          level: "INFO",
          type: "ai.chat",
          message: `AI Chat: ${message.substring(0, 100)}`,
          source: "browser",
          payload: {
            query: message,
            response: aiText,
            hasAudio: !!audioUrl,
          },
        },
      });
      await prisma.$disconnect();
    } catch (dbErr) {
      console.warn("[CHAT-AUDIO] DB log gagal (non-fatal):", dbErr);
    }

    return NextResponse.json({
      success: true,
      text: aiText,
      audioUrl,
      audioSize,
      deviceId,
      query: message,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CHAT-AUDIO] Error:", message);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gemini/chat-audio",
    method: "POST",
    description: "AI chat untuk tombol hitam Smartbox Assistant",
    body: {
      message: "string (required) - pertanyaan pengguna",
      deviceId: "string (optional) - ID perangkat",
      context: "string (optional) - status sensor",
      voice: "string (optional) - nama voice Gemini",
    },
  });
}
