/**
 * /api/gemini/chat-audio - Server-side AI Chat untuk tombol hitam
 *
 * POST body:
 * - Jika content-type application/json:
 *   { message: string, deviceId?: string, context?: string }
 * - Jika content-type audio/wav atau application/octet-stream:
 *   (Raw binary audio data dari ESP32 mikrofon INMP441)
 *
 * Returns: { success: true, text: string, audioUrl?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";

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
  const prisma = new PrismaClient();
  let interactionId = "";
  try {
    const contentType = req.headers.get("content-type") || "";
    const headerDeviceId = req.headers.get("x-device-id") || req.headers.get("deviceid");
    const deviceId = headerDeviceId || "smartbox-001";
    const source = req.headers.get("x-source") || "black_button_long_press";
    
    // 1. Simpan log request awal ke database dengan status "processing"
    try {
      const log = await prisma.voiceInteraction.create({
        data: {
          deviceId,
          source,
          status: "processing",
        },
      });
      interactionId = log.id;
      console.log(`[CHAT-AUDIO] Created DB log with ID: ${interactionId} (status: processing)`);
    } catch (dbErr) {
      console.warn("[CHAT-AUDIO] Database log creation failed:", dbErr);
    }
    
    let userQuery = "";
    let aiText = "";
    let context = "";
    let voice = "Charon";

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      throw new Error("GEMINI_API_KEY belum dikonfigurasi di .env");
    }

    const isAudioUpload = contentType.includes("audio/") || contentType.includes("application/octet-stream");

    if (isAudioUpload) {
      const arrayBuffer = await req.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      console.log(`[CHAT-AUDIO] Menerima audio upload sebesar ${audioBuffer.length} bytes`);

      // Deteksi format mimeType berdasarkan magic bytes audio buffer
      let mimeType = "audio/wav";
      if (audioBuffer.slice(0, 4).toString() === "RIFF") {
        mimeType = "audio/wav";
      } else if (audioBuffer.slice(0, 3).toString() === "ID3" || (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
        mimeType = "audio/mp3";
      } else {
        mimeType = contentType.includes("mp3") || contentType.includes("mpeg") ? "audio/mp3" : "audio/wav";
      }

      console.log(`[CHAT-AUDIO] Format audio yang terdeteksi: ${mimeType}`);

      // Kirim audio ke Gemini model untuk ditranskripsikan dan dijawab sekaligus dalam JSON
      const base64Audio = audioBuffer.toString("base64");
      const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
      const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${GEMINI_API_KEY}`;
      
      const geminiResponse = await fetch(textUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Audio
                  }
                },
                {
                  text: `${SYSTEM_PROMPT}\n\nAnalisis audio di atas. Pertama, transkripsikan tepat apa yang dikatakan user dalam bahasa Indonesia. Kedua, berikan respon balasan Anda yang singkat dan ramah.\n\nFormat output harus selalu berupa JSON valid seperti ini:\n{\n  "transcript": "teks transkripsi user",\n  "reply": "teks jawaban asisten"\n}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4
          }
        })
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        throw new Error(`Gemini audio API gagal: ${errText}`);
      }

      const geminiData = await geminiResponse.json();
      const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      let parsedResult;
      try {
        parsedResult = JSON.parse(resultText);
      } catch (e) {
        parsedResult = {
          transcript: "Suara terdeteksi",
          reply: resultText
        };
      }
      
      userQuery = parsedResult.transcript || "Suara terdeteksi";
      aiText = parsedResult.reply || "Maaf, saya tidak mengerti audio Anda.";
    } else {
      // Input JSON biasa (seperti dari dashboard browser)
      const body = await req.json();
      const msg = body.message;
      context = body.context || "";
      voice = body.voice || "Charon";

      if (!msg || typeof msg !== "string" || msg.trim().length === 0) {
        return NextResponse.json(
          { error: "message tidak boleh kosong" },
          { status: 400 }
        );
      }
      userQuery = msg;

      const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
      const fullPrompt = context
        ? `${SYSTEM_PROMPT}\n\nStatus sensor saat ini:\n${context}\n\nPertanyaan pengguna: ${userQuery}`
        : `${SYSTEM_PROMPT}\n\nPertanyaan pengguna: ${userQuery}`;

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
        throw new Error(`Gemini text API gagal: ${errText}`);
      }

      const textData = await textResponse.json();
      aiText =
        textData.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Maaf, saya tidak dapat memproses pertanyaan Anda saat ini.";
    }

    console.log(`[CHAT-AUDIO] Pertanyaan: "${userQuery}"`);
    console.log(`[CHAT-AUDIO] Jawaban AI: "${aiText}"`);

    // Parse voice commands / intents
    const normalizedQuery = userQuery.toLowerCase().trim();
    let mqttCmd: any = null;

    if (normalizedQuery.includes("nyalakan stop kontak satu") || normalizedQuery.includes("hidupkan stop kontak satu") || normalizedQuery.includes("nyalakan stop kontak 1")) {
      mqttCmd = {
        id: `ai_cmd_relay1_on_${Date.now()}`,
        type: "relay.set",
        payload: {
          relay: 1,
          state: true,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, stop kontak satu saya nyalakan.";
    } else if (normalizedQuery.includes("matikan stop kontak satu") || normalizedQuery.includes("matikan stop kontak 1")) {
      mqttCmd = {
        id: `ai_cmd_relay1_off_${Date.now()}`,
        type: "relay.set",
        payload: {
          relay: 1,
          state: false,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, stop kontak satu saya matikan.";
    } else if (normalizedQuery.includes("nyalakan stop kontak dua") || normalizedQuery.includes("hidupkan stop kontak dua") || normalizedQuery.includes("nyalakan stop kontak 2")) {
      mqttCmd = {
        id: `ai_cmd_relay2_on_${Date.now()}`,
        type: "relay.set",
        payload: {
          relay: 2,
          state: true,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, stop kontak dua saya nyalakan.";
    } else if (normalizedQuery.includes("matikan stop kontak dua") || normalizedQuery.includes("matikan stop kontak 2")) {
      mqttCmd = {
        id: `ai_cmd_relay2_off_${Date.now()}`,
        type: "relay.set",
        payload: {
          relay: 2,
          state: false,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, stop kontak dua saya matikan.";
    } else if (normalizedQuery.includes("nyalakan bluetooth") || normalizedQuery.includes("aktifkan bluetooth") || normalizedQuery.includes("hidupkan bluetooth")) {
      mqttCmd = {
        id: `ai_cmd_bt_on_${Date.now()}`,
        type: "bluetooth.set",
        payload: {
          state: true,
          durationSeconds: 60,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, bluetooth saya nyalakan selama satu menit.";
    } else if (normalizedQuery.includes("matikan bluetooth") || normalizedQuery.includes("nonaktifkan bluetooth")) {
      mqttCmd = {
        id: `ai_cmd_bt_off_${Date.now()}`,
        type: "bluetooth.set",
        payload: {
          state: false,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, bluetooth saya matikan.";
    } else if (normalizedQuery.includes("putar suara smartbox") || normalizedQuery.includes("bunyikan alarm") || normalizedQuery.includes("putar suara")) {
      mqttCmd = {
        id: `ai_cmd_dfplay_${Date.now()}`,
        type: "voice.play",
        payload: {
          track: 1,
          source: "ai_voice"
        }
      };
      aiText = "Baik tuan, saya putar suara smartbox.";
    }

    if (mqttCmd) {
      try {
        const { publishMessage } = await import("../../../../lib/mqtt-server");
        await publishMessage(`smartbox/${deviceId}/cmd`, mqttCmd);
        console.log(`[CHAT-AUDIO] Sent MQTT Command to smartbox/${deviceId}/cmd:`, mqttCmd);
      } catch (mqttCmdErr) {
        console.warn("[CHAT-AUDIO] Failed to publish MQTT command:", mqttCmdErr);
      }
    }

    // Step 2: Convert jawaban ke audio via Gemini TTS
    let audioUrl: string | null = null;
    let audioSize = 0;

    try {
      const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-tts";
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

    // Update log sukses ke Neon DB
    if (interactionId) {
      try {
        await prisma.voiceInteraction.update({
          where: { id: interactionId },
          data: {
            transcript: userQuery,
            replyText: aiText,
            audioUrl: audioUrl || null,
            status: "success",
          },
        });
        console.log(`[CHAT-AUDIO] Updated DB log ID: ${interactionId} to success`);
      } catch (dbErr) {
        console.warn("[CHAT-AUDIO] DB log update success failed:", dbErr);
      }
    }

    // Kirim event ke MQTT broker
    try {
      const { publishMessage } = await import("../../../../lib/mqtt-server");
      await publishMessage(`smartbox/${deviceId}/event`, {
        deviceId,
        level: "INFO",
        type: "ai.chat",
        message: `AI Chat: ${userQuery.substring(0, 50)}`,
        payload: {
          query: userQuery,
          response: aiText,
          audioUrl,
        },
      });
    } catch (mqttErr) {
      console.warn("[CHAT-AUDIO] MQTT publish failed:", mqttErr);
    }

    // Return format response lengkap untuk mendukung ESP32 lama & spesifikasi JSON baru
    return NextResponse.json({
      success: true,
      transcript: userQuery,
      replyText: aiText,
      text: aiText,
      audioUrl,
      audioSize,
      deviceId,
      query: userQuery,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CHAT-AUDIO] Error:", message);
    
    // Update log ke error di Neon DB
    if (interactionId) {
      try {
        await prisma.voiceInteraction.update({
          where: { id: interactionId },
          data: {
            status: "error",
            error: message,
          },
        });
        console.log(`[CHAT-AUDIO] Updated DB log ID: ${interactionId} to error`);
      } catch (dbErr) {
        console.warn("[CHAT-AUDIO] DB log update error failed:", dbErr);
      }
    }

    return NextResponse.json(
      { success: false, message: "Gagal memproses audio AI", error: message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}


export async function GET() {
  return NextResponse.json({
    endpoint: "/api/gemini/chat-audio",
    method: "POST",
    description: "AI chat untuk tombol hitam Smartbox Assistant",
  });
}
