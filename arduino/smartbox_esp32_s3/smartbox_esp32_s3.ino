/*
  ==========================================================
  SMARTBOX ASSISTANT IoT - ESP32-S3
  Monitoring Sensor + DFPlayer + LCD + Relay + MQTT
  ==========================================================

  Fitur:
  - Monitoring suhu DS3231
  - Monitoring gas/asap MQ-2
  - Monitoring gerakan PIR
  - DFPlayer suara 0001.mp3 - 0015.mp3
  - LCD I2C 16x2
  - Relay Stop Kontak 1 auto OFF 1 menit
  - Relay Stop Kontak 2 auto OFF 1 menit
  - Relay Bluetooth ON/OFF + suara + LCD
  - Tombol merah GPIO20 = toggle Bluetooth
  - Tombol putih GPIO19 = suara perkenalan Aero
  - Tombol hitam GPIO7:
      tekan cepat = jam dan suhu
      tahan lama = sapaan AI lokal / Aero
  - MQTT telemetry / event / ack / status
  - MQTT command:
      voice.play
      relay.set
      bluetooth.set
      buzzer.set
      sensor.set
      sensor.calibrate

  Board:
  ESP32-S3 DevKitC-1

  Serial Monitor:
  115200 baud
*/

// ==========================================================
// LIBRARY
// ==========================================================
#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <DFRobotDFPlayerMini.h>
#include <LiquidCrystal_I2C.h>
#include <PubSubClient.h>
#include <RTClib.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

// ==========================================================
// WIFI + MQTT CONFIG
// ==========================================================
// GANTI SESUAI WIFI DAN MQTT KAMU
const char *WIFI_SSID = "vivo Y29";
const char *WIFI_PASS = "12345678";

const char *MQTT_HOST =
    "wss://6559400ba6c741398aa7048b471d5a31.s1.eu.hivemq.cloud:8884/mqtt";
const int MQTT_PORT = 8883;
const char *MQTT_USER = "smartbox001";
const char *MQTT_PASS = "Smartbox123!";

const char *DEVICE_ID = "smartbox-001";

// MQTT Topic
String topicCmd() { return "smartbox/" + String(DEVICE_ID) + "/cmd"; }
String topicTelemetry() {
  return "smartbox/" + String(DEVICE_ID) + "/telemetry";
}
String topicEvent() { return "smartbox/" + String(DEVICE_ID) + "/event"; }
String topicAck() { return "smartbox/" + String(DEVICE_ID) + "/ack"; }
String topicStatus() { return "smartbox/" + String(DEVICE_ID) + "/status"; }

// ==========================================================
// PIN ESP32-S3
// ==========================================================

// LCD I2C + RTC DS3231
#define I2C_SDA 1
#define I2C_SCL 2

// MQ-2
#define MQ2_PIN 3

// INMP441
#define MIC_SCK 4
#define MIC_WS 5
#define MIC_SD 6

// Tombol
#define BLACK_BTN_PIN 7
#define WHITE_BTN_PIN 19
#define RED_BTN_PIN 20

// DFPlayer Mini
#define ESP_RX_PIN 8  // TX DFPlayer -> RX ESP32 GPIO8
#define ESP_TX_PIN 18 // RX DFPlayer <- TX ESP32 GPIO18 via resistor 1K

// PIR
#define PIR_PIN 9

// Buzzer
#define BUZZER_PIN 10

// Bluetooth / amplifier relay transistor
#define BT_BASE_PIN 14

// PT8211 DAC pin, disiapkan jika nanti dipakai
#define PT_BCLK 15
#define PT_LRC 16
#define PT_DOUT 17

// Relay Stop Kontak
#define RELAY_1_PIN 21
#define RELAY_2_PIN 47

// RGB onboard
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
#define TRACK_AI_HELLO 14
#define TRACK_AI_INTRO 15

#define DFPLAYER_MAX_TRACK 15

// ==========================================================
// SENSOR CONFIG
// ==========================================================
int MQ2_SMOKE_THRESHOLD = 1400;
int MQ2_GAS_THRESHOLD = 1800;

float TEMP_WARNING_THRESHOLD = 35.0;

// Cooldown suara
const unsigned long GAS_VOICE_COOLDOWN_MS = 10000;
const unsigned long TEMP_VOICE_COOLDOWN_MS = 15000;
const unsigned long PIR_VOICE_COOLDOWN_MS = 8000;

// Telemetry interval
const unsigned long TELEMETRY_INTERVAL_MS = 2000;
const unsigned long STATUS_INTERVAL_MS = 10000;

// ==========================================================
// OBJECTS
// ==========================================================
LiquidCrystal_I2C lcd(0x27, 16, 2);
// Jika LCD tidak tampil, ganti 0x27 menjadi 0x3F

RTC_DS3231 rtc;

HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;

Adafruit_NeoPixel rgb(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

WiFiClientSecure wifiSecure;
PubSubClient mqtt(wifiSecure);

// ==========================================================
// STATE
// ==========================================================
bool lcdReady = false;
bool rtcReady = false;
bool dfReady = false;
bool wifiReady = false;
bool mqttReadyFlag = false;

bool relay1State = false;
bool relay2State = false;
bool bluetoothState = false;
bool buzzerState = false;

bool gasSensorEnabled = true;
bool tempSensorEnabled = true;
bool pirSensorEnabled = true;
bool sleepModeEnabled = false;

int mq2Value = 0;
bool smokeDetected = false;
bool gasDetected = false;
bool pirMotion = false;
float temperatureC = 0.0;

bool lastPirState = false;

unsigned long lastTelemetryAt = 0;
unsigned long lastStatusAt = 0;

unsigned long lastGasVoiceAt = 0;
unsigned long lastTempVoiceAt = 0;
unsigned long lastPirVoiceAt = 0;

// Relay auto off
bool relay1AutoOffActive = false;
bool relay2AutoOffActive = false;

unsigned long relay1AutoOffAt = 0;
unsigned long relay2AutoOffAt = 0;

// PIR track rotate
int pirGreetingIndex = 0;
int pirTracks[] = {TRACK_GESTURE_WALK, TRACK_GESTURE_JUMP, TRACK_GESTURE_WAVE};

// Button debounce
bool redLastState = HIGH;
bool whiteLastState = HIGH;
bool blackLastState = HIGH;

unsigned long redLastPressAt = 0;
unsigned long whiteLastPressAt = 0;
unsigned long blackLastChangeAt = 0;
unsigned long blackPressedAt = 0;

bool blackLongPressHandled = false;

const unsigned long BUTTON_DEBOUNCE_MS = 250;
const unsigned long BLACK_LONG_PRESS_MS = 1500;

// ==========================================================
// LCD HELPER
// ==========================================================
void lcdPrintLine(uint8_t row, String text) {
  if (!lcdReady)
    return;

  if (text.length() > 16) {
    text = text.substring(0, 16);
  }

  while (text.length() < 16) {
    text += " ";
  }

  lcd.setCursor(0, row);
  lcd.print(text);
}

void showLCD(String line1, String line2) {
  if (!lcdReady)
    return;

  lcd.clear();
  lcdPrintLine(0, line1);
  lcdPrintLine(1, line2);

  Serial.print("[LCD] ");
  Serial.print(line1);
  Serial.print(" / ");
  Serial.println(line2);
}

// ==========================================================
// RGB HELPER
// ==========================================================
void setRGB(uint8_t r, uint8_t g, uint8_t b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}

// ==========================================================
// MQTT JSON PUBLISH
// ==========================================================
template <typename TDoc>
bool publishJson(const String &topic, TDoc &doc, bool retained = false) {
  if (!mqtt.connected())
    return false;

  String output;
  serializeJson(doc, output);

  Serial.print("[MQTT PUB] ");
  Serial.print(topic);
  Serial.print(" -> ");
  Serial.println(output);

  return mqtt.publish(topic.c_str(), output.c_str(), retained);
}

void publishAck(const char *cmdId, const char *type, bool ok,
                const char *message) {
  StaticJsonDocument<256> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["id"] = cmdId ? cmdId : "";
  doc["type"] = type ? type : "";
  doc["ok"] = ok;
  doc["message"] = message;
  doc["millis"] = millis();

  publishJson(topicAck(), doc, false);
}

void publishEvent(const char *level, const char *type, const char *message) {
  StaticJsonDocument<384> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["level"] = level;
  doc["type"] = type;
  doc["message"] = message;
  doc["millis"] = millis();

  publishJson(topicEvent(), doc, false);
}

void publishStatus(bool online) {
  StaticJsonDocument<256> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["millis"] = millis();

  publishJson(topicStatus(), doc, true);
}

// ==========================================================
// DFPLAYER LCD TEXT MAPPING
// ==========================================================
void getDfPlayerLcdText(uint8_t track, const char *&line1, const char *&line2) {
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
    line1 = "HALLO TUAN";
    line2 = "SENANG BICARA";
    break;

  case 15:
    line1 = "SAYA AERO";
    line2 = "SIAP MEMBANTU";
    break;

  default:
    line1 = "SMARTBOX";
    line2 = "SUARA DIPUTAR";
    break;
  }
}

void playVoice(uint8_t track, const char *reason) {
  Serial.println();
  Serial.println("========== [DFPLAYER PLAY] ==========");
  Serial.printf("[DFPLAYER] Track : %d\n", track);
  Serial.printf("[DFPLAYER] Reason: %s\n", reason ? reason : "-");

  if (!dfReady) {
    Serial.println("[DFPLAYER] Belum ready.");
    showLCD("DFPLAYER ERROR", "BELUM READY");
    return;
  }

  if (track < 1 || track > DFPLAYER_MAX_TRACK) {
    Serial.println("[DFPLAYER] Track invalid.");
    showLCD("TRACK ERROR", "1 SAMPAI 15");
    return;
  }

  const char *line1;
  const char *line2;

  getDfPlayerLcdText(track, line1, line2);
  showLCD(line1, line2);

  dfPlayer.play(track);

  Serial.println("[DFPLAYER] Command play dikirim.");
  Serial.println("=====================================");

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "voice.played";
  doc["message"] = "DFPlayer memutar suara.";
  doc["millis"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["track"] = track;
  payload["reason"] = reason ? reason : "";

  publishJson(topicEvent(), doc, false);
}

// ==========================================================
// INIT LCD
// ==========================================================
void initLCD() {
  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcdReady = true;

  showLCD("SMARTBOX", "LCD READY");
  Serial.println("[LCD] Ready.");
}

// ==========================================================
// INIT RTC
// ==========================================================
void initRTC() {
  if (!rtc.begin()) {
    rtcReady = false;
    Serial.println("[RTC] DS3231 tidak terdeteksi.");
    showLCD("RTC ERROR", "CEK DS3231");
    return;
  }

  rtcReady = true;

  if (rtc.lostPower()) {
    Serial.println("[RTC] Lost power. Set waktu dari compile time.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  Serial.println("[RTC] Ready.");
  showLCD("RTC DS3231", "READY");
}

// ==========================================================
// INIT DFPLAYER
// ==========================================================
void initDFPlayer() {
  dfSerial.begin(9600, SERIAL_8N1, ESP_RX_PIN, ESP_TX_PIN);
  delay(1000);

  if (!dfPlayer.begin(dfSerial)) {
    dfReady = false;
    Serial.println("[DFPLAYER] Gagal init. Cek RX TX, SD Card, Power 5V.");
    showLCD("DFPLAYER ERROR", "CEK RX TX SD");
    return;
  }

  dfReady = true;

  dfPlayer.volume(25);
  dfPlayer.EQ(DFPLAYER_EQ_NORMAL);

  Serial.println("[DFPLAYER] Ready.");
  showLCD("DFPLAYER", "READY");
}

void debugDFPlayerEvent() {
  if (!dfReady)
    return;

  if (dfPlayer.available()) {
    uint8_t type = dfPlayer.readType();
    int value = dfPlayer.read();

    Serial.println();
    Serial.println("========== [DFPLAYER EVENT] ==========");
    Serial.print("Type : ");
    Serial.println(type);
    Serial.print("Value: ");
    Serial.println(value);

    if (type == DFPlayerPlayFinished) {
      Serial.print("[DFPLAYER] Track selesai: ");
      Serial.println(value);
    }

    if (type == DFPlayerError) {
      Serial.print("[DFPLAYER] Error code: ");
      Serial.println(value);
    }

    Serial.println("======================================");
  }
}

// ==========================================================
// RELAY CONTROL
// ==========================================================
void setRelay(uint8_t relay, bool state, const char *source = "manual") {
  if (relay == 1) {
    relay1State = state;
    digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF);

    Serial.print("[RELAY 1] ");
    Serial.println(state ? "ON" : "OFF");

    showLCD("STOP KONTAK 1", state ? "ON" : "OFF");
  }

  else if (relay == 2) {
    relay2State = state;
    digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF);

    Serial.print("[RELAY 2] ");
    Serial.println(state ? "ON" : "OFF");

    showLCD("STOP KONTAK 2", state ? "ON" : "OFF");
  }

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "relay.updated";
  doc["message"] = "Relay state updated.";
  doc["millis"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["relay"] = relay;
  payload["state"] = state;
  payload["source"] = source;

  publishJson(topicEvent(), doc, false);
}

void setRelayWithAutoOff(uint8_t relay, bool state, int autoOffSeconds,
                         const char *label) {
  setRelay(relay, state, label);

  if (relay == 1) {
    if (state && autoOffSeconds > 0) {
      relay1AutoOffActive = true;
      relay1AutoOffAt = millis() + (autoOffSeconds * 1000UL);

      showLCD("STOP KONTAK 1", "ON 1 MENIT");
      Serial.println("[RELAY 1] Auto OFF aktif.");
    }

    if (!state) {
      relay1AutoOffActive = false;
    }
  }

  else if (relay == 2) {
    if (state && autoOffSeconds > 0) {
      relay2AutoOffActive = true;
      relay2AutoOffAt = millis() + (autoOffSeconds * 1000UL);

      showLCD("STOP KONTAK 2", "ON 1 MENIT");
      Serial.println("[RELAY 2] Auto OFF aktif.");
    }

    if (!state) {
      relay2AutoOffActive = false;
    }
  }
}

void checkRelayAutoOff() {
  unsigned long now = millis();

  if (relay1AutoOffActive && now >= relay1AutoOffAt) {
    relay1AutoOffActive = false;

    setRelay(1, false, "auto_off");

    showLCD("STOP KONTAK 1", "AUTO OFF");
    publishEvent("INFO", "relay1.auto_off",
                 "Stop Kontak 1 otomatis mati setelah 1 menit.");
  }

  if (relay2AutoOffActive && now >= relay2AutoOffAt) {
    relay2AutoOffActive = false;

    setRelay(2, false, "auto_off");

    showLCD("STOP KONTAK 2", "AUTO OFF");
    publishEvent("INFO", "relay2.auto_off",
                 "Stop Kontak 2 otomatis mati setelah 1 menit.");
  }
}

// ==========================================================
// BLUETOOTH RELAY CONTROL
// ==========================================================
void setBluetoothState(bool state, const char *source = "manual") {
  if (bluetoothState == state) {
    Serial.println("[BT] State sama, tidak diubah.");
    return;
  }

  bluetoothState = state;
  digitalWrite(BT_BASE_PIN, state ? HIGH : LOW);

  if (state) {
    Serial.println("[BT] Bluetooth diaktifkan.");
    showLCD("BLUETOOTH", "DIAKTIFKAN");
    playVoice(TRACK_BLUETOOTH_ACTIVE, "bluetooth_on");
    setRGB(0, 255, 0);
    publishEvent("INFO", "bluetooth.on", "Bluetooth SmartBox diaktifkan.");
  } else {
    Serial.println("[BT] Bluetooth dimatikan.");
    showLCD("BLUETOOTH", "DIMATIKAN");
    playVoice(TRACK_BLUETOOTH_OFF, "bluetooth_off");
    setRGB(255, 0, 0);
    publishEvent("INFO", "bluetooth.off", "Bluetooth SmartBox dimatikan.");
  }

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "bluetooth.updated";
  doc["message"] = "Bluetooth relay updated.";
  doc["millis"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["state"] = state;
  payload["source"] = source;

  publishJson(topicEvent(), doc, false);
}

void toggleBluetooth() { setBluetoothState(!bluetoothState, "red_button"); }

// ==========================================================
// BUZZER
// ==========================================================
void setBuzzer(bool state) {
  buzzerState = state;

  if (state) {
    tone(BUZZER_PIN, 1200);
  } else {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }

  Serial.print("[BUZZER] ");
  Serial.println(state ? "ON" : "OFF");

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "buzzer.updated";
  doc["message"] = "Buzzer updated.";
  doc["millis"] = millis();

  JsonObject payload = doc.createNestedObject("payload");
  payload["state"] = state;

  publishJson(topicEvent(), doc, false);
}

void beepBuzzer() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1200);
    delay(120);
    noTone(BUZZER_PIN);
    delay(120);
  }
}

// ==========================================================
// SENSOR READ
// ==========================================================
void readSensors() {
  mq2Value = analogRead(MQ2_PIN);

  smokeDetected = false;
  gasDetected = false;

  if (gasSensorEnabled) {
    if (mq2Value >= MQ2_GAS_THRESHOLD) {
      gasDetected = true;
    }

    else if (mq2Value >= MQ2_SMOKE_THRESHOLD) {
      smokeDetected = true;
    }
  }

  if (rtcReady && tempSensorEnabled) {
    temperatureC = rtc.getTemperature();
  }

  pirMotion = digitalRead(PIR_PIN) == HIGH;
}

// ==========================================================
// SENSOR VOICE LOGIC
// ==========================================================
void handleGasVoice() {
  if (!gasSensorEnabled)
    return;

  unsigned long now = millis();

  if (gasDetected && now - lastGasVoiceAt >= GAS_VOICE_COOLDOWN_MS) {
    lastGasVoiceAt = now;

    Serial.println("[SENSOR] Gas terdeteksi.");
    showLCD("GAS", "TERDETEKSI");
    playVoice(TRACK_GAS_DETECTED, "gas_detected");
    setBuzzer(true);
    setRGB(255, 0, 0);

    publishEvent("WARN", "gas.detected", "Gas terdeteksi oleh sensor MQ-2.");
  }

  else if (smokeDetected && now - lastGasVoiceAt >= GAS_VOICE_COOLDOWN_MS) {
    lastGasVoiceAt = now;

    Serial.println("[SENSOR] Asap terdeteksi.");
    showLCD("ASAP", "TERDETEKSI");
    playVoice(TRACK_SMOKE_DETECTED, "smoke_detected");
    setBuzzer(true);
    setRGB(255, 80, 0);

    publishEvent("WARN", "smoke.detected", "Asap terdeteksi oleh sensor MQ-2.");
  }

  if (!gasDetected && !smokeDetected && buzzerState) {
    setBuzzer(false);
    setRGB(0, 0, 80);
  }
}

void handleTempVoice() {
  if (!tempSensorEnabled || !rtcReady)
    return;

  unsigned long now = millis();

  if (temperatureC >= TEMP_WARNING_THRESHOLD &&
      now - lastTempVoiceAt >= TEMP_VOICE_COOLDOWN_MS) {
    lastTempVoiceAt = now;

    Serial.println("[SENSOR] Suhu tinggi terdeteksi.");
    showLCD("SUHU", "TERDETEKSI");
    playVoice(TRACK_TEMP_DETECTED, "temperature_detected");

    publishEvent("WARN", "temperature.detected",
                 "Suhu ruangan melewati threshold.");
  }
}

void handlePirVoice() {
  if (!pirSensorEnabled)
    return;

  bool pirNow = digitalRead(PIR_PIN) == HIGH;

  if (pirNow && !lastPirState) {
    unsigned long now = millis();

    Serial.println("[PIR] Gerakan terdeteksi.");
    showLCD("GERAKAN", "TERDETEKSI");

    if (now - lastPirVoiceAt >= PIR_VOICE_COOLDOWN_MS) {
      lastPirVoiceAt = now;

      int track = pirTracks[pirGreetingIndex];
      pirGreetingIndex = (pirGreetingIndex + 1) % 3;

      playVoice(track, "pir_greeting");

      publishEvent("INFO", "pir.motion",
                   "Gerakan PIR terdeteksi dan greeting diputar.");
    } else {
      Serial.println("[PIR] Cooldown aktif, suara tidak diputar.");
    }
  }

  lastPirState = pirNow;
}

// ==========================================================
// TELEMETRY
// ==========================================================
String getRtcTimeString() {
  if (!rtcReady)
    return "";

  DateTime now = rtc.now();

  char buffer[20];
  snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d", now.hour(), now.minute(),
           now.second());

  return String(buffer);
}

String getRtcDateString() {
  if (!rtcReady)
    return "";

  DateTime now = rtc.now();

  char buffer[20];
  snprintf(buffer, sizeof(buffer), "%04d-%02d-%02d", now.year(), now.month(),
           now.day());

  return String(buffer);
}

void publishTelemetry() {
  if (!mqtt.connected())
    return;

  StaticJsonDocument<768> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["online"] = true;
  doc["millis"] = millis();

  doc["temperature"] = temperatureC;
  doc["mq2"] = mq2Value;
  doc["smokeDetected"] = smokeDetected;
  doc["gasDetected"] = gasDetected;
  doc["pirMotion"] = pirMotion;

  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  doc["bluetooth"] = bluetoothState;
  doc["buzzer"] = buzzerState;

  doc["gasSensorEnabled"] = gasSensorEnabled;
  doc["tempSensorEnabled"] = tempSensorEnabled;
  doc["pirSensorEnabled"] = pirSensorEnabled;
  doc["sleepMode"] = sleepModeEnabled;

  doc["rtcReady"] = rtcReady;
  doc["dfPlayerReady"] = dfReady;
  doc["lcdReady"] = lcdReady;

  doc["rtcTime"] = getRtcTimeString();
  doc["rtcDate"] = getRtcDateString();

  publishJson(topicTelemetry(), doc, false);
}

// ==========================================================
// MQTT COMMAND HANDLER
// ==========================================================
void handleVoicePlay(JsonObject payload, const char *cmdId, const char *type) {
  int track = payload["track"] | 1;
  const char *reason = payload["reason"] | "mqtt_voice";

  Serial.println("[CMD] voice.play received.");
  Serial.printf("[CMD] Track: %d Reason: %s\n", track, reason);

  playVoice(track, reason);

  publishAck(cmdId, type, true, "Voice played.");
}

void handleRelaySet(JsonObject payload, const char *cmdId, const char *type) {
  int relay = payload["relay"] | 1;
  bool state = payload["state"] | false;
  int autoOffSeconds = payload["autoOffSeconds"] | 0;
  const char *label = payload["label"] | "mqtt";

  Serial.println("[CMD] relay.set received.");
  Serial.printf("[CMD] Relay: %d State: %s AutoOff: %d\n", relay,
                state ? "ON" : "OFF", autoOffSeconds);

  setRelayWithAutoOff(relay, state, autoOffSeconds, label);

  publishAck(cmdId, type, true, "Relay updated.");
}

void handleBluetoothSet(JsonObject payload, const char *cmdId,
                        const char *type) {
  bool state = payload["state"] | false;

  Serial.println("[CMD] bluetooth.set received.");
  Serial.printf("[CMD] Bluetooth: %s\n", state ? "ON" : "OFF");

  setBluetoothState(state, "mqtt");

  publishAck(cmdId, type, true, "Bluetooth updated.");
}

void handleBuzzerSet(JsonObject payload, const char *cmdId, const char *type) {
  bool state = payload["state"] | false;

  Serial.println("[CMD] buzzer.set received.");
  Serial.printf("[CMD] Buzzer: %s\n", state ? "ON" : "OFF");

  setBuzzer(state);

  publishAck(cmdId, type, true, "Buzzer updated.");
}

void handleSensorSet(JsonObject payload, const char *cmdId, const char *type) {
  const char *sensor = payload["sensor"] | "";
  bool enabled = payload["enabled"] | false;

  Serial.println("[CMD] sensor.set received.");
  Serial.printf("[CMD] Sensor: %s Enabled: %s\n", sensor,
                enabled ? "YES" : "NO");

  if (strcmp(sensor, "gas") == 0 || strcmp(sensor, "mq2") == 0) {
    gasSensorEnabled = enabled;
  }

  else if (strcmp(sensor, "temperature") == 0 || strcmp(sensor, "suhu") == 0) {
    tempSensorEnabled = enabled;
  }

  else if (strcmp(sensor, "pir") == 0) {
    pirSensorEnabled = enabled;
  }

  else if (strcmp(sensor, "sleep") == 0) {
    sleepModeEnabled = enabled;
  }

  publishAck(cmdId, type, true, "Sensor setting updated.");
}

void handleSensorCalibrate(JsonObject payload, const char *cmdId,
                           const char *type) {
  int smoke = payload["smokeThreshold"] | MQ2_SMOKE_THRESHOLD;
  int gas = payload["gasThreshold"] | MQ2_GAS_THRESHOLD;
  float temp = payload["tempThreshold"] | TEMP_WARNING_THRESHOLD;

  MQ2_SMOKE_THRESHOLD = smoke;
  MQ2_GAS_THRESHOLD = gas;
  TEMP_WARNING_THRESHOLD = temp;

  Serial.println("[CMD] sensor.calibrate received.");
  Serial.printf("[CMD] Smoke: %d Gas: %d Temp: %.1f\n", MQ2_SMOKE_THRESHOLD,
                MQ2_GAS_THRESHOLD, TEMP_WARNING_THRESHOLD);

  publishAck(cmdId, type, true, "Sensor calibrated.");
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.println();
  Serial.print("[MQTT RX] Topic: ");
  Serial.println(topic);

  String message;

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("[MQTT RX] Payload: ");
  Serial.println(message);

  StaticJsonDocument<1024> doc;

  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.print("[MQTT ERROR] JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char *cmdId = doc["id"] | "";
  const char *type = doc["type"] | "";

  JsonObject data = doc["payload"].as<JsonObject>();

  if (strcmp(type, "voice.play") == 0) {
    handleVoicePlay(data, cmdId, type);
  }

  else if (strcmp(type, "relay.set") == 0) {
    handleRelaySet(data, cmdId, type);
  }

  else if (strcmp(type, "bluetooth.set") == 0) {
    handleBluetoothSet(data, cmdId, type);
  }

  else if (strcmp(type, "buzzer.set") == 0) {
    handleBuzzerSet(data, cmdId, type);
  }

  else if (strcmp(type, "sensor.set") == 0) {
    handleSensorSet(data, cmdId, type);
  }

  else if (strcmp(type, "sensor.calibrate") == 0) {
    handleSensorCalibrate(data, cmdId, type);
  }

  else {
    Serial.print("[CMD] Unknown type: ");
    Serial.println(type);
    publishAck(cmdId, type, false, "Unknown command type.");
  }
}

// ==========================================================
// WIFI + MQTT CONNECT
// ==========================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    return;
  }

  Serial.println();
  Serial.println("========== [WIFI CONNECT] ==========");
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

    showLCD("WIFI CONNECTED", WiFi.localIP().toString());
    setRGB(0, 0, 255);
  } else {
    wifiReady = false;

    Serial.println("[WIFI] Gagal connect.");
    showLCD("WIFI ERROR", "CEK SSID PASS");
    setRGB(255, 0, 0);
  }
}

void connectMQTT() {
  if (mqtt.connected()) {
    mqttReadyFlag = true;
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    mqttReadyFlag = false;
    return;
  }

  Serial.println();
  Serial.println("========== [MQTT CONNECT] ==========");

  String clientId =
      String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("[MQTT] Client ID: ");
  Serial.println(clientId);

  bool connected =
      mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                   topicStatus().c_str(), 1, true, "{\"online\":false}");

  if (connected) {
    mqttReadyFlag = true;

    Serial.println("[MQTT] Connected.");

    mqtt.subscribe(topicCmd().c_str());
    Serial.print("[MQTT] Subscribe: ");
    Serial.println(topicCmd());

    publishStatus(true);
    publishEvent("INFO", "device.online", "ESP32-S3 SmartBox online.");

    showLCD("MQTT CONNECTED", "SMARTBOX ONLINE");
    setRGB(0, 255, 0);
  } else {
    mqttReadyFlag = false;

    Serial.print("[MQTT] Failed rc=");
    Serial.println(mqtt.state());

    showLCD("MQTT ERROR", "CEK BROKER");
    setRGB(255, 0, 0);
  }
}

// ==========================================================
// BUTTON HANDLER
// ==========================================================
void checkRedButton() {
  bool redNow = digitalRead(RED_BTN_PIN);

  if (redLastState == HIGH && redNow == LOW) {
    unsigned long now = millis();

    if (now - redLastPressAt > BUTTON_DEBOUNCE_MS) {
      redLastPressAt = now;

      Serial.println("[BUTTON] RED pressed -> toggle Bluetooth.");
      toggleBluetooth();
    }
  }

  redLastState = redNow;
}

void checkWhiteButton() {
  bool whiteNow = digitalRead(WHITE_BTN_PIN);

  if (whiteLastState == HIGH && whiteNow == LOW) {
    unsigned long now = millis();

    if (now - whiteLastPressAt > BUTTON_DEBOUNCE_MS) {
      whiteLastPressAt = now;

      Serial.println("[BUTTON] WHITE pressed -> intro Aero.");
      playVoice(TRACK_AI_INTRO, "white_button_intro");
    }
  }

  whiteLastState = whiteNow;
}

void checkBlackButton() {
  bool blackNow = digitalRead(BLACK_BTN_PIN);
  unsigned long now = millis();

  if (blackLastState == HIGH && blackNow == LOW) {
    blackPressedAt = now;
    blackLongPressHandled = false;

    Serial.println("[BUTTON] BLACK pressed.");
  }

  if (blackLastState == LOW && blackNow == LOW) {
    if (!blackLongPressHandled && now - blackPressedAt >= BLACK_LONG_PRESS_MS) {
      blackLongPressHandled = true;

      Serial.println("[BUTTON] BLACK long press -> local AI greeting.");
      showLCD("AI ASSISTANT", "HALLO TUAN");
      playVoice(TRACK_AI_HELLO, "black_long_press");
    }
  }

  if (blackLastState == LOW && blackNow == HIGH) {
    if (!blackLongPressHandled) {
      Serial.println("[BUTTON] BLACK quick press -> time temp.");

      if (rtcReady) {
        DateTime t = rtc.now();
        char line1[17];
        char line2[17];

        snprintf(line1, sizeof(line1), "JAM %02d:%02d:%02d", t.hour(),
                 t.minute(), t.second());
        snprintf(line2, sizeof(line2), "SUHU %4.1f C", temperatureC);

        showLCD(line1, line2);
      }

      playVoice(TRACK_TIME_TEMP_REALTIME, "black_quick_time_temp");
    }
  }

  blackLastState = blackNow;
}

// ==========================================================
// SERIAL COMMAND DEBUG
// ==========================================================
void printHelp() {
  Serial.println();
  Serial.println("========== COMMAND LIST ==========");
  Serial.println("help              -> tampilkan command");
  Serial.println("status            -> cek status");
  Serial.println("df1 - df15        -> test DFPlayer");
  Serial.println("r1on              -> relay 1 ON auto OFF 60 detik");
  Serial.println("r1off             -> relay 1 OFF");
  Serial.println("r2on              -> relay 2 ON auto OFF 60 detik");
  Serial.println("r2off             -> relay 2 OFF");
  Serial.println("bt on             -> Bluetooth ON");
  Serial.println("bt off            -> Bluetooth OFF");
  Serial.println("beep              -> buzzer beep");
  Serial.println("buzzer on         -> buzzer ON");
  Serial.println("buzzer off        -> buzzer OFF");
  Serial.println("sensor            -> print sensor");
  Serial.println("lcd               -> test LCD");
  Serial.println("================================================");
}

void printStatus() {
  Serial.println();
  Serial.println("========== SMARTBOX STATUS ==========");
  Serial.printf("WiFi       : %s\n",
                WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
  Serial.printf("MQTT       : %s\n",
                mqtt.connected() ? "CONNECTED" : "DISCONNECTED");
  Serial.printf("LCD        : %s\n", lcdReady ? "READY" : "ERROR");
  Serial.printf("RTC        : %s\n", rtcReady ? "READY" : "ERROR");
  Serial.printf("DFPlayer   : %s\n", dfReady ? "READY" : "ERROR");
  Serial.printf("MQ2        : %d\n", mq2Value);
  Serial.printf("Temp       : %.1f C\n", temperatureC);
  Serial.printf("Smoke      : %s\n", smokeDetected ? "YES" : "NO");
  Serial.printf("Gas        : %s\n", gasDetected ? "YES" : "NO");
  Serial.printf("PIR        : %s\n", pirMotion ? "MOTION" : "NO MOTION");
  Serial.printf("Relay 1    : %s\n", relay1State ? "ON" : "OFF");
  Serial.printf("Relay 2    : %s\n", relay2State ? "ON" : "OFF");
  Serial.printf("Bluetooth  : %s\n", bluetoothState ? "ON" : "OFF");
  Serial.printf("Buzzer     : %s\n", buzzerState ? "ON" : "OFF");
  Serial.println("====================================");
}

void handleSerialCommand() {
  if (!Serial.available())
    return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toLowerCase();

  if (cmd == "help") {
    printHelp();
  }

  else if (cmd == "status") {
    printStatus();
  }

  else if (cmd.startsWith("df")) {
    int track = cmd.substring(2).toInt();
    playVoice(track, "serial_test");
  }

  else if (cmd == "r1on") {
    setRelayWithAutoOff(1, true, 60, "serial");
  }

  else if (cmd == "r1off") {
    setRelayWithAutoOff(1, false, 0, "serial");
  }

  else if (cmd == "r2on") {
    setRelayWithAutoOff(2, true, 60, "serial");
  }

  else if (cmd == "r2off") {
    setRelayWithAutoOff(2, false, 0, "serial");
  }

  else if (cmd == "bt on") {
    setBluetoothState(true, "serial");
  }

  else if (cmd == "bt off") {
    setBluetoothState(false, "serial");
  }

  else if (cmd == "beep") {
    beepBuzzer();
  }

  else if (cmd == "buzzer on") {
    setBuzzer(true);
  }

  else if (cmd == "buzzer off") {
    setBuzzer(false);
  }

  else if (cmd == "sensor") {
    readSensors();
    printStatus();
  }

  else if (cmd == "lcd") {
    showLCD("LCD TEST", "SMARTBOX OK");
  }

  else {
    Serial.println("[SERIAL] Command tidak dikenal. Ketik help.");
  }
}

// ==========================================================
// SETUP
// ==========================================================
void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("SMARTBOX ASSISTANT ESP32-S3 STARTING");
  Serial.println("FIRMWARE: SMARTBOX_REALTIME_MQTT_DFPLAYER_V1");
  Serial.println("==================================================");

  pinMode(MQ2_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);

  pinMode(BLACK_BTN_PIN, INPUT_PULLUP);
  pinMode(WHITE_BTN_PIN, INPUT_PULLUP);
  pinMode(RED_BTN_PIN, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);
  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(BT_BASE_PIN, OUTPUT);
  digitalWrite(BT_BASE_PIN, LOW);

  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);

  digitalWrite(RELAY_1_PIN, RELAY_OFF);
  digitalWrite(RELAY_2_PIN, RELAY_OFF);

  relay1State = false;
  relay2State = false;

  rgb.begin();
  rgb.clear();
  rgb.show();
  setRGB(0, 0, 100);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  initLCD();
  delay(500);

  initRTC();
  delay(500);

  initDFPlayer();
  delay(500);

  showLCD("SMARTBOX READY", "SIAP DIGUNAKAN");

  wifiSecure.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(30);

  connectWiFi();
  connectMQTT();

  delay(1000);

  if (dfReady) {
    playVoice(TRACK_STARTUP_READY, "system_startup");
  }

  printHelp();
}

// ==========================================================
// LOOP
// ==========================================================
void loop() {
  handleSerialCommand();

  if (WiFi.status() != WL_CONNECTED) {
    wifiReady = false;

    static unsigned long lastWiFiReconnect = 0;
    if (millis() - lastWiFiReconnect > 10000) {
      lastWiFiReconnect = millis();
      connectWiFi();
    }
  }

  if (WiFi.status() == WL_CONNECTED && !mqtt.connected()) {
    mqttReadyFlag = false;

    static unsigned long lastMqttReconnect = 0;
    if (millis() - lastMqttReconnect > 5000) {
      lastMqttReconnect = millis();
      connectMQTT();
    }
  }

  if (mqtt.connected()) {
    mqtt.loop();
  }

  debugDFPlayerEvent();

  checkRedButton();
  checkWhiteButton();
  checkBlackButton();

  readSensors();

  handleGasVoice();
  handleTempVoice();
  handlePirVoice();

  checkRelayAutoOff();

  unsigned long now = millis();

  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    publishTelemetry();
  }

  if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
    lastStatusAt = now;
    publishStatus(mqtt.connected());
  }

  delay(10);
}