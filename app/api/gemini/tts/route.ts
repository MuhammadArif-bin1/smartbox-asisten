/**
 * /api/gemini/tts - Server-side Gemini Text-to-Speech
 *
 * POST body: { track: number, text: string, voice?: string, style?: string }
 * - track: nomor track DFPlayer (1-12)
 * - text: teks yang akan di-TTS
 * - voice: nama voice Gemini (default: "Charon")
 * - style: instruksi gaya bicara
 *
 * Returns: { url: string, filename: string, track: number }
 *
 * KEAMANAN: API key Gemini HANYA ada di server-side.
 * Jangan pernah tambahkan NEXT_PUBLIC_ prefix ke GEMINI_API_KEY.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const TRACK_LABELS: Record<number, string> = {
  1: "smartbox_assistant_siap",
  2: "menampilkan_jam_suhu",
  3: "bluetooth_diaktifkan",
  4: "selamat_pagi",
  5: "selamat_siang",
  6: "selamat_sore",
  7: "asap_terdeteksi",
  8: "gas_terdeteksi",
  9: "suhu_terdeteksi",
  10: "gerakan_berjalan",
  11: "gerakan_melompat",
  12: "gerakan_melambaikan",
};

const DEFAULT_TEXTS: Record<number, string> = {
  1: "Halo, saya Smartbox Assistant. Sistem siap digunakan. Selamat datang!",
  2: "Menampilkan informasi waktu dan suhu ruangan secara real-time.",
  3: "Bluetooth aktif. Silakan sambungkan perangkat Anda.",
  4: "Selamat pagi, Tuan. Semoga hari Anda menyenangkan.",
  5: "Selamat siang, Tuan. Jangan lupa makan siang.",
  6: "Selamat sore, Tuan. Waktunya bersantai.",
  7: "Peringatan! Asap terdeteksi. Segera periksa area sekitar Anda.",
  8: "Peringatan! Gas berbahaya terdeteksi. Segera ventilasi ruangan dan jauhi area.",
  9: "Peringatan! Suhu ruangan terlalu tinggi. Aktifkan pendingin ruangan.",
  10: "Gerakan terdeteksi. Selamat datang!",
  11: "Gerakan melompat terdeteksi.",
  12: "Gerakan melambaikan tangan terdeteksi. Halo!",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      track,
      text,
      voice = "Charon",
      style = "Bicara dengan jelas, tegas, dan profesional dalam bahasa Indonesia.",
    } = body;

    // Validasi
    if (!track || track < 1 || track > 12) {
      return NextResponse.json(
        { error: "track harus antara 1 dan 12" },
        { status: 400 }
      );
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY belum dikonfigurasi. Isi di file .env server-side.",
        },
        { status: 500 }
      );
    }

    const ttsModel =
      process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
    const ttsText = text || DEFAULT_TEXTS[track] || `Track ${track}`;

    // Panggil Gemini TTS API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: `${style}\n\n${ttsText}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("[TTS] Gemini API error:", errText);

      // Fallback: kembalikan placeholder info
      return NextResponse.json(
        {
          error: `Gemini TTS gagal: ${geminiResponse.status}`,
          detail: errText,
          fallback: true,
          track,
          trackLabel: TRACK_LABELS[track],
          text: ttsText,
        },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();

    // Extract audio data dari response
    const candidates = geminiData.candidates || [];
    if (!candidates.length) {
      return NextResponse.json(
        { error: "Gemini tidak mengembalikan audio" },
        { status: 502 }
      );
    }

    const parts = candidates[0]?.content?.parts || [];
    const audioPart = parts.find(
      (p: { inlineData?: { mimeType?: string } }) =>
        p.inlineData?.mimeType?.startsWith("audio/")
    );

    if (!audioPart?.inlineData?.data) {
      return NextResponse.json(
        {
          error: "Tidak ada data audio dalam response Gemini",
          raw: candidates[0],
        },
        { status: 502 }
      );
    }

    // Simpan file audio ke public/generated/
    const audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
    const mimeType = audioPart.inlineData.mimeType || "audio/wav";
    const ext = "mp3";

    // Format DFPlayer: 4-digit filename (0001.mp3 - 0012.mp3)
    const dfPlayerFilename = `${String(track).padStart(4, "0")}.${ext}`;
    const webFilename = `track_${String(track).padStart(2, "0")}_${TRACK_LABELS[track]}.${ext}`;

    const outputDir = path.join(process.cwd(), "public", "generated");
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    await writeFile(path.join(outputDir, webFilename), audioBuffer);

    console.log(
      `[TTS] Track ${track} (${TRACK_LABELS[track]}) berhasil digenerate: ${webFilename}`
    );

    return NextResponse.json({
      success: true,
      track,
      trackLabel: TRACK_LABELS[track],
      dfPlayerFilename,
      webFilename,
      url: `/generated/${webFilename}`,
      size: audioBuffer.length,
      mimeType,
      text: ttsText,
      voice,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TTS] Error:", message);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gemini/tts",
    method: "POST",
    description: "Generate audio TTS dari Gemini AI untuk track DFPlayer",
    tracks: TRACK_LABELS,
    defaultTexts: DEFAULT_TEXTS,
  });
}
