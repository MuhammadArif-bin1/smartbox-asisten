# Testing Checklist — Smartbox Assistant Fitur Suara

> Checklist ini untuk memverifikasi semua fitur suara berfungsi dengan benar setelah flash firmware dan deploy Next.js.

---

## Persiapan Hardware

- [ ] ESP32-S3 DevKitC-1 terhubung ke komputer via USB
- [ ] DFPlayer Mini terhubung ke GPIO8 (RX) dan GPIO18 (TX) via resistor 1K
- [ ] MicroSD berisi file `0001.mp3` s/d `0013.mp3` di root, format FAT32
- [ ] DFPlayer Mini mendapat power 5V stabil
- [ ] GND ESP32 dan GND DFPlayer disatukan
- [ ] Amplifier/speaker terhubung ke DFPlayer ADAC/ADAB
- [ ] MQ-2 terhubung ke GPIO3 dan sudah warmup 30 detik
- [ ] PIR terhubung ke GPIO9
- [ ] LED 12C/LED 12V terhubung ke GPIO12 (via transistor/MOSFET)
- [ ] RTC DS3231 terhubung ke SDA/GPIO1, SCL/GPIO2
- [ ] Relay 1 di GPIO21, Relay 2 di GPIO47 (LOW LEVEL TRIGGER)
- [ ] Tombol hitam di GPIO7, putih di GPIO19, merah di GPIO20 (PULLUP aktif)
- [ ] Transistor/TIP122 di GPIO14 untuk power amplifier

---

## 1. Verifikasi Serial Monitor saat Boot

Buka Serial Monitor 115200 baud, catat output berikut:

### 1a. Kalibrasi MQ-2
```
====================================================
[MQ2 CALIBRATION] Mulai kalibrasi dengan 100 samples...
[MQ2 CALIBRATION] Pastikan sensor di udara bersih!
[MQ2 CALIBRATION] Sample 1/100: xxx
...
[MQ2 CALIBRATION] SELESAI!
[MQ2 CALIBRATION] Baseline (rata-rata): xxx
[MQ2 CALIBRATION] Smoke threshold: xxx (baseline + 250)
[MQ2 CALIBRATION] Gas threshold  : xxx (baseline + 400)
[MQ2 CALIBRATION] Reset threshold: xxx (baseline + 150)
====================================================
```
- [ ] ✅ Kalibrasi selesai tanpa error
- [ ] ✅ Baseline masuk akal (biasanya 400-800 di udara bersih)
- [ ] ✅ Threshold dihitung otomatis dari baseline + offset

### 1b. DFPlayer Init
```
[DFPLAYER] Siap!
[DFPLAYER] Volume diset ke 25
```
- [ ] ✅ DFPlayer ready
- [ ] ✅ Jika gagal: cek TX/RX, power 5V, resistor 1K, format microSD

### 1c. WiFi & MQTT
```
[WIFI] Connected.
[WIFI] IP: 10.48.31.x
[MQTT] Connected.
```
- [ ] ✅ WiFi OK
- [ ] ✅ MQTT terhubung ke HiveMQ Cloud

### 1d. Debug MQ2 setiap 5 detik
```
---------- [MQ2 DEBUG] ----------
MQ2 value      : xxx
Baseline       : xxx
Smoke threshold: xxx (baseline + 250)
Gas threshold  : xxx (baseline + 400)
Reset threshold: xxx (baseline + 150)
Gas status     : normal
Asap status    : normal
DFPlayer status: ready
Gas audio cooldown: 0 ms tersisa
---------------------------------
```
- [ ] ✅ Debug MQ2 muncul setiap 5 detik

---

## 2. Verifikasi Track DFPlayer (0001-0013)

Setiap track wajib diuji secara langsung menggunakan MQTT command atau tombol:

```json
{
  "type": "dfplayer.play",
  "payload": { "track": 1 }
}
```

| Track | File | Isi | Status |
|-------|------|-----|--------|
| 1 | 0001.mp3 | "Halo, saya Smartbox Assistant..." | [ ] ✅ |
| 2 | 0002.mp3 | "Menampilkan informasi waktu dan suhu..." | [ ] ✅ |
| 3 | 0003.mp3 | "Bluetooth aktif. Silakan sambungkan..." | [ ] ✅ |
| 4 | 0004.mp3 | "Selamat pagi, Tuan..." | [ ] ✅ |
| 5 | 0005.mp3 | "Selamat siang, Tuan..." | [ ] ✅ |
| 6 | 0006.mp3 | "Selamat sore, Tuan..." | [ ] ✅ |
| 7 | 0007.mp3 | "Perhatian! Asap terdeteksi..." | [ ] ✅ |
| 8 | 0008.mp3 | "Peringatan! Gas berbahaya..." | [ ] ✅ |
| 9 | 0009.mp3 | "Peringatan! Suhu ruangan terlalu tinggi..." | [ ] ✅ |
| 10 | 0010.mp3 | "Gerakan terdeteksi. Selamat datang!" | [ ] ✅ |
| 11 | 0011.mp3 | "Gerakan melompat terdeteksi." | [ ] ✅ |
| 12 | 0012.mp3 | "Gerakan melambaikan tangan terdeteksi..." | [ ] ✅ |
| 13 | 0013.mp3 | "Bluetooth Smartbox Assistant dimatikan." | [ ] |

---

## 3. Verifikasi MQ-2 Sensor (Gas & Asap)

### 3a. Test Deteksi Asap (tiup asap korek api ke dekat sensor)
- [ ] LED 12C/LED 12V berkedip cepat sebagai peringatan
- [ ] Track 0007.mp3 diputar SEKALI saat pertama terdeteksi
- [ ] Relay 1 ON otomatis (kipas/exhaust)
- [ ] Buzzer menyala
- [ ] MQTT event `smoke.detected` dipublish ke HiveMQ
- [ ] Serial: `[WARNING] ASAP TERDETEKSI! Relay 1 ON`
- [ ] Track TIDAK diputar ulang dalam 10 detik (cooldown aktif)
- [ ] Setelah asap hilang dan gasRaw < resetThreshold: LED kembali normal (berkedip pelan atau mati)
- [ ] Serial: `[WARNING] Gas/asap kembali normal`
- [ ] Relay 1 OFF otomatis

### 3b. Test Deteksi Gas (dekatkan gas korek ke sensor)
- [ ] LED 12C/LED 12V berkedip cepat sebagai peringatan
- [ ] Track 0008.mp3 diputar SEKALI
- [ ] Cooldown 10 detik berfungsi (tidak spam)
- [ ] MQTT event `gas.detected` dipublish

### 3c. Test Hysteresis (tidak flicker)
- [ ] Kondisi gas/asap berfluktuasi di sekitar threshold: status TIDAK berubah-ubah (hysteresis via resetThreshold)
- [ ] Suara tidak diputar berulang kali saat sensor di ambang batas

---

## 4. Verifikasi Tombol

### 4a. Tombol Hitam (GPIO7) - Short Press < 1 detik
- [ ] Serial: debug jam dan suhu dikirim
- [ ] Track 0002.mp3 diputar ("Menampilkan informasi waktu dan suhu...")
- [ ] MQTT event `display.time.temperature` dipublish

### 4b. Tombol Hitam (GPIO7) - Long Press > 1 detik
- [ ] Serial: `[BUTTON] Black Button Long Press` debug muncul
- [ ] Track 0001.mp3 diputar sebagai feedback
- [ ] MQTT event `voice.record.start` dipublish
- [ ] Setelah dilepas: Serial: `[BUTTON] Black Button RELEASE`
- [ ] MQTT event `voice.record.stop` dipublish
- [ ] Dashboard website menerima event dan bisa memulai AI chat

### 4c. Tombol Putih (GPIO19) - Short Press
- [ ] Track 0001.mp3 diputar ("Halo, saya Smartbox Assistant...")
- [ ] Serial: `[BUTTON] Putih SHORT PRESS -> Perkenalan Diri Assistant`
- [ ] MQTT event `assistant_intro` dipublish

### 4d. Tombol Merah (GPIO20) - Short Press
- [ ] Bluetooth BLE ON/OFF toggle
- [ ] Jika ON: track 0003.mp3 diputar, RGB LED hijau berkedip
- [ ] Jika OFF: RGB LED merah
- [ ] MQTT event `button.red` dipublish

---

## 5. Verifikasi PIR Sensor

- [ ] Gerak terdeteksi: LED 12C/LED 12V menyala singkat (1 detik)
- [ ] Gerak terdeteksi: Relay 1 (lampu) ON otomatis
- [ ] MQTT event `pir.motion` dipublish ke HiveMQ
- [ ] Jika PIR Greeting diaktifkan via MQTT: track 0010.mp3 diputar
- [ ] Cooldown greeting 60 detik berfungsi (tidak spam)
- [ ] Tidak ada suara duplikat dalam 60 detik

---

## 6. Verifikasi MQTT Telemetry

Buka MQTT Explorer, subscribe ke `smartbox/smartbox-001/#`:

### 6a. Telemetry setiap 3 detik
- [ ] Topic: `smartbox/smartbox-001/telemetry`
- [ ] Field: `gasRaw`, `gasLevel`, `smokeDetected`, `gasDetected`, `temperatureC`
- [ ] Field: `smokeThreshold`, `gasThreshold`, `mq2Baseline`
- [ ] Field: `relay1`, `relay2`, `dfPlayerReady`

### 6b. Event saat sensor berubah
- [ ] Topic: `smartbox/smartbox-001/event`
- [ ] Tipe event: `smoke.detected`, `gas.detected`, `gas.normal`
- [ ] Event tombol: `assistant_intro`, `voice.record.start`

### 6c. Voice command dari website
- [ ] Publish: `{"type": "voice.play", "payload": {"voice": "smokeDetected"}}`
- [ ] ESP32 membalas ACK ke topic `ack`
- [ ] Track 0007.mp3 diputar

---

## 7. Verifikasi Next.js API Routes

### 7a. /api/gemini/tts
```bash
curl -X GET http://localhost:3000/api/gemini/tts
# Expected: endpoint info + track labels
```
- [ ] GET berhasil mengembalikan info endpoint

```bash
curl -X POST http://localhost:3000/api/gemini/tts \
  -H "Content-Type: application/json" \
  -d '{"track": 1}'
# Expected: { url: "/generated/...", filename: "0001.wav" }
# Atau error 500 jika GEMINI_API_KEY belum diisi
```
- [ ] POST berhasil (jika API key sudah diisi)
- [ ] File audio tersimpan di `public/generated/`

### 7b. /api/gemini/chat-audio
```bash
curl -X POST http://localhost:3000/api/gemini/chat-audio \
  -H "Content-Type: application/json" \
  -d '{"message": "Apa kabar?", "deviceId": "smartbox-001"}'
# Expected: { text: "...", audioUrl: "/generated/ai/..." }
```
- [ ] POST berhasil (jika API key sudah diisi)
- [ ] `text` berisi jawaban AI
- [ ] `audioUrl` berisi URL audio (jika TTS berhasil)

### 7c. /api/smartbox/events
```bash
curl http://localhost:3000/api/smartbox/events?deviceId=smartbox-001
# Expected: { events: [...] }
```
- [ ] GET berhasil

```bash
curl -X POST http://localhost:3000/api/smartbox/events \
  -H "Content-Type: application/json" \
  -d '{"type": "test.event", "message": "Test dari checklist"}'
# Expected: { success: true, event: {...} }
```
- [ ] POST berhasil menyimpan event ke DB

### 7d. /api/smartbox/status
```bash
curl http://localhost:3000/api/smartbox/status?deviceId=smartbox-001
# Expected: { status: {...} } atau { status: null }
```
- [ ] GET berhasil

---

## 8. Verifikasi Database (Neon PostgreSQL)

Buka Prisma Studio: `npx prisma studio`

- [ ] Tabel `SmartboxEvent` ada (baru)
- [ ] Tabel `SmartboxStatus` ada (baru)
- [ ] Data event tersimpan saat tombol putih ditekan
- [ ] Status di-update saat telemetry masuk
- [ ] Tabel lama (`SensorReading`, `EventLog`, dll) masih ada dan tidak rusak

---

## 9. Checklist Akhir Monitoring, Control, Jadwal, dan Greeting

- [ ] PIR HIGH terbaca di Serial Monitor ESP32
- [ ] Telemetry `pirDetected` dan `motionDetected` terkirim ke `smartbox/smartbox-001/telemetry`
- [ ] Worker menyimpan `pirDetected` ke `SensorReading` dan `SmartboxStatus`
- [ ] Monitoring menampilkan `Gerakan Terdeteksi`, `Tidak Ada Gerakan`, atau `Menunggu data PIR...`
- [ ] Kontrol cepat tersusun 1 kolom mobile, 2 kolom tablet, dan 3 kolom desktop
- [ ] Stop Kontak 1 ON/OFF menyalakan dan mematikan kipas
- [ ] Stop Kontak 2 ON/OFF mengaktifkan dan mematikan charger
- [ ] Jadwal relay ON/OFF berjalan dengan timezone `Asia/Jakarta`
- [ ] Jadwal tidak terpicu berulang dalam menit yang sama dan dapat berjalan lagi pada hari berikutnya
- [ ] Bagian `Aktuator Tambahan` tidak tampil di Devices Control
- [ ] Alarm jam 21:00 dengan track 6 memutar `0006.mp3`
- [ ] LCD alarm menampilkan `ALARM JADWAL` dan `TRACK 0006`
- [ ] Greeting PIR hanya memakai track `0010.mp3`, `0011.mp3`, atau `0012.mp3`
- [ ] Greeting PIR tidak terpicu sebelum jam mulai atau setelah jam selesai
- [ ] Rentang lintas tengah malam, misalnya 23:00-01:00, berfungsi
- [ ] Mode cooldown, sekali per jadwal, dan sekali per gerakan berfungsi
- [ ] LCD menampilkan `GERAKAN` / `TERDETEKSI` selama 4 detik
- [ ] Bluetooth ON menampilkan `BLUETOOTH` / `DIAKTIFKAN` dan memutar `0003.mp3` sekali
- [ ] Bluetooth OFF menampilkan `BLUETOOTH` / `DIMATIKAN` dan memutar `0013.mp3` sekali
- [ ] Boot memutar `0001.mp3` satu kali setelah DFPlayer siap
- [ ] Suara bahaya tidak ditimpa greeting PIR
- [ ] Semua pemutaran DFPlayer melewati `playVoice()`
- [ ] Pengaturan greeting tetap tersimpan setelah ESP32 restart

---

## 9. Verifikasi Generate Audio Script

> Wajib isi `GEMINI_API_KEY` di `.env` terlebih dahulu!

```bash
cd smartbox
npx tsx scripts/generate-audio.ts
```

- [ ] Script berjalan tanpa error
- [ ] 13 file audio di `scripts/output/dfplayer/` (0001.mp3 - 0013.mp3)
- [ ] 13 file audio di `public/generated/` (nama deskriptif)
- [ ] Salin file dari `dfplayer/` ke root microSD
- [ ] Pasang microSD ke DFPlayer Mini
- [ ] Test setiap track via MQTT command

---

## 10. Verifikasi Build & Deploy

```bash
cd smartbox

# Validasi Prisma schema
npx prisma validate
# Expected: Schema is valid

# Push schema ke Neon DB
npx prisma db push
# Expected: Schema applied successfully

# Generate Prisma client
npx prisma generate
# Expected: Generated Prisma Client

# Build Next.js
npm run build
# Expected: Build successful, no errors
```

- [ ] `prisma validate` berhasil
- [ ] `prisma db push` berhasil (tabel baru dibuat)
- [ ] `prisma generate` berhasil
- [ ] `npm run build` berhasil tanpa error TypeScript

---

## Catatan Troubleshooting

### DFPlayer tidak merespons
1. Cek TX ESP32 (GPIO18) → 1K resistor → RX DFPlayer
2. Cek RX ESP32 (GPIO8) ← TX DFPlayer
3. Cek power 5V ke VCC DFPlayer, GND bersama
4. Format microSD FAT32, nama file 4 digit (0001.mp3)
5. File di ROOT microSD, bukan subfolder

### MQ-2 terlalu sensitif / tidak sensitif
1. Buka Serial Monitor: cek nilai `Baseline` saat udara bersih
2. Kalau baseline > 1000: sensor mungkin perlu warmup lebih lama atau ada kebocoran gas kecil
3. Ubah offset via MQTT command: `{"type": "threshold.set", "payload": {"smokeThresholdOffset": 300}}`
4. Atau kalibrasi ulang: `{"type": "calibration.mq2", "payload": {"samples": 100}}`

### Track diputar berulang (spam)
- Pastikan edge detection aktif (`lastGasWarning` / `lastSmokeWarning` flag)
- Cooldown `GAS_VOICE_COOLDOWN_MS = 10000` (10 detik) harus aktif
- Hysteresis: suara tidak diputar ulang sampai gasRaw < resetThreshold

### Tombol putih tidak merespons
- Cek GPIO19 tidak konflik dengan USB
- Jika upload bermasalah, pindah ke GPIO39 dan update `WHITE_BTN_PIN`

---

## Checklist Devices Control dan Auto-Off

1. [ ] ESP32 dinyalakan.
2. [ ] LCD tampil `SMARTBOX READY` / `SIAP DIGUNAKAN`.
3. [ ] DFPlayer memutar `0001.mp3` satu kali.
4. [ ] Buka Devices Control.
5. [ ] Bagian Tambah Jadwal tidak tampil.
6. [ ] Bagian Daftar Jadwal Aktif tidak tampil.
7. [ ] Klik Stop Kontak 1 ON.
8. [ ] Relay 1 menyala.
9. [ ] LCD tampil `STOP KONTAK 1` / `KIPAS ON 1 MENIT`.
10. [ ] Setelah 1 menit, relay 1 OFF otomatis.
11. [ ] Toggle Stop Kontak 1 kembali OFF.
12. [ ] Klik Stop Kontak 2 ON.
13. [ ] Relay 2 menyala.
14. [ ] LCD tampil `STOP KONTAK 2` / `CHARGER 1 MENIT`.
15. [ ] Setelah 1 menit, relay 2 OFF otomatis.
16. [ ] Toggle Stop Kontak 2 kembali OFF.
17. [ ] Klik Bluetooth ON.
18. [ ] LCD tampil `BLUETOOTH` / `DIAKTIFKAN`.
19. [ ] DFPlayer memutar `0003.mp3`.
20. [ ] Klik Bluetooth OFF.
21. [ ] LCD tampil `BLUETOOTH` / `DIMATIKAN`.
22. [ ] DFPlayer memutar `0013.mp3`.
23. [ ] Test DFPlayer track `0013` dari UI berhasil.
24. [ ] Worker menerima ack dan event.
25. [ ] Dashboard menampilkan status yang sama dengan hardware.

---

*Checklist ini dibuat berdasarkan implementation plan Smartbox Assistant v1.0*
*Tanggal: 2026-06-13*
