/*
  ==========================================================
  SMARTBOX ASSISTANT ESP32-S3 - HARDWARE TEST TANPA AI BACKEND
  ==========================================================

  Versi ini sudah dibersihkan dari AI BACKEND URL,
  HTTP API Next.js, download MP3, dan playback response AI.

  Serial Monitor:
  115200 baud
  New Line

  Command Serial:
  help
  status
  df1 ... df15
  pirtest
  r1on / r1off
  r2on / r2off
  beep
  mic
  mq2
  lcd
  rtc
  rgb red / rgb green / rgb blue / rgb off
  audio on / audio off

  Catatan:
  - Fitur AI backend / Next.js API sudah dihapus agar tidak muncul error AI BACKEND URL.
  - Tombol hitam tekan lama hanya menampilkan status AI backend nonaktif.
*/

// ==========================================================
// LIBRARY
// ==========================================================
#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>

#include <Adafruit_NeoPixel.h>
#include <DFRobotDFPlayerMini.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>

#include <driver/i2s.h>
#include <math.h>

// ==========================================================
// WIFI + MQTT CONFIG
// ==========================================================
// Ganti sesuai WiFi kamu
const char *WIFI_SSID = "ISI_NAMA_WIFI_KAMU";
const char *WIFI_PASS = "ISI_PASSWORD_WIFI_KAMU";

// MQTT credential tetap disiapkan, tetapi di versi ini belum dipakai
const char *MQTT_HOST = "ISI_HOST_MQTT_KAMU";
const int MQTT_PORT = 8883;
const char *MQTT_USER = "ISI_USER_MQTT_KAMU";
const char *MQTT_PASS = "ISI_PASSWORD_MQTT_KAMU";
const char *DEVICE_ID = "smartbox-001";

// ==========================================================
// PIN MAP SMARTBOX
// ==========================================================

// I2C LCD + DS3231
#define I2C_SDA 1
#define I2C_SCL 2

// MQ2 Gas Sensor
#define MQ2_PIN 3

// INMP441 Microphone
#define MIC_SCK 4
#define MIC_WS 5
#define MIC_SD 6
#define MIC_I2S_PORT I2S_NUM_1

// Push Button
#define BLACK_BTN_PIN 7
#define WHITE_BTN_PIN 19
#define RED_BTN_PIN 20

// DFPlayer Mini
#define ESP_RX_PIN 8
#define ESP_TX_PIN 18

// PIR Motion
#define PIR_PIN 9

// IR + Buzzer
#define IR_PIN 42
#define BUZZER_PIN 10

// Bluetooth / Amplifier power via transistor
#define BT_BASE_PIN 14

// PT8211 DAC pin tetap disiapkan, tetapi playback AI sudah dihapus
#define PT_BCLK 15
#define PT_LRC 16
#define PT_DOUT 17
#define PT_I2S_PORT I2S_NUM_0

// Relay
#define RELAY_21 21
#define RELAY_47 47
#define RELAY_1_PIN RELAY_21
#define RELAY_2_PIN RELAY_47

// RGB LED onboard ESP32-S3
#define RGB_PIN 48
#define NUM_PIXELS 1

// ==========================================================
// RELAY LOGIC
// ==========================================================
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==========================================================
// DFPLAYER TRACK MAPPING
// ==========================================================
#define TRACK_STARTUP_READY 1
#define TRACK_TIME_TEMP_REALTIME 2
#define TRACK_BLUETOOTH_ACTIVE 3
#define TRACK_ALARM_MORNING 4
#define TRACK_ALARM_AFTERNOON 5
#define TRACK_ALARM_EVENING 6
#define TRACK_SMOKE_DETECTED 7
#define TRACK_GAS_DETECTED 8
#define TRACK_TEMP_DETECTED 9
#define TRACK_GESTURE_WALK 10
#define TRACK_GESTURE_JUMP 11
#define TRACK_GESTURE_WAVE 12
#define TRACK_BLUETOOTH_OFF 13
#define TRACK_HALO_AERO 14
#define TRACK_INTRO_AERO 15

#define DFPLAYER_MAX_TRACK 15

// ==========================================================
// AUDIO RECORD CONFIG UNTUK DEBUG MIC
// ==========================================================
#define RECORD_SAMPLE_RATE 16000
#define MIC_I2S_SHIFT 14
#define MIC_AUDIO_GAIN 2.0f

// INMP441 channel
// L/R ke GND biasanya LEFT
#define USE_LEFT_CHANNEL 1

// ==========================================================
// SENSOR CONFIG
// ==========================================================
int MQ2_GAS_THRESHOLD = 1400;
unsigned long PIR_COOLDOWN_MS = 60000;  // 1 menit cooldown PIR greeting

// ==========================================================
// OBJECTS
// ==========================================================
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;

HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;

Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

// ==========================================================
// STATE
// ==========================================================
bool lcdReady = false;
bool rtcReady = false;
bool dfPlayerReady = false;
bool micReady = false;
bool wifiReady = false;

bool relay1State = false;
bool relay2State = false;
bool buzzerState = false;
bool audioPowerState = false;

bool lastPirState = false;
unsigned long lastPirVoiceAt = 0;

unsigned long lastSensorPrintAt = 0;

// Button state
bool blackLastReading = HIGH;
bool blackStableState = HIGH;
bool blackLongPressHandled = false;
unsigned long blackLastChangeAt = 0;
unsigned long blackPressedAt = 0;

const unsigned long BLACK_DEBOUNCE_MS = 50;
const unsigned long BLACK_LONG_PRESS_MS = 1500;

// Bluetooth state
bool bluetoothState = false;

// MQ2 monitoring state
unsigned long lastMq2CheckAt = 0;
bool gasAlertActive = false;
unsigned long lastGasAlertAt = 0;
const unsigned long GAS_ALERT_COOLDOWN_MS = 10000;  // 10 detik cooldown alert gas

// ==========================================================
// LCD HELPERS
// ==========================================================
void lcdPrintLine(uint8_t row, String text) {
  if (!lcdReady) return;

  if (text.length() > 16) {
    text = text.substring(0, 16);
  }

  while (text.length() < 16) {
    text += " ";
  }

  lcd.setCursor(0, row);
  lcd.print(text);
}

void lcdShow(String line1, String line2) {
  if (!lcdReady) return;

  lcd.clear();
  lcdPrintLine(0, line1);
  lcdPrintLine(1, line2);
}

// ==========================================================
// I2C SCANNER
// ==========================================================
void scanI2C() {
  Serial.println();
  Serial.println("========== I2C SCANNER ==========");

  int count = 0;

  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("I2C device found: 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      count++;
    }
  }

  if (count == 0) {
    Serial.println("Tidak ada device I2C terdeteksi.");
  }

  Serial.println("=================================");
}

// ==========================================================
// INIT LCD
// ==========================================================
void initLCD() {
  Serial.println("[LCD] Init LCD I2C...");

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcdReady = true;

  lcdShow("SMARTBOX", "LCD READY");

  Serial.println("[LCD] Ready.");
}

// ==========================================================
// INIT RTC
// ==========================================================
void initRTC() {
  Serial.println("[RTC] Init DS3231...");

  if (!rtc.begin()) {
    rtcReady = false;
    Serial.println("[RTC ERROR] DS3231 tidak terdeteksi.");
    lcdShow("RTC ERROR", "CEK DS3231");
    return;
  }

  rtcReady = true;

  if (rtc.lostPower()) {
    Serial.println("[RTC WARNING] RTC lost power, set dari compile time.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  DateTime now = rtc.now();

  Serial.printf("[RTC] %02d:%02d:%02d %02d/%02d/%04d\n",
                now.hour(), now.minute(), now.second(),
                now.day(), now.month(), now.year());

  lcdShow("RTC DS3231", "READY");
}

// ==========================================================
// INIT RGB
// ==========================================================
void initRGB() {
  rgb.begin();
  rgb.clear();
  rgb.show();

  Serial.println("[RGB] Ready.");
}

void setRGB(uint8_t r, uint8_t g, uint8_t b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}

// ==========================================================
// AUDIO POWER / AMPLIFIER
// ==========================================================
void setAudioPower(bool state) {
  audioPowerState = state;
  digitalWrite(BT_BASE_PIN, state ? HIGH : LOW);

  Serial.print("[AUDIO POWER] ");
  Serial.println(state ? "ON" : "OFF");
}

// ==========================================================
// INIT DFPLAYER
// ==========================================================
void initDFPlayer() {
  Serial.println("[DFPLAYER] Init...");

  dfSerial.begin(9600, SERIAL_8N1, ESP_RX_PIN, ESP_TX_PIN);
  delay(1000);

  if (!dfPlayer.begin(dfSerial)) {
    dfPlayerReady = false;

    Serial.println("[DFPLAYER ERROR] Gagal terdeteksi.");
    Serial.println("Cek wiring:");
    Serial.println("TX DFPlayer -> GPIO8");
    Serial.println("RX DFPlayer -> GPIO18 via resistor 1K");
    Serial.println("VCC 5V stabil");
    Serial.println("GND common");
    Serial.println("SD Card FAT32");
    Serial.println("File 0001.mp3 - 0015.mp3");

    lcdShow("DFPLAYER ERROR", "CEK RX TX SD");
    return;
  }

  dfPlayerReady = true;
  dfPlayer.volume(25);
  dfPlayer.EQ(DFPLAYER_EQ_NORMAL);

  Serial.println("[DFPLAYER] Ready.");
  lcdShow("DFPLAYER", "READY");
}

void debugDFPlayerEvent() {
  if (!dfPlayerReady) return;

  if (dfPlayer.available()) {
    uint8_t type = dfPlayer.readType();
    int value = dfPlayer.read();

    Serial.println();
    Serial.println("========== DFPLAYER EVENT ==========");
    Serial.print("Type : ");
    Serial.println(type);
    Serial.print("Value: ");
    Serial.println(value);

    if (type == DFPlayerPlayFinished) {
      Serial.print("Track selesai: ");
      Serial.println(value);
    }

    if (type == DFPlayerError) {
      Serial.print("DFPlayer error code: ");
      Serial.println(value);

      if (value == Busy) Serial.println("Error: Busy");
      else if (value == Sleeping) Serial.println("Error: Sleeping");
      else if (value == SerialWrongStack) Serial.println("Error: Serial wrong stack");
      else if (value == CheckSumNotMatch) Serial.println("Error: Checksum not match");
      else if (value == FileIndexOut) Serial.println("Error: File index out");
      else if (value == FileMismatch) Serial.println("Error: File mismatch");
      else if (value == Advertise) Serial.println("Error: Advertise");
    }

    Serial.println("====================================");
  }
}

// ==========================================================
// LCD TEXT MAPPING UNTUK SETIAP SUARA DFPLAYER
// ==========================================================
void getDfPlayerLcdText(uint8_t track, const char* &line1, const char* &line2) {
  switch (track) {
    case 1:
      line1 = "SMARTBOX SIAP";
      line2 = "DIGUNAKAN";
      break;

    case 2:
      line1 = "JAM DAN SUHU";
      line2 = "REAL-TIME";
      break;

    case 3:
      line1 = "BLUETOOTH";
      line2 = "DIAKTIFKAN";
      break;

    case 4:
      line1 = "SELAMAT PAGI";
      line2 = "TUAN";
      break;

    case 5:
      line1 = "SELAMAT SIANG";
      line2 = "TUAN";
      break;

    case 6:
      line1 = "SELAMAT SORE";
      line2 = "TUAN";
      break;

    case 7:
      line1 = "ASAP";
      line2 = "TERDETEKSI";
      break;

    case 8:
      line1 = "GAS";
      line2 = "TERDETEKSI";
      break;

    case 9:
      line1 = "SUHU";
      line2 = "TERDETEKSI";
      break;

    case 10:
      line1 = "GERAKAN JALAN";
      line2 = "TERDETEKSI";
      break;

    case 11:
      line1 = "GERAKAN LOMPAT";
      line2 = "TERDETEKSI";
      break;

    case 12:
      line1 = "GERAKAN LAMBAI";
      line2 = "TERDETEKSI";
      break;

    case 13:
      line1 = "BLUETOOTH";
      line2 = "DIMATIKAN";
      break;

    case 14:
      line1 = "HALLO AERO";
      line2 = "SIAP MEMBANTU";
      break;

    case 15:
      line1 = "SAYA AERO";
      line2 = "ASSISTANTMU";
      break;

    default:
      line1 = "SMARTBOX";
      line2 = "SUARA DIPUTAR";
      break;
  }
}

// ==========================================================
// TAMPILKAN TEKS LCD BERDASARKAN TRACK DFPLAYER
// ==========================================================
void showDfPlayerLcdText(uint8_t track) {
  const char *line1;
  const char *line2;

  getDfPlayerLcdText(track, line1, line2);

  Serial.println();
  Serial.println("========== [LCD TEXT MAP] ==========");
  Serial.printf("[DFPLAYER] Track : %d\n", track);
  Serial.printf("[LCD] Line 1     : %s\n", line1);
  Serial.printf("[LCD] Line 2     : %s\n", line2);
  Serial.println("====================================");

  lcdShow(line1, line2);
}

// ==========================================================
// DFPLAYER PLAY DENGAN TEKS LCD SESUAI SAPAAN
// ==========================================================
void playDFTrack(uint8_t track, const char *reason) {
  Serial.println();
  Serial.println("========== DFPLAYER REQUEST ==========");
  Serial.printf("Track : %d\n", track);
  Serial.printf("Reason: %s\n", reason);
  Serial.printf("Ready : %s\n", dfPlayerReady ? "YES" : "NO");

  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Tidak ready.");
    lcdShow("DFPLAYER ERROR", "BELUM READY");
    return;
  }

  if (track < 1 || track > DFPLAYER_MAX_TRACK) {
    Serial.println("[DFPLAYER] Track invalid.");
    lcdShow("TRACK ERROR", "1 SAMPAI 15");
    return;
  }

  setAudioPower(true);
  delay(400);

  showDfPlayerLcdText(track);

  dfPlayer.play(track);

  Serial.println("[DFPLAYER] Command play dikirim.");
  Serial.println("=====================================");
}

// ==========================================================
// RELAY
// ==========================================================
void initRelays() {
  pinMode(RELAY_1_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(RELAY_2_PIN, OUTPUT_OPEN_DRAIN);

  digitalWrite(RELAY_1_PIN, RELAY_OFF);
  digitalWrite(RELAY_2_PIN, RELAY_OFF);

  relay1State = false;
  relay2State = false;

  Serial.println("[RELAY] Ready OFF.");
}

void setRelay1(bool state) {
  relay1State = state;
  digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF);

  Serial.print("[RELAY 1] ");
  Serial.println(state ? "ON" : "OFF");

  lcdShow("STOP KONTAK 1", state ? "ON" : "OFF");
}

void setRelay2(bool state) {
  relay2State = state;
  digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF);

  Serial.print("[RELAY 2] ");
  Serial.println(state ? "ON" : "OFF");

  lcdShow("STOP KONTAK 2", state ? "ON" : "OFF");
}

// ==========================================================
// BUZZER
// ==========================================================
void setBuzzer(bool state) {
  buzzerState = state;

  if (state) {
    tone(BUZZER_PIN, 1000);
  } else {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }

  Serial.print("[BUZZER] ");
  Serial.println(state ? "ON" : "OFF");
}

void beep() {
  Serial.println("[BUZZER] Beep.");

  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1200);
    delay(150);
    noTone(BUZZER_PIN);
    delay(150);
  }
}

// ==========================================================
// MIC INMP441 INIT
// ==========================================================
void initMic() {
  Serial.println("[MIC] Init INMP441...");

#if USE_LEFT_CHANNEL
  i2s_channel_fmt_t channelFormat = I2S_CHANNEL_FMT_ONLY_LEFT;
  Serial.println("[MIC] Channel LEFT");
#else
  i2s_channel_fmt_t channelFormat = I2S_CHANNEL_FMT_ONLY_RIGHT;
  Serial.println("[MIC] Channel RIGHT");
#endif

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = RECORD_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = channelFormat,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 512,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = MIC_SCK,
    .ws_io_num = MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = MIC_SD
  };

  esp_err_t err;

  err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[MIC ERROR] i2s_driver_install gagal: %d\n", err);
    micReady = false;
    return;
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[MIC ERROR] i2s_set_pin gagal: %d\n", err);
    micReady = false;
    return;
  }

  i2s_zero_dma_buffer(MIC_I2S_PORT);

  micReady = true;
  Serial.println("[MIC] Ready.");
}

void printMicDebug() {
  if (!micReady) {
    Serial.println("[MIC] Belum ready.");
    return;
  }

  int32_t rawSamples[256];
  size_t bytesRead = 0;

  esp_err_t err = i2s_read(
    MIC_I2S_PORT,
    rawSamples,
    sizeof(rawSamples),
    &bytesRead,
    pdMS_TO_TICKS(1000)
  );

  if (err != ESP_OK) {
    Serial.printf("[MIC ERROR] i2s_read gagal: %d\n", err);
    return;
  }

  int count = bytesRead / sizeof(int32_t);

  int peak = 0;
  uint64_t sumAbs = 0;
  uint64_t sumSquares = 0;

  for (int i = 0; i < count; i++) {
    int32_t shifted = rawSamples[i] >> MIC_I2S_SHIFT;
    float gained = shifted * MIC_AUDIO_GAIN;

    if (gained > 32767) gained = 32767;
    if (gained < -32768) gained = -32768;

    int16_t sample = (int16_t)gained;
    int absVal = abs((int)sample);

    if (absVal > peak) peak = absVal;

    sumAbs += absVal;
    sumSquares += (int64_t)sample * sample;
  }

  float avgAbs = count > 0 ? (float)sumAbs / count : 0;
  float rms = count > 0 ? sqrt((float)sumSquares / count) : 0;

  Serial.println();
  Serial.println("========== MIC DEBUG ==========");
  Serial.printf("Bytes : %d\n", bytesRead);
  Serial.printf("Peak  : %d\n", peak);
  Serial.printf("Avg   : %.1f\n", avgAbs);
  Serial.printf("RMS   : %.1f\n", rms);
  Serial.println("===============================");
}

// ==========================================================
// WIFI
// ==========================================================
void connectWiFi() {
  Serial.println();
  Serial.println("========== WIFI CONNECT ==========");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;

    Serial.println("[WIFI] Connected.");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());

    lcdShow("WIFI CONNECTED", WiFi.localIP().toString());
    setRGB(0, 100, 0);
  } else {
    wifiReady = false;

    Serial.println("[WIFI] Gagal connect.");
    lcdShow("WIFI ERROR", "CEK SSID PASS");
    setRGB(255, 0, 0);
  }
}

// ==========================================================
// MQ2 GAS / ASAP MONITORING
// ==========================================================
void checkMQ2() {
  if (millis() - lastMq2CheckAt < 2000) return;
  lastMq2CheckAt = millis();

  int mq2Value = analogRead(MQ2_PIN);

  if (mq2Value > MQ2_GAS_THRESHOLD) {
    if (!gasAlertActive || (millis() - lastGasAlertAt >= GAS_ALERT_COOLDOWN_MS)) {
      gasAlertActive = true;
      lastGasAlertAt = millis();

      Serial.println();
      Serial.println("========== GAS/ASAP ALERT ==========");
      Serial.printf("MQ2 Value: %d (Threshold: %d)\n", mq2Value, MQ2_GAS_THRESHOLD);

      if (mq2Value > 2000) {
        Serial.println("[MQ2] GAS BERBAHAYA TERDETEKSI!");
        playDFTrack(TRACK_GAS_DETECTED, "gas_danger");
      } else {
        Serial.println("[MQ2] ASAP TERDETEKSI!");
        playDFTrack(TRACK_SMOKE_DETECTED, "smoke_warning");
      }

      Serial.println("====================================");

      // Buzzer peringatan
      beep();
    }
  } else {
    if (gasAlertActive) {
      gasAlertActive = false;
      Serial.println("[MQ2] Gas/asap kembali normal.");
      lcdShow("GAS NORMAL", "AMAN");
    }
  }
}

// ==========================================================
// PIR CHECK - GREETING BERDASARKAN JAM
// ==========================================================
void checkPIR() {
  bool pirNow = digitalRead(PIR_PIN) == HIGH;

  if (pirNow != lastPirState) {
    Serial.print("[PIR] State: ");
    Serial.println(pirNow ? "GERAK / HIGH" : "DIAM / LOW");

    if (pirNow) {
      unsigned long now = millis();

      if (now - lastPirVoiceAt >= PIR_COOLDOWN_MS) {
        lastPirVoiceAt = now;

        uint8_t greetingTrack = TRACK_GESTURE_WALK;

        // Pilih sapaan berdasarkan jam RTC
        if (rtcReady) {
          DateTime rtcNow = rtc.now();
          int hour = rtcNow.hour();

          if (hour >= 5 && hour < 11) {
            greetingTrack = TRACK_ALARM_MORNING;   // Selamat pagi
          } else if (hour >= 11 && hour < 15) {
            greetingTrack = TRACK_ALARM_AFTERNOON; // Selamat siang
          } else if (hour >= 15 && hour < 18) {
            greetingTrack = TRACK_ALARM_EVENING;   // Selamat sore
          } else {
            greetingTrack = TRACK_GESTURE_WALK;    // Gerakan terdeteksi (malam)
          }

          Serial.printf("[PIR] Jam %02d -> Track %d\n", hour, greetingTrack);
        }

        playDFTrack(greetingTrack, "pir_greeting");
      } else {
        Serial.println("[PIR] Cooldown aktif.");
      }
    }

    lastPirState = pirNow;
  }
}

// ==========================================================
// BUTTON CHECK
// ==========================================================
void checkBlackButton() {
  bool reading = digitalRead(BLACK_BTN_PIN);
  unsigned long now = millis();

  if (reading != blackLastReading) {
    blackLastChangeAt = now;
  }

  blackLastReading = reading;

  if (now - blackLastChangeAt >= BLACK_DEBOUNCE_MS) {
    if (reading != blackStableState) {
      blackStableState = reading;

      if (blackStableState == LOW) {
        blackPressedAt = now;
        blackLongPressHandled = false;
        Serial.println("[BUTTON] Black pressed.");
      } else {
        if (!blackLongPressHandled) {
          Serial.println("[BUTTON] Black quick press -> Jam & Suhu.");

          // Tampilkan jam dan suhu real-time di LCD
          if (rtcReady) {
            DateTime now2 = rtc.now();
            float tempC = rtc.getTemperature();

            char l1[17];
            char l2[17];
            snprintf(l1, sizeof(l1), "JAM  %02d:%02d:%02d", now2.hour(), now2.minute(), now2.second());
            snprintf(l2, sizeof(l2), "SUHU %.1f C", tempC);

            lcdShow(l1, l2);

            Serial.println();
            Serial.println("========== JAM & SUHU ==========");
            Serial.printf("Waktu: %02d:%02d:%02d\n", now2.hour(), now2.minute(), now2.second());
            Serial.printf("Suhu : %.1f C\n", tempC);
            Serial.println("================================");
          } else {
            lcdShow("RTC ERROR", "BELUM READY");
          }

          playDFTrack(TRACK_TIME_TEMP_REALTIME, "black_quick_time_temp");
        }
      }
    }
  }

  if (blackStableState == LOW && !blackLongPressHandled) {
    if (now - blackPressedAt >= BLACK_LONG_PRESS_MS) {
      blackLongPressHandled = true;

      Serial.println("[BUTTON] Black long press -> AI backend sudah dihapus.");
      lcdShow("AI BACKEND", "SUDAH DIHAPUS");
      playDFTrack(TRACK_HALO_AERO, "black_long_ai_removed");
    }
  }
}

void checkOtherButtons() {
  static bool lastWhite = HIGH;
  static bool lastRed = HIGH;

  bool whiteNow = digitalRead(WHITE_BTN_PIN);
  bool redNow = digitalRead(RED_BTN_PIN);

  // Tombol Putih = Toggle Bluetooth ON / OFF
  if (lastWhite == HIGH && whiteNow == LOW) {
    bluetoothState = !bluetoothState;

    if (bluetoothState) {
      Serial.println("[BUTTON] White pressed -> Bluetooth ON.");
      setAudioPower(true);
      delay(400);
      playDFTrack(TRACK_BLUETOOTH_ACTIVE, "bluetooth_on");
    } else {
      Serial.println("[BUTTON] White pressed -> Bluetooth OFF.");
      playDFTrack(TRACK_BLUETOOTH_OFF, "bluetooth_off");
    }
  }

  // Tombol Merah = Perkenalan Otomatis (Halo Aero + Intro Aero)
  if (lastRed == HIGH && redNow == LOW) {
    Serial.println("[BUTTON] Red pressed -> Perkenalan Aero.");
    setAudioPower(true);
    delay(400);
    playDFTrack(TRACK_HALO_AERO, "red_halo_aero");
    delay(4000);
    playDFTrack(TRACK_INTRO_AERO, "red_intro_aero");
  }

  lastWhite = whiteNow;
  lastRed = redNow;
}

// ==========================================================
// SENSOR STATUS
// ==========================================================
void printSensorStatus() {
  if (millis() - lastSensorPrintAt < 5000) return;
  lastSensorPrintAt = millis();

  int mq2 = analogRead(MQ2_PIN);
  bool pir = digitalRead(PIR_PIN) == HIGH;
  bool ir = digitalRead(IR_PIN);

  Serial.println();
  Serial.println("========== SENSOR STATUS ==========");
  Serial.printf("MQ2 Raw : %d\n", mq2);
  Serial.printf("PIR     : %s\n", pir ? "GERAK" : "DIAM");
  Serial.printf("IR      : %s\n", ir == LOW ? "TERHALANG" : "AMAN");

  if (rtcReady) {
    DateTime now = rtc.now();
    Serial.printf("RTC     : %02d:%02d:%02d\n", now.hour(), now.minute(), now.second());
  }

  Serial.println("===================================");
}

// ==========================================================
// STATUS
// ==========================================================
void printStatus() {
  Serial.println();
  Serial.println("========== SMARTBOX STATUS ==========");
  Serial.printf("WiFi        : %s\n", WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
  Serial.printf("IP          : %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("LCD Ready   : %s\n", lcdReady ? "YES" : "NO");
  Serial.printf("RTC Ready   : %s\n", rtcReady ? "YES" : "NO");
  Serial.printf("DF Ready    : %s\n", dfPlayerReady ? "YES" : "NO");
  Serial.printf("Mic Ready   : %s\n", micReady ? "YES" : "NO");
  Serial.printf("Relay 1     : %s\n", relay1State ? "ON" : "OFF");
  Serial.printf("Relay 2     : %s\n", relay2State ? "ON" : "OFF");
  Serial.printf("Buzzer      : %s\n", buzzerState ? "ON" : "OFF");
  Serial.printf("Audio Power : %s\n", audioPowerState ? "ON" : "OFF");
  Serial.println("====================================");
}

// ==========================================================
// SERIAL COMMAND
// ==========================================================
void printHelp() {
  Serial.println();
  Serial.println("========== COMMAND LIST ==========");
  Serial.println("help       -> tampilkan command");
  Serial.println("status     -> cek semua status");
  Serial.println("df1-df15   -> test DFPlayer track");
  Serial.println("pirtest    -> paksa play 0010.mp3");
  Serial.println("ai         -> info AI backend sudah dihapus");
  Serial.println("mic        -> cek RMS mic");
  Serial.println("mq2        -> baca sensor MQ2");
  Serial.println("lcd        -> test LCD");
  Serial.println("rtc        -> tampil waktu RTC");
  Serial.println("r1on       -> relay 1 ON");
  Serial.println("r1off      -> relay 1 OFF");
  Serial.println("r2on       -> relay 2 ON");
  Serial.println("r2off      -> relay 2 OFF");
  Serial.println("beep       -> test buzzer");
  Serial.println("audio on   -> audio power ON");
  Serial.println("audio off  -> audio power OFF");
  Serial.println("rgb red    -> RGB merah");
  Serial.println("rgb green  -> RGB hijau");
  Serial.println("rgb blue   -> RGB biru");
  Serial.println("rgb off    -> RGB mati");
  Serial.println("==================================");
}

void handleSerialCommand() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toLowerCase();

  if (cmd == "help") {
    printHelp();
  }

  else if (cmd == "status") {
    printStatus();
  }

  else if (cmd == "ai") {
    Serial.println("[AI] Backend URL dan fitur API sudah dihapus dari firmware ini.");
    lcdShow("AI BACKEND", "SUDAH DIHAPUS");
  }

  else if (cmd == "mic") {
    printMicDebug();
  }

  else if (cmd == "mq2") {
    int mq2 = analogRead(MQ2_PIN);
    Serial.print("[MQ2] Raw: ");
    Serial.println(mq2);
  }

  else if (cmd == "lcd") {
    lcdShow("LCD TEST", "SMARTBOX OK");
  }

  else if (cmd == "rtc") {
    if (rtcReady) {
      DateTime now = rtc.now();
      Serial.printf("RTC: %02d:%02d:%02d %02d/%02d/%04d\n",
                    now.hour(), now.minute(), now.second(),
                    now.day(), now.month(), now.year());

      lcdShow("RTC TIME", String(now.hour()) + ":" + String(now.minute()));
    } else {
      Serial.println("RTC belum ready.");
    }
  }

  else if (cmd.startsWith("df")) {
    int track = cmd.substring(2).toInt();
    playDFTrack(track, "serial_test");
  }

  else if (cmd == "pirtest") {
    playDFTrack(TRACK_GESTURE_WALK, "pirtest");
  }

  else if (cmd == "r1on") {
    setRelay1(true);
  }

  else if (cmd == "r1off") {
    setRelay1(false);
  }

  else if (cmd == "r2on") {
    setRelay2(true);
  }

  else if (cmd == "r2off") {
    setRelay2(false);
  }

  else if (cmd == "beep") {
    beep();
  }

  else if (cmd == "audio on") {
    setAudioPower(true);
  }

  else if (cmd == "audio off") {
    setAudioPower(false);
  }

  else if (cmd == "rgb red") {
    setRGB(255, 0, 0);
  }

  else if (cmd == "rgb green") {
    setRGB(0, 255, 0);
  }

  else if (cmd == "rgb blue") {
    setRGB(0, 0, 255);
  }

  else if (cmd == "rgb off") {
    setRGB(0, 0, 0);
  }

  else {
    Serial.println("Command tidak dikenal. Ketik help.");
  }
}

// ==========================================================
// SETUP
// ==========================================================
void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println();
  Serial.println("=================================================");
  Serial.println("SMARTBOX ASSISTANT - HARDWARE TEST NO AI BACKEND");
  Serial.println("=================================================");

  pinMode(MQ2_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(IR_PIN, INPUT);

  pinMode(BLACK_BTN_PIN, INPUT_PULLUP);
  pinMode(WHITE_BTN_PIN, INPUT_PULLUP);
  pinMode(RED_BTN_PIN, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(BT_BASE_PIN, OUTPUT);
  digitalWrite(BT_BASE_PIN, LOW);

  initRelays();

  initRGB();
  setRGB(0, 0, 80);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  scanI2C();
  initLCD();
  initRTC();

  setAudioPower(true);
  initDFPlayer();

  initMic();

  connectWiFi();

  lcdShow("SMARTBOX READY", "SIAP DIGUNAKAN");

  if (dfPlayerReady) {
    playDFTrack(TRACK_STARTUP_READY, "startup");
  }

  printHelp();
}

// ==========================================================
// LOOP
// ==========================================================
void loop() {
  handleSerialCommand();

  debugDFPlayerEvent();

  checkBlackButton();
  checkOtherButtons();

  checkMQ2();
  checkPIR();
  printSensorStatus();

  delay(5);
}
