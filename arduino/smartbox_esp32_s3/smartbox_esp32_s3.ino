/*
  ==========================================================
  SMARTBOX ASSISTANT ESP32-S3 - INTEGRATED HARDWARE MQTT
  ==========================================================

  Alur:
  ESP32-S3 -> MQTT Cloud -> Next.js Dashboard -> MQTT Worker -> Prisma -> Neon

  Fitur:
  - DS3231 + LCD I2C
  - MQ2 gas sensor
  - PIR motion
  - IR obstacle
  - Relay stop kontak 1 dan 2
  - Bluetooth/amplifier power via transistor GPIO14
  - DFPlayer Mini untuk suara alarm/peringatan
  - Buzzer
  - RGB LED bawaan ESP32-S3 GPIO48
  - INMP441 untuk deteksi tepukan
  - MQTT telemetry, event, ack, dan command

  Library Arduino IDE:
  - PubSubClient
  - ArduinoJson
  - RTClib by Adafruit
  - LiquidCrystal_I2C
  - DFRobotDFPlayerMini
  - Adafruit NeoPixel

  Catatan:
  - Relay 1/2 memakai LOW LEVEL TRIGGER, jadi ON = LOW dan OFF = HIGH.
  - Bluetooth/amplifier GPIO14 memakai transistor, jadi ON = HIGH dan OFF = LOW.
  - GPIO19 dan GPIO20 bisa bentrok dengan USB pada beberapa ESP32-S3.
    Jika upload/serial bermasalah, pindahkan WHITE_BTN_PIN dan RED_BTN_PIN ke
  GPIO39/GPIO40.

  DFPlayer Track Mapping:
  0001.mp3 = smartbox assistant siap digunakan
  0002.mp3 = menampilkan jam dan suhu real-time
  0003.mp3 = bluetooth diaktifkan
  0004.mp3 = selamat pagi tuan
  0005.mp3 = selamat siang tuan
  0006.mp3 = selamat sore tuan
  0007.mp3 = asap terdeteksi
  0008.mp3 = gas terdeteksi
  0009.mp3 = suhu terdeteksi
  0010.mp3 = gerakan terdeteksi (walk)
  0011.mp3 = gerakan melompat terdeteksi (jump)
  0012.mp3 = gerakan melambaikan tangan (wave)
*/

#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <DFRobotDFPlayerMini.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <RTClib.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <driver/i2s.h>

// ==========================================================
// 1. WIFI & MQTT CLOUD CONFIG
// ==========================================================
const char *WIFI_SSID = "BAGUS";
const char *WIFI_PASS = "s4nsan15675";

const char *MQTT_HOST = "6559400ba6c741398aa7048b471d5a31.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char *MQTT_USER = "smartbox001";
const char *MQTT_PASS = "Smartbox123!";

const char *DEVICE_ID = "smartbox-001";

// ==========================================================
// 2. PIN MAP ESP32-S3
// ==========================================================
#define I2C_SDA 1
#define I2C_SCL 2
#define MQ2_PIN 3
#define PIR_PIN 9
#define IR_PIN 42
#define BLACK_BTN_PIN 7
#define WHITE_BTN_PIN 19
#define RED_BTN_PIN 20
#define RELAY_1_PIN 21
#define RELAY_2_PIN 47
#define BUZZER_PIN 10
#define BT_BASE_PIN 14
#define RGB_PIN 48
#define NUM_PIXELS 1
#define ESP_RX_PIN 8
#define ESP_TX_PIN 18
#define MIC_SCK 4
#define MIC_WS 5
#define MIC_SD 6
#define MIC_I2S_PORT I2S_NUM_0

#define LED_12C_PIN 12 // Pin LED 12C/12V (Silakan ubah ke pin yang sesuai jika berbeda, contoh: GPIO 12 atau 13)

#define ENABLE_PT8211_TEST 0
#define PT_BCLK 15
#define PT_LRC 16
#define PT_DOUT 17
#define PT_I2S_PORT I2S_NUM_1

// ==========================================================
// 3. RELAY LOGIC
// ==========================================================
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==========================================================
// 4. TRACK MAPPING DFPLAYER
// ==========================================================
#define TRACK_STARTUP_READY       1
#define TRACK_TIME_TEMP_REALTIME  2
#define TRACK_BLUETOOTH_ACTIVE    3
#define TRACK_ALARM_MORNING       4
#define TRACK_ALARM_AFTERNOON     5
#define TRACK_ALARM_EVENING       6
#define TRACK_SMOKE_DETECTED      7
#define TRACK_GAS_DETECTED        8
#define TRACK_TEMP_DETECTED       9
#define TRACK_GESTURE_WALK        10
#define TRACK_GESTURE_JUMP        11
#define TRACK_GESTURE_WAVE        12

#define TRACK_SYSTEM_READY        TRACK_STARTUP_READY
#define TRACK_SHOW_TIME_TEMP      TRACK_TIME_TEMP_REALTIME
#define TRACK_BT_GREETING         TRACK_BLUETOOTH_ACTIVE
#define TRACK_ALARM_NOON          TRACK_ALARM_AFTERNOON
#define TRACK_PIR_WALK            TRACK_GESTURE_WALK
#define TRACK_PIR_JUMP            TRACK_GESTURE_JUMP
#define TRACK_PIR_WAVE            TRACK_GESTURE_WAVE

// ==========================================================
// 5. KALIBRASI MQ-2 - KONFIGURASI MANUAL
// ==========================================================
int MQ2_BASELINE = 0;
int SMOKE_THRESHOLD_OFFSET = 250;
int GAS_THRESHOLD_OFFSET   = 400;
int RESET_THRESHOLD_OFFSET = 150;

int smokeThreshold = 1250;
int gasThreshold   = 1400;
int resetThreshold = 1150;

int mq2Baseline = 1000;
int gasWarningThreshold = 1300;
int gasDangerThreshold = 1800;
float tempThreshold = 35.0;
float tempOffset = 0.0;
float gasRawFiltered = -1.0;

// ==========================================================
// 6. VOICE COOLDOWN
// ==========================================================
const unsigned long VOICE_COOLDOWN_MS = 1000;
unsigned long lastVoiceMillis = 0;

const unsigned long GAS_VOICE_COOLDOWN_MS  = 10000;
const unsigned long TEMP_VOICE_COOLDOWN_MS = 10000;
const unsigned long PIR_GREETING_COOLDOWN  = 60000;

unsigned long lastGasAudioTime  = 0;
unsigned long lastTempAudioTime = 0;
unsigned long lastPirEventTime  = 0;

// ==========================================================
// 7. TIMER & INTERVAL
// ==========================================================
const unsigned long TELEMETRY_INTERVAL_MS = 3000;
const unsigned long LCD_INTERVAL_MS = 1000;
const unsigned long WARNING_AUDIO_GAP_MS = 10000;
const unsigned long MQTT_RETRY_GAP_MS = 3000;

bool clapEnabled = true;
const long CLAP_MIN_VALUE = 50000;
const int CLAP_THRESHOLD_FACTOR = 3;
int32_t sampleBuffer[64];
long runningAverage = 2000;
unsigned long lastClapTime = 0;
int clapCount = 0;

// ==========================================================
// 8. OBJECTS
// ==========================================================
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

RTC_DS3231 rtc;
Adafruit_NeoPixel rgbLed(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;

// ==========================================================
// 9. STATE VARIABLES
// ==========================================================
bool rtcReady = false;
bool lcdReady = false;
bool dfPlayerReady = false;

bool gasEnabled = true;
bool tempEnabled = true;
bool voiceMode = true;
bool buzzerManual = false;

bool relay1State = false;
bool relay2State = false;
bool bluetoothAudioState = false;

bool lastGasWarning  = false;
bool lastSmokeWarning = false;
bool lastTempWarning = false;

String gasStatusStr  = "normal";
String smokeStatusStr = "normal";
String dfplayerStatusStr = "not_ready";

unsigned long lastTelemetryAt = 0;
unsigned long lastLcdAt = 0;
unsigned long lastWarningAudioAt = 0;
unsigned long lastMqttReconnectAt = 0;
unsigned long lastHttpTelemetryAt = 0;

#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer *pServer = NULL;
BLECharacteristic *txCharacteristic = NULL;
bool deviceConnected = false;
bool bluetoothAktif = false;
bool bleSudahDibuat = false;
String dataBluetooth = "";
unsigned long waktuBluetoothMulai = 0;
const unsigned long durasiBluetooth = 60000;
bool pendingBluetoothSongPlay = false;
unsigned long bluetoothSongPlayTime = 0;

Preferences preferences;

bool sleepModeEnabled = false;
bool pirEnabled = true;
bool pirGreetingEnabled = false;
int pirGreetingTrack = 1;
int pirGreetingStartHour = 7;
int pirGreetingStartMinute = 0;
int pirGreetingEndHour = 22;
int pirGreetingEndMinute = 0;

unsigned long lastMotionDetectedTime = 0;
unsigned long lastPirGreetingTime = 0;

bool lcdBacklightOn = true;
unsigned long lcdOverrideUntil = 0;
char lcdOverrideLine1[17] = "";
char lcdOverrideLine2[17] = "";
bool systemBooting = true;

bool led12cEnabled = true;
unsigned long lastLedBlinkAt = 0;
unsigned long ledBlinkInterval = 1000;
bool ledState = false;

#define LED_ON  LOW
#define LED_OFF HIGH

#define MAX_RELAY_SCHEDULES 5
struct RelaySchedule {
  char id[16];
  int startHour;
  int startMinute;
  int endHour;
  int endMinute;
  int relayNum;
  bool enabled;
  int lastTriggeredStartDay;
  int lastTriggeredEndDay;
};
RelaySchedule relaySchedules[MAX_RELAY_SCHEDULES];
int relayScheduleCount = 0;

struct AlarmConfig {
  char id[16];
  int hour;
  int minute;
  int track;
  bool enabled;
  int lastTriggeredDay;
};
AlarmConfig alarmList[3] = {{"morning", 7, 0, TRACK_ALARM_MORNING, true, -1},
                             {"noon", 12, 0, TRACK_ALARM_AFTERNOON, true, -1},
                             {"evening", 17, 0, TRACK_ALARM_EVENING, true, -1}};

// ==========================================================
// FORWARD DECLARATIONS
// ==========================================================
void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs);
void setBluetoothAudio(bool state);
void playDfTrack(int track);
void playVoice(uint8_t track, const char* reason);
void stopDfTrack();
void setRelay(uint8_t relayNumber, bool state, bool withVoice);
void setBuzzer(bool state, bool manualMode);
void handleRelayScheduleCommand(JsonObject data, const char *cmdId, const char *type);
void deleteRelaySchedule(const char *schId);
void saveSettings();
void saveSchedules();
void calibrateMQ2(int samples);
void sendTelemetryNow();
int getFilteredGas();
void playBluetoothGreeting();
void nyalakanBluetooth();
void matikanBluetooth();
void printMQ2Debug(int mq2Value);
void playVoiceTrack(int track);
void playSystemReady();
void playTimeTemperatureVoice();
void playAlarmVoice(String alarmType);
void playGasWarningVoice(String gasType);
void playTemperatureWarningVoice();
void playPirGreeting(String motionType);
void publishVoicePlayedEvent(int track, const char* source);

void initLed12c();
void led12cOn();
void led12cOff();
void blinkLed12c(int times, int delayMs);
void updateLed12c(bool gasWarning, bool smokeWarning, bool pirDetected, bool wifiConnected, bool mqttConnected);

// ==========================================================
// 10. MQTT TOPICS
// ==========================================================
String topicBase() { return String("smartbox/") + DEVICE_ID; }
String topicTelemetry() { return topicBase() + "/telemetry"; }
String topicEvent() { return topicBase() + "/event"; }
String topicAck() { return topicBase() + "/ack"; }
String topicCommand() { return topicBase() + "/cmd"; }
String topicStatus() { return topicBase() + "/status"; }

// ==========================================================
// 11. UTILITY FUNCTIONS
// ==========================================================
void setRgb(uint8_t r, uint8_t g, uint8_t b) {
  rgbLed.setPixelColor(0, rgbLed.Color(r, g, b));
  rgbLed.show();
}

void publishJson(const String &topic, JsonDocument &doc, bool retained = false) {
  if (!mqttClient.connected()) return;
  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topic.c_str(), payload.c_str(), retained);
}

void publishEvent(const char *level, const char *type, const char *message) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = level;
  doc["type"] = type;
  doc["message"] = message;
  doc["millis"] = millis();
  publishJson(topicEvent(), doc, false);
}

void publishAck(const char *id, const char *type, bool ok, const char *message) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["id"] = id;
  doc["type"] = type;
  doc["ok"] = ok;
  doc["message"] = message;
  doc["millis"] = millis();
  publishJson(topicAck(), doc, false);
}

// ==========================================================
// 12. SERIAL DEBUG MQ-2 (LENGKAP)
// ==========================================================
void printMQ2Debug(int mq2Value) {
  Serial.println("---------- [MQ2 DEBUG] ----------");
  Serial.printf("MQ2 value      : %d\n", mq2Value);
  Serial.printf("Baseline       : %d\n", MQ2_BASELINE);
  Serial.printf("Smoke threshold: %d (baseline + %d)\n", smokeThreshold, SMOKE_THRESHOLD_OFFSET);
  Serial.printf("Gas threshold  : %d (baseline + %d)\n", gasThreshold, GAS_THRESHOLD_OFFSET);
  Serial.printf("Reset threshold: %d (baseline + %d)\n", resetThreshold, RESET_THRESHOLD_OFFSET);
  Serial.printf("Gas status     : %s\n", gasStatusStr.c_str());
  Serial.printf("Asap status    : %s\n", smokeStatusStr.c_str());
  Serial.printf("DFPlayer status: %s\n", dfplayerStatusStr.c_str());
  unsigned long gasCooldownLeft = 0;
  if (lastGasAudioTime > 0 && millis() < lastGasAudioTime + GAS_VOICE_COOLDOWN_MS) {
    gasCooldownLeft = (lastGasAudioTime + GAS_VOICE_COOLDOWN_MS) - millis();
  }
  Serial.printf("Gas audio cooldown: %lu ms tersisa\n", gasCooldownLeft);
  Serial.println("---------------------------------");
}

// ==========================================================
// NVS PREFERENCES FUNCTIONS
// ==========================================================
void loadSettings() {
  preferences.begin("settings", false);
  sleepModeEnabled = preferences.getBool("sleepMode", false);
  pirEnabled = preferences.getBool("pirEnabled", true);
  gasEnabled = preferences.getBool("gasEnabled", true);
  pirGreetingEnabled = preferences.getBool("pirGreetEn", false);
  pirGreetingTrack = preferences.getInt("pirGreetTrk", 1);
  pirGreetingStartHour = preferences.getInt("pirGreetSH", 7);
  pirGreetingStartMinute = preferences.getInt("pirGreetSM", 0);
  pirGreetingEndHour = preferences.getInt("pirGreetEH", 22);
  pirGreetingEndMinute = preferences.getInt("pirGreetEM", 0);
  mq2Baseline = preferences.getInt("mq2Baseline", 1000);
  MQ2_BASELINE = mq2Baseline;
  SMOKE_THRESHOLD_OFFSET = preferences.getInt("smokeOffset", 250);
  GAS_THRESHOLD_OFFSET   = preferences.getInt("gasOffset", 400);
  RESET_THRESHOLD_OFFSET = preferences.getInt("resetOffset", 150);
  smokeThreshold = MQ2_BASELINE + SMOKE_THRESHOLD_OFFSET;
  gasThreshold   = MQ2_BASELINE + GAS_THRESHOLD_OFFSET;
  resetThreshold = MQ2_BASELINE + RESET_THRESHOLD_OFFSET;
  gasWarningThreshold = smokeThreshold;
  gasDangerThreshold  = gasThreshold;
  tempThreshold = preferences.getFloat("tempThreshold", 35.0);
  tempOffset = preferences.getFloat("tempOffset", 0.0);
  preferences.end();
  Serial.println("[SETTINGS] Loaded settings from NVS.");
}

void saveSettings() {
  preferences.begin("settings", false);
  preferences.putBool("sleepMode", sleepModeEnabled);
  preferences.putBool("pirEnabled", pirEnabled);
  preferences.putBool("gasEnabled", gasEnabled);
  preferences.putBool("pirGreetEn", pirGreetingEnabled);
  preferences.putInt("pirGreetTrk", pirGreetingTrack);
  preferences.putInt("pirGreetSH", pirGreetingStartHour);
  preferences.putInt("pirGreetSM", pirGreetingStartMinute);
  preferences.putInt("pirGreetEH", pirGreetingEndHour);
  preferences.putInt("pirGreetEM", pirGreetingEndMinute);
  preferences.putInt("mq2Baseline", MQ2_BASELINE);
  preferences.putInt("smokeOffset", SMOKE_THRESHOLD_OFFSET);
  preferences.putInt("gasOffset", GAS_THRESHOLD_OFFSET);
  preferences.putInt("resetOffset", RESET_THRESHOLD_OFFSET);
  preferences.putInt("gasWarning", smokeThreshold);
  preferences.putInt("gasDanger", gasThreshold);
  preferences.putFloat("tempThreshold", tempThreshold);
  preferences.putFloat("tempOffset", tempOffset);
  preferences.end();
  Serial.println("[SETTINGS] Saved settings to NVS.");
}

void loadSchedules() {
  preferences.begin("schedules", false);
  relayScheduleCount = preferences.getInt("count", 0);
  if (relayScheduleCount > MAX_RELAY_SCHEDULES) relayScheduleCount = MAX_RELAY_SCHEDULES;
  for (int i = 0; i < relayScheduleCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "sch_%d", i);
    preferences.getBytes(key, &relaySchedules[i], sizeof(RelaySchedule));
    relaySchedules[i].lastTriggeredStartDay = -1;
    relaySchedules[i].lastTriggeredEndDay = -1;
  }
  preferences.end();
  Serial.println("[SCHEDULE] Loaded schedules from NVS.");
}

void saveSchedules() {
  preferences.begin("schedules", false);
  preferences.putInt("count", relayScheduleCount);
  for (int i = 0; i < relayScheduleCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "sch_%d", i);
    preferences.putBytes(key, &relaySchedules[i], sizeof(RelaySchedule));
  }
  preferences.end();
  Serial.println("[SCHEDULE] Saved schedules to NVS.");
}

// ==========================================================
// BLUETOOTH BLE FUNCTIONS
// ==========================================================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Tersambung ke perangkat.");
    setRgb(0, 0, 255);
    setLcdOverride("BT CONNECTED", "CONNECTED", 3000);
  }
  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    pendingBluetoothSongPlay = false;
    Serial.println("[BLE] Terputus dari perangkat.");
    if (bluetoothAktif) {
      delay(100);
      BLEDevice::startAdvertising();
      setRgb(0, 255, 0);
      setLcdOverride("BT AKTIF", "MENUNGGU HP", 3000);
    } else {
      setRgb(255, 0, 0);
      setLcdOverride("BT MATI", "TIMER HABIS", 3000);
    }
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = String(pCharacteristic->getValue().c_str());
    value.trim();
    if (value.length() > 0) dataBluetooth = value;
  }
};

void setupBluetooth() {
  if (bleSudahDibuat) return;
  BLEDevice::init("Smartbox Assistant");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  txCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txCharacteristic->addDescriptor(new BLE2902());
  BLECharacteristic *rxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  rxCharacteristic->setCallbacks(new RxCallbacks());
  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  bleSudahDibuat = true;
  Serial.println("[BLE] Server dibuat. Nama: Smartbox Assistant");
}

// ==========================================================
// LED 12C / LED 12V FUNCTIONS
// ==========================================================
void initLed12c() {
  pinMode(LED_12C_PIN, OUTPUT);
  digitalWrite(LED_12C_PIN, LED_OFF);
  Serial.println("[LED12C] Init LED 12C/12V selesai");
}

void led12cOn() {
  digitalWrite(LED_12C_PIN, LED_ON);
  Serial.println("[LED12C] ON");
}

void led12cOff() {
  digitalWrite(LED_12C_PIN, LED_OFF);
  Serial.println("[LED12C] OFF");
}

void blinkLed12c(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_12C_PIN, LED_ON);
    delay(delayMs);
    digitalWrite(LED_12C_PIN, LED_OFF);
    delay(delayMs);
  }
  Serial.printf("[LED12C] Blink %d times done\n", times);
}

void updateLed12c(bool gasWarning, bool smokeWarning, bool pirDetected, bool wifiConnected, bool mqttConnected) {
  if (!led12cEnabled) return;

  unsigned long now = millis();
  
  // 1. Peringatan Gas / Asap (Prioritas 1 - Berkedip Cepat)
  if (gasWarning || smokeWarning) {
    unsigned int fastBlinkInterval = 150; // 150ms
    if (now - lastLedBlinkAt >= fastBlinkInterval) {
      lastLedBlinkAt = now;
      ledState = !ledState;
      digitalWrite(LED_12C_PIN, ledState ? LED_ON : LED_OFF);
      Serial.printf("[LED12C] Gas/Smoke Alert Blink: %s\n", ledState ? "ON" : "OFF");
    }
    return;
  }

  // 2. PIR Deteksi Gerakan (Prioritas 2 - Menyala Singkat dengan Cooldown)
  static unsigned long pirLedActiveUntil = 0;
  static unsigned long lastPirLedTriggerAt = 0;
  const unsigned long pirLedDuration = 1000; // Menyala 1 detik
  const unsigned long pirLedCooldown = 5000; // Cooldown 5 detik

  if (pirDetected && (now - lastPirLedTriggerAt >= pirLedCooldown)) {
    lastPirLedTriggerAt = now;
    pirLedActiveUntil = now + pirLedDuration;
    digitalWrite(LED_12C_PIN, LED_ON);
    Serial.println("[LED12C] PIR Trigger: ON");
  }

  static bool pirLedWasActive = false;
  if (now < pirLedActiveUntil) {
    pirLedWasActive = true;
    return;
  } else if (pirLedWasActive) {
    pirLedWasActive = false;
    digitalWrite(LED_12C_PIN, LED_OFF);
    ledState = false;
    lastLedBlinkAt = now;
    Serial.println("[LED12C] PIR Trigger: OFF");
  }

  // 3. Kondisi Normal (Berkedip Pelan sebagai indikator sistem hidup)
  unsigned int normalBlinkInterval = 2000; // 2 detik
  if (now - lastLedBlinkAt >= normalBlinkInterval) {
    lastLedBlinkAt = now;
    ledState = !ledState;
    digitalWrite(LED_12C_PIN, ledState ? LED_ON : LED_OFF);
    Serial.printf("[LED12C] Normal Blink: %s\n", ledState ? "ON" : "OFF");
  }
}

// ==========================================================
// VOICE / DFPLAYER FUNCTIONS
// ==========================================================
void playVoice(uint8_t track, const char* reason) {
  if (!dfPlayerReady) return;
  unsigned long now = millis();
  if (now - lastVoiceMillis < VOICE_COOLDOWN_MS) return;
  if (!bluetoothAudioState) {
    setBluetoothAudio(true);
    delay(400);
  }
  dfPlayer.play(track);
  lastVoiceMillis = millis();
}

void playVoiceTrack(int track) { playVoice((uint8_t)track, "manual"); }

void publishVoicePlayedEvent(int track, const char* source) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "voice.played";
  doc["message"] = "Suara diputar";
  doc["millis"] = millis();
  JsonObject payload = doc.createNestedObject("payload");
  payload["track"] = track;
  payload["source"] = source;
  publishJson(topicEvent(), doc, false);
}

void playSystemReady() {
  playVoice(TRACK_STARTUP_READY, "system_boot");
  setLcdOverride("SMARTBOX READY", "SIAP DIGUNAKAN", 4000);
  publishEvent("INFO", "system.ready", "SmartBox Assistant siap digunakan");
  publishVoicePlayedEvent(TRACK_STARTUP_READY, "boot");
}

void playTimeTemperatureVoice() {
  playVoice(TRACK_TIME_TEMP_REALTIME, "time_temp_display");
  if (rtcReady) {
    DateTime now = rtc.now();
    float tempC = rtc.getTemperature() + tempOffset;
    char line1[17];
    char line2[17];
    snprintf(line1, sizeof(line1), "WAKTU: %02d:%02d:%02d", now.hour(), now.minute(), now.second());
    snprintf(line2, sizeof(line2), "SUHU RTC: %4.1f C", tempC);
    setLcdOverride(line1, line2, 4000);
  }
}

void playBluetoothGreeting() {
  setBluetoothAudio(true);
  delay(250);
  playVoice(TRACK_BLUETOOTH_ACTIVE, "bluetooth_on");
  publishEvent("INFO", "bluetooth.on", "Bluetooth/audio aktif dan sapaan diputar");
}

void playAlarmVoice(String alarmType) {
  int track = -1;
  if (alarmType == "morning") track = TRACK_ALARM_MORNING;
  else if (alarmType == "noon") track = TRACK_ALARM_AFTERNOON;
  else if (alarmType == "evening") track = TRACK_ALARM_EVENING;
  if (track != -1) {
    char reason[32];
    snprintf(reason, sizeof(reason), "alarm_%s", alarmType.c_str());
    playVoice((uint8_t)track, reason);
    publishEvent("INFO", ("alarm." + alarmType).c_str(), ("Alarm " + alarmType + " aktif.").c_str());
    publishVoicePlayedEvent(track, "alarm");
  }
}

void playGasWarningVoice(String gasType) {
  unsigned long now = millis();
  if (now - lastGasAudioTime < GAS_VOICE_COOLDOWN_MS) return;
  lastGasAudioTime = now;
  int track = -1;
  const char* reason = "";
  if (gasType == "smoke") {
    track = TRACK_SMOKE_DETECTED;
    reason = "smoke_detected";
    smokeStatusStr = "detected";
    publishEvent("WARNING", "smoke.detected", "Asap terdeteksi!");
    setLcdOverride("ASAP TERDETEKSI", "SEGERA PERIKSA!", 5000);
  } else if (gasType == "gas") {
    track = TRACK_GAS_DETECTED;
    reason = "gas_detected";
    gasStatusStr = "detected";
    publishEvent("WARNING", "gas.detected", "Gas terdeteksi!");
    setLcdOverride("GAS TERDETEKSI", "SEGERA PERIKSA!", 5000);
  }
  if (track != -1) {
    if (!dfPlayerReady) return;
    if (!bluetoothAudioState) { setBluetoothAudio(true); delay(400); }
    dfPlayer.play(track);
    lastVoiceMillis = millis();
    publishVoicePlayedEvent(track, "sensor");
  }
}

void playTemperatureWarningVoice() {
  unsigned long now = millis();
  if (now - lastTempAudioTime < TEMP_VOICE_COOLDOWN_MS) return;
  lastTempAudioTime = now;
  setBuzzer(true, false);
  setBluetoothAudio(true);
  playVoice(TRACK_TEMP_DETECTED, "temp_warning");
  publishEvent("WARNING", "temperature.high", "Suhu terdeteksi melebihi ambang batas");
  publishVoicePlayedEvent(TRACK_TEMP_DETECTED, "sensor");
}

void playPirGreeting(String motionType) {
  int track = TRACK_GESTURE_WALK;
  const char* reason = "pir_motion";
  if (motionType == "jump") { track = TRACK_GESTURE_JUMP; reason = "pir_jump"; }
  else if (motionType == "wave") { track = TRACK_GESTURE_WAVE; reason = "pir_wave"; }
  playVoice((uint8_t)track, reason);
  publishVoicePlayedEvent(track, "pir");
}

void nyalakanBluetooth() {
  setupBluetooth();
  bluetoothAktif = true;
  deviceConnected = false;
  playBluetoothGreeting();
  setLcdOverride("BT AKTIF", "MENUNGGU HP", 3000);
  waktuBluetoothMulai = millis();
  setRgb(0, 255, 0);
  Serial.println("[BLE] Bluetooth/audio aktif. Nama: Smartbox Assistant");
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "bluetooth_active";
  doc["status"] = "active";
  doc["message"] = "Bluetooth Smartbox Assistant diaktifkan";
  doc["millis"] = millis();
  publishJson(topicEvent(), doc, false);
}

void matikanBluetooth() {
  bluetoothAktif = false;
  deviceConnected = false;
  if (bleSudahDibuat) BLEDevice::getAdvertising()->stop();
  setBluetoothAudio(false);
  setRgb(255, 0, 0);
  Serial.println("[BLE] Bluetooth/audio dimatikan.");
  setLcdOverride("BT DIMATIKAN", "OFFLINE", 3000);
  publishEvent("INFO", "bluetooth.off", "Bluetooth/audio dimatikan.");
}

void cekTimerBluetooth() { return; }

void prosesDataBluetooth() {
  if (dataBluetooth.length() == 0) return;
  dataBluetooth.trim(); dataBluetooth.toLowerCase();
  if (dataBluetooth == "relay1 on") { setRelay(1, true, true); setLcdOverride("RELAY 1", "ON", 3000); }
  else if (dataBluetooth == "relay1 off") { setRelay(1, false, true); setLcdOverride("RELAY 1", "OFF", 3000); }
  else if (dataBluetooth == "relay2 on") { setRelay(2, true, true); setLcdOverride("RELAY 2", "ON", 3000); }
  else if (dataBluetooth == "relay2 off") { setRelay(2, false, true); setLcdOverride("RELAY 2", "OFF", 3000); }
  else if (dataBluetooth == "status") {
    int gasRaw = analogRead(MQ2_PIN); float tempC = rtcReady ? rtc.getTemperature() : 0.0;
    char statusBuf[64]; snprintf(statusBuf, sizeof(statusBuf), "MQ2: %d, Temp: %0.1fC", gasRaw, tempC);
    setLcdOverride("STATUS SMARTBOX", statusBuf, 3000);
  } else if (dataBluetooth == "bt on") { nyalakanBluetooth(); }
  else if (dataBluetooth == "bt off") { matikanBluetooth(); }
  dataBluetooth = "";
}

void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs = 3000) {
  // LCD removed, replaced by LED 12C/12V indicators. Log to Serial instead.
  Serial.printf("[STATUS] %s - %s\n", l1, l2);
}

void setBluetoothAudio(bool state) {
  bluetoothAudioState = state;
  digitalWrite(BT_BASE_PIN, state ? HIGH : LOW);
  if (state) setRgb(0, 80, 0); else setRgb(80, 0, 0);
}

void playDfTrack(int track) {
  if (!dfPlayerReady) return;
  if (!bluetoothAudioState) { setBluetoothAudio(true); delay(400); }
  dfPlayer.play(track);
  dfplayerStatusStr = "playing_" + String(track);
}

void stopDfTrack() { if (dfPlayerReady) { dfPlayer.stop(); dfplayerStatusStr = "stopped"; } }

void setRelay(uint8_t relayNumber, bool state, bool withVoice = true) {
  if (relayNumber == 1) { relay1State = state; digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF); }
  if (relayNumber == 2) { relay2State = state; digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF); }
  if (withVoice) playDfTrack(state ? 6 : 7);
}

void setBuzzer(bool state, bool manualMode = false) {
  if (manualMode) buzzerManual = state;
  digitalWrite(BUZZER_PIN, state ? HIGH : LOW);
}

void setupMicI2S() {
  i2s_config_t i2s_config = {.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX), .sample_rate = 16000, .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT, .communication_format = I2S_COMM_FORMAT_STAND_I2S, .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1, .dma_buf_count = 8, .dma_buf_len = 64, .use_apll = false, .tx_desc_auto_clear = false, .fixed_mclk = 0};
  i2s_pin_config_t pin_config = {.bck_io_num = MIC_SCK, .ws_io_num = MIC_WS, .data_out_num = I2S_PIN_NO_CHANGE, .data_in_num = MIC_SD};
  i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(MIC_I2S_PORT, &pin_config);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.println("========== WIFI CONNECT ==========");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.disconnect(true, true);
  delay(300);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Connected. IP: ");
    Serial.println(WiFi.localIP());
    setRgb(0, 40, 0);
    blinkLed12c(1, 150);
  } else {
    Serial.println("[WIFI] Gagal connect, akan retry di loop.");
    setRgb(80, 0, 0);
  }
}

void publishOnlineStatus(bool online) {
  StaticJsonDocument<192> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  publishJson(topicStatus(), doc, true);
  publishJson("smartbox/status", doc, true);
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;
  if (millis() - lastMqttReconnectAt < MQTT_RETRY_GAP_MS) return;
  lastMqttReconnectAt = millis();

  Serial.println("[MQTT] Connecting...");
  String clientId = String("SmartBox-") + DEVICE_ID + "-" + String(random(0xffff), HEX);
  String willPayload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"online\":false}";

  bool ok = mqttClient.connect(
    clientId.c_str(), MQTT_USER, MQTT_PASS,
    topicStatus().c_str(), 1, true, willPayload.c_str()
  );

  if (ok) {
    Serial.println("[MQTT] Connected.");
    mqttClient.subscribe(topicCommand().c_str());
    mqttClient.subscribe("smartbox/relay/set");
    mqttClient.subscribe("smartbox/buzzer/set");
    mqttClient.subscribe("smartbox/alarm/set");
    mqttClient.subscribe("smartbox/voice/mode");
    mqttClient.subscribe("smartbox/sensor/gas");
    mqttClient.subscribe("smartbox/sensor/temperature");
    publishOnlineStatus(true);
    publishEvent("INFO", "mqtt.connected", "ESP32 tersambung ke MQTT Cloud.");
    setRgb(0, 0, 80);
    blinkLed12c(2, 150);
  } else {
    Serial.printf("[MQTT] Gagal, state=%d\n", mqttClient.state());
    setRgb(80, 0, 0);
  }
}

void handleRelayCommand(JsonObject data, const char *cmdId, const char *type) {
  bool state = data["state"] | false;
  int relayNumber = data["relay"] | 1;
  setRelay(relayNumber, state, true);
  publishAck(cmdId, type, true, "Relay updated.");
}

void handleAlarmCommand(JsonObject data, const char *cmdId, const char *type) {
  const char *alarmId = data["id"] | "morning";
  int track = data["track"] | TRACK_ALARM_MORNING;
  int hour = data["hour"] | 7;
  int minute = data["minute"] | 0;
  bool enabled = data["enabled"] | true;
  int slot = data["slot"] | 0;
  strncpy(alarmList[slot].id, alarmId, 15);
  alarmList[slot].hour = hour; alarmList[slot].minute = minute;
  alarmList[slot].track = track; alarmList[slot].enabled = enabled;
  playVoice((uint8_t)track, "alarm_confirm");
  publishAck(cmdId, type, true, "Alarm updated.");
}

void handleCommandJson(JsonDocument &doc, const String &topic) {
  const char *cmdId = doc["id"] | "";
  const char *type = doc["type"] | "";
  JsonObject data = doc["payload"].as<JsonObject>();
  if (data.isNull()) data = doc.as<JsonObject>();

  if (strcmp(type, "relay.set") == 0) handleRelayCommand(data, cmdId, type);
  else if (strcmp(type, "gasSensor.set") == 0) {
    gasEnabled = data["enabled"] | true;
    lastGasWarning = false; lastSmokeWarning = false;
    saveSettings();
    publishAck(cmdId, type, true, "Sensor updated.");
  } else if (strcmp(type, "voice.play") == 0) {
    int track = data["track"] | -1;
    if (track != -1) { playVoice((uint8_t)track, "voice_play_cmd"); publishAck(cmdId, type, true, "DFPlayer play."); }
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<768> doc;
  if (!deserializeJson(doc, payload, length)) handleCommandJson(doc, String(topic));
}

int getFilteredGas() {
  int raw = analogRead(MQ2_PIN);
  if (gasRawFiltered < 0.0) gasRawFiltered = raw;
  else gasRawFiltered = (0.15 * raw) + (0.85 * gasRawFiltered);
  return (int)gasRawFiltered;
}

void calibrateMQ2(int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) { sum += analogRead(MQ2_PIN); delay(50); }
  MQ2_BASELINE = sum / samples;
  smokeThreshold = MQ2_BASELINE + SMOKE_THRESHOLD_OFFSET;
  gasThreshold   = MQ2_BASELINE + GAS_THRESHOLD_OFFSET;
  resetThreshold = MQ2_BASELINE + RESET_THRESHOLD_OFFSET;
  saveSettings();
}

String getIsoTimestamp() {
  DateTime now = rtc.now();
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.000Z", now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(buf);
}

void publishTelemetry(int gasRaw, float tempC, bool gasWarning, bool tempWarning, bool pirDetected, const String &gasLevel, bool obstacleNear) {
  StaticJsonDocument<1024> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperatureC"] = tempC;
  doc["gasRaw"] = gasRaw;
  doc["gasLevel"] = gasLevel;
  doc["smokeDetected"] = lastSmokeWarning;
  doc["temperatureHigh"] = tempWarning;
  doc["createdAt"] = getIsoTimestamp();
  publishJson(topicTelemetry(), doc, false);
}

void sendTelemetryNow() {
  int gas = getFilteredGas();
  float temp = rtcReady ? (rtc.getTemperature() + tempOffset) : 0.0;
  bool isGas = (gas >= gasThreshold);
  bool isSmoke = (gas >= smokeThreshold);
  publishTelemetry(gas, temp, isGas || isSmoke, false, false, "normal", false);
}

void sendTelemetryHttp(int gasRaw, float tempC, bool gasWarning, bool tempWarning, bool pirDetected, bool obstacleNear) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, "https://smartbox-asisten.vercel.app/api/telemetry");
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<512> doc;
  doc["gasRaw"] = gasRaw;
  String body; serializeJson(doc, body);
  http.POST(body);
  http.end();
}

void checkWarnings(int gasRaw, float tempC, bool anyGasWarning, bool tempWarning) {
  bool isGas   = gasEnabled && (gasRaw >= gasThreshold);
  bool isSmoke = gasEnabled && (gasRaw >= smokeThreshold) && (gasRaw < gasThreshold);
  if (isGas || isSmoke || tempWarning) {
    setBuzzer(true, false); setBluetoothAudio(true); setRgb(255, 80, 0);
    if (isGas && !lastGasWarning) { lastGasWarning = true; setRelay(1, true, false); }
    if (isSmoke && !lastSmokeWarning) { lastSmokeWarning = true; setRelay(1, true, false); }
    playGasWarningVoice(isGas ? "gas" : "smoke");
  } else {
    if (gasRaw < resetThreshold) { lastGasWarning = false; lastSmokeWarning = false; setRelay(1, false, false); }
    if (!buzzerManual) setBuzzer(false, false);
  }
}

void checkAlarms() {
  if (!rtcReady) return;
  DateTime now = rtc.now();
  for (int i = 0; i < 3; i++) {
    if (alarmList[i].enabled && now.hour() == alarmList[i].hour && now.minute() == alarmList[i].minute && alarmList[i].lastTriggeredDay != now.day()) {
      alarmList[i].lastTriggeredDay = now.day();
      playAlarmVoice(alarmList[i].id);
    }
  }
}

void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning, bool pirDetected) {
  // LCD removed, replaced by LED 12C/12V indicators
}

void checkClaps() {
  if (!voiceMode || !clapEnabled) return;
  size_t bytesRead = 0;
  i2s_read(MIC_I2S_PORT, sampleBuffer, sizeof(sampleBuffer), &bytesRead, 0);
  if (bytesRead > 0) {
    clapCount++; lastClapTime = millis();
  }
}

void checkButtons() {
  bool blackBtnState = (digitalRead(BLACK_BTN_PIN) == LOW);
  if (blackBtnState) {
    playTimeTemperatureVoice();
  }
}

void setup() {
  Serial.begin(115200);
  loadSettings();
  loadSchedules();
  
  initLed12c();
  blinkLed12c(2, 200);
  
  pinMode(RELAY_1_PIN, OUTPUT); pinMode(RELAY_2_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BLACK_BTN_PIN, INPUT_PULLUP);
  Wire.begin(I2C_SDA, I2C_SCL);
  if (rtc.begin()) rtcReady = true;
  dfSerial.begin(9600, SERIAL_8N1, ESP_RX_PIN, ESP_TX_PIN);
  dfPlayerReady = dfPlayer.begin(dfSerial);
  setupMicI2S();
  connectWiFi();
  calibrateMQ2(100);
  playSystemReady();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  connectMqtt();
  mqttClient.loop();
  
  checkButtons();
  checkAlarms();
  
  int gasRaw = getFilteredGas();
  bool gasWarning = gasEnabled && gasRaw >= gasThreshold;
  bool smokeWarning = gasEnabled && gasRaw >= smokeThreshold;
  bool pirDetected = pirEnabled && digitalRead(PIR_PIN) == HIGH;
  
  updateLed12c(gasWarning, smokeWarning, pirDetected, WiFi.status() == WL_CONNECTED, mqttClient.connected());
  
  checkWarnings(gasRaw, 0, false, false);
  
  delay(10);
}
