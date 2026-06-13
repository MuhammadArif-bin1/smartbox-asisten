/**
 * scripts/generate-audio.ts
 *
 * Script untuk generate 13 file audio DFPlayer via Gemini TTS API.
 * Jalankan MANUAL setelah mengisi GEMINI_API_KEY di .env.
 *
 * Cara pakai:
 *   npx tsx scripts/generate-audio.ts
 *
 * Untuk generate ulang semua (paksa overwrite):
 *   npx tsx scripts/generate-audio.ts --force
 *
 * Untuk generate track tertentu saja:
 *   npx tsx scripts/generate-audio.ts --track=13
 *
 * Output:
 *   - public/generated/         (Web-accessible, nama deskriptif)
 *   - scripts/output/dfplayer/  (Untuk di-copy ke microSD DFPlayer)
 *     `-- 0001.mp3 s/d 0013.mp3
 *
 * Aturan DFPlayer:
 *   - Nama file HARUS 4 digit: 0001.mp3, 0002.mp3, ..., 0013.mp3
 *   - Taruh di ROOT microSD (bukan folder)
 *   - Format microSD: FAT32
 */

import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";

// ---- FIX: Gunakan import.meta.url agar kompatibel dengan ES Modules ----
const __filename = url.fileURLToPath(import.meta.url);
// Pastikan __dirname benar-benar menunjuk ke direktori scripts/
const __dirname = fs.statSync(__filename).isDirectory() ? __filename : path.dirname(__filename);
// -------------------------------------------------------------------------

// Load .env dari folder smartbox/
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[CONFIG] Loaded .env dari: ${envPath}`);
} else {
  console.error(`[CONFIG] ERROR: .env tidak ditemukan di ${envPath}`);
  process.exit(1);
}

// Parse argumen CLI
const args = process.argv.slice(2);
const forceRegenerate = args.includes("--force");
const onlyTrackArg = args.find((a) => a.startsWith("--track="));
const onlyTrack = onlyTrackArg ? parseInt(onlyTrackArg.split("=")[1]) : null;

// =========================================================
// KONFIGURASI TRACK - Sesuai spesifikasi
// =========================================================
interface TrackConfig {
  track: number;
  filename: string;  // Nama file DFPlayer (4 digit)
  label: string;     // Label untuk nama file web
  text: string;      // Teks yang akan di-TTS
  voice?: string;    // Voice Gemini (default: Charon)
}

const TRACKS: TrackConfig[] = [
  {
    track: 1,
    filename: "0001",
    label: "smartbox_siap_digunakan",
    text: "Halo, saya Smartbox Assistant. Sistem siap digunakan. Apa yang bisa saya bantu hari ini?",
    voice: "Charon",
  },
  {
    track: 2,
    filename: "0002",
    label: "menampilkan_jam_suhu",
    text: "Menampilkan informasi waktu dan suhu ruangan secara real-time.",
    voice: "Charon",
  },
  {
    track: 3,
    filename: "0003",
    label: "bluetooth_diaktifkan",
    text: "Bluetooth aktif. Silakan sambungkan perangkat Anda dengan Smartbox Assistant.",
    voice: "Charon",
  },
  {
    track: 4,
    filename: "0004",
    label: "selamat_pagi",
    text: "Selamat pagi, Tuan. Semoga hari Anda menyenangkan dan penuh semangat.",
    voice: "Charon",
  },
  {
    track: 5,
    filename: "0005",
    label: "selamat_siang",
    text: "Selamat siang, Tuan. Jangan lupa makan siang dan istirahat sejenak.",
    voice: "Charon",
  },
  {
    track: 6,
    filename: "0006",
    label: "selamat_sore",
    text: "Selamat sore, Tuan. Waktunya bersantai setelah hari yang panjang.",
    voice: "Charon",
  },
  {
    track: 7,
    filename: "0007",
    label: "asap_terdeteksi",
    text: "Perhatian! Asap terdeteksi di area Anda. Segera periksa dan ventilasi ruangan.",
    voice: "Charon",
  },
  {
    track: 8,
    filename: "0008",
    label: "gas_terdeteksi",
    text: "Peringatan! Gas berbahaya terdeteksi. Segera jauhi area dan ventilasi ruangan dengan membuka jendela.",
    voice: "Charon",
  },
  {
    track: 9,
    filename: "0009",
    label: "suhu_terdeteksi",
    text: "Peringatan! Suhu ruangan terlalu tinggi. Aktifkan pendingin udara atau buka jendela.",
    voice: "Charon",
  },
  {
    track: 10,
    filename: "0010",
    label: "gerakan_berjalan",
    text: "Gerakan terdeteksi. Selamat datang!",
    voice: "Charon",
  },
  {
    track: 11,
    filename: "0011",
    label: "gerakan_melompat",
    text: "Gerakan melompat terdeteksi.",
    voice: "Charon",
  },
  {
    track: 12,
    filename: "0012",
    label: "gerakan_melambaikan_tangan",
    text: "Gerakan melambaikan tangan terdeteksi. Halo, selamat datang!",
    voice: "Charon",
  },
  {
    track: 13,
    filename: "0013",
    label: "bluetooth_dimatikan",
    text: "Bluetooth Smartbox Assistant dimatikan.",
    voice: "Charon",
  },
];

const VOICE_STYLE =
  "Bicara dengan jelas, tegas, dan profesional dalam bahasa Indonesia. " +
  "Suara pria dewasa, nada tenang namun tegas. " +
  "Kecepatan bicara normal, tidak terlalu cepat atau lambat.";

// =========================================================
// SLEEP HELPER
// =========================================================
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// =========================================================
// GENERATE SATU TRACK (dengan retry untuk 429)
// =========================================================
async function generateTrack(
  track: TrackConfig,
  ttsModel: string,
  GEMINI_API_KEY: string,
  webOutputDir: string,
  dfOutputDir: string
): Promise<{ success: boolean; size?: number; error?: string; skipped?: boolean }> {

  // Cek apakah file sudah ada (untuk skip)
  const ext = "mp3";
  const dfFilePath = path.join(dfOutputDir, `${track.filename}.${ext}`);

  if (fs.existsSync(dfFilePath) && !forceRegenerate) {
    const sizeKB = Math.round(fs.statSync(dfFilePath).size / 1024);
    console.log(
      `[${track.track}/12] Lewati track ${track.filename}.${ext} (sudah ada | ${sizeKB} KB)`
    );
    return { success: true, skipped: true };
  }

  console.log(
    `[${track.track}/12] Generating track ${track.filename}.mp3: "${track.text.substring(0, 60)}..."`
  );

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${GEMINI_API_KEY}`;

  const MAX_RETRIES = 5;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${VOICE_STYLE}\n\n${track.text}` }],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: track.voice || "Charon" },
              },
            },
          },
        }),
      });

      // Handle 429 Rate Limit
      if (response.status === 429) {
        // Coba baca Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        let waitSec = retryAfter ? parseInt(retryAfter) : 30 * attempt;
        waitSec = Math.min(waitSec, 120); // Maksimal 2 menit

        console.log(
          `  [RATE LIMIT] HTTP 429. Menunggu ${waitSec}s sebelum retry (Percobaan ${attempt}/${MAX_RETRIES})...`
        );
        await sleep(waitSec * 1000);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        lastError = `HTTP ${response.status}: ${errText.substring(0, 200)}`;
        console.error(`  [ERROR] ${lastError}`);

        // Jangan retry untuk error selain 429 dan 5xx
        if (response.status < 500) break;

        await sleep(5000 * attempt);
        continue;
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find(
        (p: { inlineData?: { mimeType?: string } }) =>
          p.inlineData?.mimeType?.startsWith("audio/")
      );

      if (!audioPart?.inlineData?.data) {
        lastError = "Tidak ada data audio dalam response";
        console.error(`  [ERROR] ${lastError}`);
        break;
      }

      const audioBuffer = Buffer.from(audioPart.inlineData.data, "base64");
      const mimeType = audioPart.inlineData.mimeType || "audio/wav";
      const ext = "mp3";

      // Simpan ke folder DFPlayer
      const dfFilename = `${track.filename}.${ext}`;
      const dfFilePath = path.join(dfOutputDir, dfFilename);
      fs.writeFileSync(dfFilePath, audioBuffer);

      // Simpan ke folder web
      const webFilename = `track_${String(track.track).padStart(2, "0")}_${track.label}.${ext}`;
      const webFilePath = path.join(webOutputDir, webFilename);
      fs.writeFileSync(webFilePath, audioBuffer);

      const sizeKB = Math.round(audioBuffer.length / 1024);
      console.log(
        `  [OK] ${dfFilename} | ${webFilename} | ${sizeKB} KB | ${mimeType}`
      );

      return { success: true, size: audioBuffer.length };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`  [ERROR] ${lastError}`);
      if (attempt < MAX_RETRIES) await sleep(3000 * attempt);
    }
  }

  return { success: false, error: lastError };
}

// =========================================================
// MAIN
// =========================================================
async function generateAudio() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
    console.error(
      "\n[ERROR] GEMINI_API_KEY belum diisi di file .env!\n" +
        "Buka smartbox/.env dan isi:\n" +
        '  GEMINI_API_KEY="masukkan_api_key_gemini_anda_disini"\n'
    );
    process.exit(1);
  }

  const ttsModel =
    process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";

  const webOutputDir = path.join(__dirname, "..", "public", "generated");
  const dfOutputDir = path.join(__dirname, "output", "dfplayer");

  [webOutputDir, dfOutputDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[DIR] Dibuat: ${dir}`);
    }
  });

  // Filter track jika --track= diset
  const tracksToProcess = onlyTrack
    ? TRACKS.filter((t) => t.track === onlyTrack)
    : TRACKS;

  if (onlyTrack && tracksToProcess.length === 0) {
    console.error(`[ERROR] Track ${onlyTrack} tidak ditemukan (valid: 1-13)`);
    process.exit(1);
  }

  console.log("\n======================================================");
  console.log(" SMARTBOX ASSISTANT - GENERATE AUDIO TRACKS");
  console.log("======================================================");
  console.log(`Model TTS   : ${ttsModel}`);
  console.log(`Web output  : ${webOutputDir}`);
  console.log(`DF output   : ${dfOutputDir}`);
  console.log(`Total tracks: ${tracksToProcess.length}`);
  console.log(`Force regen : ${forceRegenerate ? "YA" : "Tidak (skip jika sudah ada)"}`);
  console.log("======================================================\n");

  const results: {
    track: number;
    success: boolean;
    size?: number;
    error?: string;
    skipped?: boolean;
  }[] = [];

  for (const track of tracksToProcess) {
    const result = await generateTrack(
      track,
      ttsModel,
      GEMINI_API_KEY,
      webOutputDir,
      dfOutputDir
    );
    results.push({ track: track.track, ...result });

    // Jika tidak di-skip, tunggu sebentar antar request
    if (!result.skipped && result.success) {
      await sleep(2000);
    }
  }

  // Summary
  console.log("\n======================================================");
  console.log(" HASIL GENERATE AUDIO");
  console.log("======================================================");
  const success = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);

  console.log(`Berhasil : ${success.length} track baru digenerate`);
  console.log(`Dilewati : ${skipped.length} track (sudah ada)`);
  console.log(`Gagal    : ${failed.length} track`);

  if (failed.length > 0) {
    console.log("\nTrack yang gagal:");
    failed.forEach((r) => console.log(`  - Track ${r.track}: ${r.error}`));
    console.log(
      "\nTips untuk track yang gagal karena rate limit (429):\n" +
        "  Tunggu beberapa menit lalu jalankan ulang:\n" +
        `  npx tsx scripts/generate-audio.ts --track=${failed[0]?.track}`
    );
  }

  if (success.length > 0 || skipped.length > 0) {
    console.log("\n[LANGKAH SELANJUTNYA]");
    console.log(`1. Buka folder: ${dfOutputDir}`);
    console.log("2. Salin SEMUA file (0001.mp3 s/d 0013.mp3) ke ROOT microSD");
    console.log("3. Format microSD: FAT32, nama file HARUS 4 digit");
    console.log("4. Pasang microSD ke DFPlayer Mini");
    console.log("5. Upload firmware ke ESP32-S3 dan test setiap track");
  }

  console.log("======================================================\n");

  if (failed.length > 0) process.exit(1);
}

generateAudio().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
