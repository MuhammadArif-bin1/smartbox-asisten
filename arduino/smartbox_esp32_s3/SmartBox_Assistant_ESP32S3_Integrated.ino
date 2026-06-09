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
#include <LiquidCrystal_I2C.h>
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
// GANTI DATA DI BAWAH INI SESUAI WIFI DAN BROKER MQTT CLOUD KAMU.
// Untuk Vercel/hosting, gunakan MQTT cloud, bukan localhost.

const char *WIFI_SSID = "BAGUS";
const char *WIFI_PASS = "s4nsan15675";

// Contoh HiveMQ Cloud:
// MQTT_HOST cukup hostname saja, TANPA "mqtts://" dan TANPA ":8883".
const char *MQTT_HOST = "6559400ba6c741398aa7048b471d5a31.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char *MQTT_USER = "smartbox001";
const char *MQTT_PASS = "Smartbox123!";

const char *DEVICE_ID = "smartbox-001";

// ==========================================================
// 2. PIN MAP ESP32-S3
// ==========================================================
// I2C LCD 16x2 + RTC DS3231
#define I2C_SDA 1
#define I2C_SCL 2

// Sensor
#define MQ2_PIN 3
#define PIR_PIN 9
#define IR_PIN                                                                 \
  42 // IR obstacle. Dipakai GPIO42 agar tidak bentrok dengan buzzer GPIO10.

// Input user
#define BLACK_BTN_PIN 7
#define WHITE_BTN_PIN 19 // Jika USB bermasalah, pindah ke GPIO39.
#define RED_BTN_PIN    20  // Tombol Merah (Tekan Cepat = Nyala/Mati Bluetooth)

// Output aktuator
#define RELAY_1_PIN 21 // Stop kontak 1, LOW level trigger.
#define RELAY_2_PIN 47 // Stop kontak 2, LOW level trigger.
#define BUZZER_PIN 10
#define BT_BASE_PIN 14 // Transistor/TIP122 untuk daya bluetooth/amplifier.
#define RGB_PIN 48     // RGB bawaan ESP32-S3.
#define NUM_PIXELS 1

// DFPlayer Mini
#define ESP_RX_PIN 8  // ESP32 RX <- TX DFPlayer.
#define ESP_TX_PIN 18 // ESP32 TX -> RX DFPlayer lewat resistor 1K.

// INMP441 microphone
#define MIC_SCK 4
#define MIC_WS 5
#define MIC_SD 6
#define MIC_I2S_PORT I2S_NUM_0

// PT8211 optional, tidak aktif default karena suara utama memakai DFPlayer.
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
// 4. THRESHOLD & TIMER
// ==========================================================
int GAS_THRESHOLD = 1800;
float TEMP_THRESHOLD = 37.0;

const unsigned long TELEMETRY_INTERVAL_MS = 3000;
const unsigned long LCD_INTERVAL_MS = 1000;
const unsigned long WARNING_AUDIO_GAP_MS = 10000;
const unsigned long MQTT_RETRY_GAP_MS = 3000;

// Clap detection
bool clapEnabled = true;
const long CLAP_MIN_VALUE = 50000;
const int CLAP_THRESHOLD_FACTOR = 3;
int32_t sampleBuffer[64];
long runningAverage = 2000;
unsigned long lastClapTime = 0;
int clapCount = 0;

// ==========================================================
// 5. OBJECTS
// ==========================================================
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_NeoPixel rgbLed(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;

// ==========================================================
// 6. STATE VARIABLES
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

bool lastGasWarning = false;
bool lastTempWarning = false;

unsigned long lastTelemetryAt = 0;
unsigned long lastLcdAt = 0;
unsigned long lastWarningAudioAt = 0;
unsigned long lastMqttReconnectAt = 0;
unsigned long lastHttpTelemetryAt = 0;

// BLE ESP32-S3
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
const unsigned long durasiBluetooth = 60000; // 1 minute
bool pendingBluetoothSongPlay = false;
unsigned long bluetoothSongPlayTime = 0;

// NVS Preferences
Preferences preferences;

// New Configuration Settings
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
const unsigned long PIR_GREETING_COOLDOWN = 60000; // 1 minute

// LCD Backlight & Override
bool lcdBacklightOn = true;
unsigned long lcdOverrideUntil = 0;
char lcdOverrideLine1[17] = "";
char lcdOverrideLine2[17] = "";
bool systemBooting = true;

// Relay Schedules
#define MAX_RELAY_SCHEDULES 5

struct RelaySchedule {
  char id[16];
  int startHour;
  int startMinute;
  int endHour;
  int endMinute;
  int relayNum; // 1 or 2
  bool enabled;
  int lastTriggeredStartDay;
  int lastTriggeredEndDay;
};

RelaySchedule relaySchedules[MAX_RELAY_SCHEDULES];
int relayScheduleCount = 0;

// Alarm schedule
struct AlarmConfig {
  char id[16];
  int hour;
  int minute;
  int track;
  bool enabled;
  int lastTriggeredDay;
};

AlarmConfig alarmList[3] = {{"morning", 7, 0, 2, true, -1},
                            {"noon", 12, 0, 3, true, -1},
                            {"evening", 17, 0, 4, true, -1}};

// ==========================================================
// FORWARD DECLARATIONS
// Wajib untuk mencegah error "not declared in this scope"
// karena beberapa fungsi dipanggil sebelum definisinya.
// ==========================================================
void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs);
void setBluetoothAudio(bool state);
void playDfTrack(int track);
void stopDfTrack();
void setRelay(uint8_t relayNumber, bool state, bool withVoice);
void setBuzzer(bool state, bool manualMode);
void handleRelayScheduleCommand(JsonObject data, const char *cmdId,
                                const char *type);
void deleteRelaySchedule(const char *schId);
void saveSettings();
void saveSchedules();

// ==========================================================
// 7. MQTT TOPICS
// ==========================================================
String topicBase() { return String("smartbox/") + DEVICE_ID; }

String topicTelemetry() { return "smartbox/telemetry"; }

String topicEvent() { return topicBase() + "/event"; }

String topicAck() { return topicBase() + "/ack"; }

String topicCommand() { return topicBase() + "/cmd"; }

String topicStatus() { return "smartbox/status"; }

// ==========================================================
// 8. UTILITY FUNCTIONS
// ==========================================================
void setRgb(uint8_t r, uint8_t g, uint8_t b) {
  rgbLed.setPixelColor(0, rgbLed.Color(r, g, b));
  rgbLed.show();
}

void publishJson(const String &topic, JsonDocument &doc,
                 bool retained = false) {
  if (!mqttClient.connected())
    return;

  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topic.c_str(), payload.c_str(), retained);

  Serial.print("[MQTT OUT] ");
  Serial.print(topic);
  Serial.print(" -> ");
  Serial.println(payload);
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

void publishAck(const char *id, const char *type, bool ok,
                const char *message) {
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

  preferences.end();
  Serial.println("[SETTINGS] Loaded settings from NVS");
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

  preferences.end();
  Serial.println("[SETTINGS] Saved settings to NVS");
}

void loadSchedules() {
  preferences.begin("schedules", false);
  relayScheduleCount = preferences.getInt("count", 0);
  if (relayScheduleCount > MAX_RELAY_SCHEDULES)
    relayScheduleCount = MAX_RELAY_SCHEDULES;

  for (int i = 0; i < relayScheduleCount; i++) {
    char key[16];
    snprintf(key, sizeof(key), "sch_%d", i);
    preferences.getBytes(key, &relaySchedules[i], sizeof(RelaySchedule));
    // Clear triggers on boot
    relaySchedules[i].lastTriggeredStartDay = -1;
    relaySchedules[i].lastTriggeredEndDay = -1;
  }
  preferences.end();
  Serial.printf("[SCHEDULE] Loaded %d schedules from NVS\n",
                relayScheduleCount);
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
  Serial.println("[SCHEDULE] Saved schedules to NVS");
}

// ==========================================================
// BLUETOOTH BLE FUNCTIONS
// ==========================================================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println("BLE tersambung");
    setRgb(0, 0, 255); // Blue LED
    setLcdOverride("BT CONNECTED", "CONNECTED", 3000);

    // Prevent greeting from repeating due to rapid BLE reconnection handshakes
    static unsigned long lastBleGreetingTime = 0;
    if (millis() - lastBleGreetingTime >= 15000) {
      lastBleGreetingTime = millis();
      
      // Play Bluetooth Connected voice notification (Track 6), then play a song (Track 1)
      playDfTrack(6); // Sistem hidup / Welcome
      pendingBluetoothSongPlay = true;
      bluetoothSongPlayTime = millis() + 4000;
    }
  }

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    pendingBluetoothSongPlay = false; // Reset song play if disconnected before track starts
    Serial.println("BLE terputus");

    if (bluetoothAktif) {
      delay(100);
      BLEDevice::startAdvertising();
      setRgb(0, 255, 0); // Green LED
      setLcdOverride("BT AKTIF", "MENUNGGU HP", 3000);
      Serial.println("BLE advertising jalan lagi");
    } else {
      setRgb(255, 0, 0); // Red LED
      setLcdOverride("BT MATI", "TIMER HABIS", 3000);
    }
  }
};

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = String(pCharacteristic->getValue().c_str());
    value.trim();
    if (value.length() > 0) {
      dataBluetooth = value;
    }
  }
};

void setupBluetooth() {
  if (bleSudahDibuat)
    return;

  BLEDevice::init("SMARTBOX_ASISTEN");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  txCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);

  txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *rxCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);

  rxCharacteristic->setCallbacks(new RxCallbacks());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  bleSudahDibuat = true;

  Serial.println("BLE dibuat");
  Serial.println("Nama BLE: SMARTBOX_ASISTEN");
}

void nyalakanBluetooth() {
  setupBluetooth();

  bluetoothAktif = true;
  deviceConnected = false;

  // Make sure amplifier is powered
  digitalWrite(BT_BASE_PIN, HIGH);

  delay(100);
  BLEDevice::startAdvertising();

  waktuBluetoothMulai = millis();

  setRgb(0, 255, 0); // Green LED

  Serial.println("BLE aktif selama 1 menit");
  setLcdOverride("BT AKTIF", "DURASI 1 MENIT", 3000);
}

void matikanBluetooth() {
  bluetoothAktif = false;
  deviceConnected = false;

  if (bleSudahDibuat) {
    BLEDevice::getAdvertising()->stop();
  }

  // Restore amplifier power base state if bluetooth audio state is false
  if (!bluetoothAudioState) {
    digitalWrite(BT_BASE_PIN, LOW);
  }

  setRgb(255, 0, 0); // Red LED

  Serial.println("BLE dimatikan");
  setLcdOverride("BT DIMATIKAN", "TIMER HABIS", 3000);
}

void cekTimerBluetooth() {
  if (!bluetoothAktif)
    return;
  // If a device is connected, refresh the timer so it doesn't timeout while in
  // use
  if (deviceConnected) {
    waktuBluetoothMulai = millis();
    return;
  }

  if (millis() - waktuBluetoothMulai >= durasiBluetooth) {
    Serial.println("Timer 1 menit selesai");
    matikanBluetooth();
  }
}

void prosesDataBluetooth() {
  if (dataBluetooth.length() == 0)
    return;

  dataBluetooth.trim();
  dataBluetooth.toLowerCase();

  Serial.print("Data BLE: ");
  Serial.println(dataBluetooth);

  if (dataBluetooth == "relay1 on") {
    setRelay(1, true, true);
    setLcdOverride("RELAY 1", "ON", 3000);
  }

  else if (dataBluetooth == "relay1 off") {
    setRelay(1, false, true);
    setLcdOverride("RELAY 1", "OFF", 3000);
  }

  else if (dataBluetooth == "relay2 on") {
    setRelay(2, true, true);
    setLcdOverride("RELAY 2", "ON", 3000);
  }

  else if (dataBluetooth == "relay2 off") {
    setRelay(2, false, true);
    setLcdOverride("RELAY 2", "OFF", 3000);
  }

  else if (dataBluetooth == "status") {
    int gasRaw = analogRead(MQ2_PIN);
    float tempC = rtcReady ? rtc.getTemperature() : 0.0;

    char statusBuf[64];
    snprintf(statusBuf, sizeof(statusBuf), "MQ2: %d, Temp: %0.1fC", gasRaw,
             tempC);

    setLcdOverride("STATUS SMARTBOX", statusBuf, 3000);

    if (deviceConnected && txCharacteristic != NULL) {
      txCharacteristic->setValue(statusBuf);
      txCharacteristic->notify();
    }
  }

  else if (dataBluetooth == "lcd") {
    setLcdOverride("smartbox asisten", "saya", 2000);
  }

  else if (dataBluetooth == "bt on") {
    nyalakanBluetooth();
  }

  else if (dataBluetooth == "bt off") {
    matikanBluetooth();
  }

  else {
    char cmdErr[17];
    snprintf(cmdErr, sizeof(cmdErr), "%s",
             dataBluetooth.substring(0, 16).c_str());
    setLcdOverride("CMD TDK DIKENAL", cmdErr, 3000);
  }

  dataBluetooth = "";
}

// ==========================================================
// NEW SYSTEM HELPER FUNCTIONS (SCHEDULES, GREETINGS & SLEEP)
// ==========================================================
void setLcdOverride(const char *l1, const char *l2,
                    unsigned long durationMs = 3000) {
  strncpy(lcdOverrideLine1, l1, 16);
  lcdOverrideLine1[16] = '\0';
  strncpy(lcdOverrideLine2, l2, 16);
  lcdOverrideLine2[16] = '\0';
  lcdOverrideUntil = millis() + durationMs;
}

bool isRelayScheduledOn(int relayNum) {
  if (!rtcReady)
    return false;
  DateTime now = rtc.now();
  int currentMin = now.hour() * 60 + now.minute();

  for (int i = 0; i < relayScheduleCount; i++) {
    if (!relaySchedules[i].enabled || relaySchedules[i].relayNum != relayNum)
      continue;

    int startMin =
        relaySchedules[i].startHour * 60 + relaySchedules[i].startMinute;
    int endMin = relaySchedules[i].endHour * 60 + relaySchedules[i].endMinute;

    if (startMin <= endMin) {
      if (currentMin >= startMin && currentMin < endMin) {
        return true;
      }
    } else {
      if (currentMin >= startMin || currentMin < endMin) {
        return true;
      }
    }
  }
  return false;
}

void checkRelaySchedules() {
  if (!rtcReady)
    return;
  DateTime now = rtc.now();
  int currentDay = now.day();
  int currentHour = now.hour();
  int currentMinute = now.minute();

  for (int i = 0; i < relayScheduleCount; i++) {
    if (!relaySchedules[i].enabled)
      continue;

    // Check start trigger
    if (currentHour == relaySchedules[i].startHour &&
        currentMinute == relaySchedules[i].startMinute &&
        relaySchedules[i].lastTriggeredStartDay != currentDay) {

      relaySchedules[i].lastTriggeredStartDay = currentDay;
      setRelay(relaySchedules[i].relayNum, true, true);

      char msg[96];
      snprintf(msg, sizeof(msg), "Jadwal relay %d ON aktif.",
               relaySchedules[i].relayNum);
      publishEvent("INFO", "schedule.relay.on", msg);
    }

    // Check end trigger
    if (currentHour == relaySchedules[i].endHour &&
        currentMinute == relaySchedules[i].endMinute &&
        relaySchedules[i].lastTriggeredEndDay != currentDay) {

      relaySchedules[i].lastTriggeredEndDay = currentDay;
      setRelay(relaySchedules[i].relayNum, false, true);

      char msg[96];
      snprintf(msg, sizeof(msg), "Jadwal relay %d OFF aktif.",
               relaySchedules[i].relayNum);
      publishEvent("INFO", "schedule.relay.off", msg);
    }
  }
}

void deleteRelaySchedule(const char *schId) {
  int foundIdx = -1;
  for (int i = 0; i < relayScheduleCount; i++) {
    if (strcmp(relaySchedules[i].id, schId) == 0) {
      foundIdx = i;
      break;
    }
  }

  if (foundIdx != -1) {
    for (int i = foundIdx; i < relayScheduleCount - 1; i++) {
      relaySchedules[i] = relaySchedules[i + 1];
    }
    relayScheduleCount--;
    saveSchedules();
    Serial.printf("[SCHEDULE] Deleted schedule %s\n", schId);
  }
}

void handleRelayScheduleCommand(JsonObject data, const char *cmdId,
                                const char *type) {
  const char *schId = data["id"] | "";
  if (strlen(schId) == 0) {
    publishAck(cmdId, type, false, "Missing schedule ID");
    return;
  }

  int relayNum = data["relay"] | 1;
  bool enabled = data["enabled"] | true;

  int startHour = -1, startMinute = -1;
  int endHour = -1, endMinute = -1;

  if (data["startHour"].is<int>() && data["startMinute"].is<int>()) {
    startHour = data["startHour"].as<int>();
    startMinute = data["startMinute"].as<int>();
  } else if (data["start"].is<const char *>()) {
    sscanf(data["start"].as<const char *>(), "%d:%d", &startHour, &startMinute);
  }

  if (data["endHour"].is<int>() && data["endMinute"].is<int>()) {
    endHour = data["endHour"].as<int>();
    endMinute = data["endMinute"].as<int>();
  } else if (data["end"].is<const char *>()) {
    sscanf(data["end"].as<const char *>(), "%d:%d", &endHour, &endMinute);
  }

  if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
      endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
    publishAck(cmdId, type, false, "Invalid schedule range");
    return;
  }

  // Find existing slot
  int slot = -1;
  for (int i = 0; i < relayScheduleCount; i++) {
    if (strcmp(relaySchedules[i].id, schId) == 0) {
      slot = i;
      break;
    }
  }

  if (slot == -1) {
    if (relayScheduleCount < MAX_RELAY_SCHEDULES) {
      slot = relayScheduleCount;
      relayScheduleCount++;
    } else {
      publishAck(cmdId, type, false, "Schedule list full");
      return;
    }
  }

  strncpy(relaySchedules[slot].id, schId, sizeof(relaySchedules[slot].id) - 1);
  relaySchedules[slot].id[sizeof(relaySchedules[slot].id) - 1] = '\0';
  relaySchedules[slot].startHour = startHour;
  relaySchedules[slot].startMinute = startMinute;
  relaySchedules[slot].endHour = endHour;
  relaySchedules[slot].endMinute = endMinute;
  relaySchedules[slot].relayNum = relayNum;
  relaySchedules[slot].enabled = enabled;
  relaySchedules[slot].lastTriggeredStartDay = -1;
  relaySchedules[slot].lastTriggeredEndDay = -1;

  saveSchedules();
  publishAck(cmdId, type, true, "Relay schedule updated");
}

bool isPirGreetingScheduled() {
  if (!rtcReady)
    return true;
  DateTime now = rtc.now();
  int currentMin = now.hour() * 60 + now.minute();
  int startMin = pirGreetingStartHour * 60 + pirGreetingStartMinute;
  int endMin = pirGreetingEndHour * 60 + pirGreetingEndMinute;

  if (startMin <= endMin) {
    return (currentMin >= startMin && currentMin < endMin);
  } else {
    return (currentMin >= startMin || currentMin < endMin);
  }
}

void wakeUpFromSleep() {
  lastMotionDetectedTime = millis();
  if (!lcdBacklightOn) {
    lcd.backlight();
    lcdBacklightOn = true;
    Serial.println("[SLEEP] Waking up. LCD Backlight ON.");
    setLcdOverride("SMARTBOX WAKING", "HELLO THERE", 2000);
  }
}

void checkSleepMode() {
  if (!sleepModeEnabled)
    return;

  unsigned long now = millis();
  if (now - lastMotionDetectedTime >= 3600000) { // 1 hour inactivity
    if (lcdBacklightOn) {
      lcd.noBacklight();
      lcdBacklightOn = false;
      Serial.println("[SLEEP] LCD Backlight OFF due to inactivity.");
    }

    // Turn off Relay 1 if not scheduled
    if (relay1State && !isRelayScheduledOn(1)) {
      setRelay(1, false, false);
      Serial.println("[SLEEP] Relay 1 turned OFF due to inactivity.");
    }

    // Turn off Relay 2 if not scheduled
    if (relay2State && !isRelayScheduledOn(2)) {
      setRelay(2, false, false);
      Serial.println("[SLEEP] Relay 2 turned OFF due to inactivity.");
    }
  }
}

void setBluetoothAudio(bool state) {
  bluetoothAudioState = state;
  digitalWrite(BT_BASE_PIN, state ? HIGH : LOW);
  Serial.printf("[BT AUDIO] %s\n", state ? "ON" : "OFF");

  if (state)
    setRgb(0, 80, 0);
  else
    setRgb(80, 0, 0);
}

void playDfTrack(int track) {
  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Belum siap, track tidak diputar.");
    return;
  }

  if (!bluetoothAudioState) {
    setBluetoothAudio(true);
    delay(400);
  }

  Serial.printf("[DFPLAYER] Play track %d\n", track);
  dfPlayer.play(track);
}

void stopDfTrack() {
  if (dfPlayerReady) {
    dfPlayer.stop();
  }
}

void setRelay(uint8_t relayNumber, bool state, bool withVoice = true) {
  if (relayNumber == 1) {
    relay1State = state;
    digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF);
    Serial.printf("[RELAY 1] %s\n", state ? "ON" : "OFF");
  }

  if (relayNumber == 2) {
    relay2State = state;
    digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF);
    Serial.printf("[RELAY 2] %s\n", state ? "ON" : "OFF");
  }

  if (withVoice) {
    // Track 6 = sistem hidup/relay ON, track 7 = sistem mati/relay OFF.
    playDfTrack(state ? 6 : 7);
  }
}

void setBuzzer(bool state, bool manualMode = false) {
  if (manualMode)
    buzzerManual = state;
  digitalWrite(BUZZER_PIN, state ? HIGH : LOW);
  Serial.printf("[BUZZER] %s\n", state ? "ON" : "OFF");
}

void safeLcdPrint(uint8_t col, uint8_t row, const char *text) {
  if (!lcdReady)
    return;
  lcd.setCursor(col, row);
  lcd.print(text);
}

// ==========================================================
// 9. I2S MICROPHONE
// ==========================================================
void setupMicI2S() {
  i2s_config_t i2s_config = {.mode =
                                 (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
                             .sample_rate = 16000,
                             .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
                             .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
                             .communication_format = I2S_COMM_FORMAT_STAND_I2S,
                             .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
                             .dma_buf_count = 8,
                             .dma_buf_len = 64,
                             .use_apll = false,
                             .tx_desc_auto_clear = false,
                             .fixed_mclk = 0};

  i2s_pin_config_t pin_config = {.bck_io_num = MIC_SCK,
                                 .ws_io_num = MIC_WS,
                                 .data_out_num = I2S_PIN_NO_CHANGE,
                                 .data_in_num = MIC_SD};

  esp_err_t err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[MIC] i2s_driver_install gagal: %d\n", err);
    return;
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[MIC] i2s_set_pin gagal: %d\n", err);
    return;
  }

  Serial.println("[MIC] INMP441 siap.");
}

#if ENABLE_PT8211_TEST
void setupPT8211() {
  i2s_config_t tx_config = {.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
                            .sample_rate = 16000,
                            .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
                            .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
                            .communication_format = I2S_COMM_FORMAT_STAND_MSB,
                            .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
                            .dma_buf_count = 8,
                            .dma_buf_len = 64,
                            .use_apll = false,
                            .tx_desc_auto_clear = true,
                            .fixed_mclk = 0};

  i2s_pin_config_t tx_pin_config = {.bck_io_num = PT_BCLK,
                                    .ws_io_num = PT_LRC,
                                    .data_out_num = PT_DOUT,
                                    .data_in_num = I2S_PIN_NO_CHANGE};

  i2s_driver_install(PT_I2S_PORT, &tx_config, 0, NULL);
  i2s_set_pin(PT_I2S_PORT, &tx_pin_config);
  i2s_zero_dma_buffer(PT_I2S_PORT);
  Serial.println("[PT8211] siap.");
}
#endif

// ==========================================================
// 10. WIFI & MQTT
// ==========================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED)
    return;

  Serial.println();
  Serial.println("========== WIFI CONNECT ==========");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  if (lcdReady && !systemBooting) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connect...");
  }

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
    Serial.println("[WIFI] Connected.");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WIFI] RSSI: ");
    Serial.println(WiFi.RSSI());

    if (lcdReady && !systemBooting) {
      setLcdOverride("WiFi OK", WiFi.localIP().toString().c_str(), 2000);
    }

    setRgb(0, 40, 0);
  } else {
    Serial.println("[WIFI] Gagal connect, akan retry di loop.");
    if (lcdReady && !systemBooting) {
      setLcdOverride("WiFi Failed", "", 2000);
    }
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
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED)
    return;
  if (mqttClient.connected())
    return;

  if (millis() - lastMqttReconnectAt < MQTT_RETRY_GAP_MS)
    return;
  lastMqttReconnectAt = millis();

  Serial.println();
  Serial.println("========== MQTT CONNECT ==========");
  Serial.print("Host: ");
  Serial.println(MQTT_HOST);

  String clientId =
      String("SmartBox-") + DEVICE_ID + "-" + String(random(0xffff), HEX);

  String willPayload =
      String("{\"deviceId\":\"") + DEVICE_ID + "\",\"online\":false}";
  bool ok =
      mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                         topicStatus().c_str(), 1, true, willPayload.c_str());

  if (ok) {
    Serial.println("[MQTT] Connected.");

    mqttClient.subscribe(topicCommand().c_str());

    // Support topic lama supaya dashboard lama tetap bisa dipakai.
    mqttClient.subscribe("smartbox/relay/set");
    mqttClient.subscribe("smartbox/buzzer/set");
    mqttClient.subscribe("smartbox/alarm/set");
    mqttClient.subscribe("smartbox/voice/mode");
    mqttClient.subscribe("smartbox/sensor/gas");
    mqttClient.subscribe("smartbox/sensor/temperature");

    publishOnlineStatus(true);
    publishEvent("INFO", "mqtt.connected", "ESP32 tersambung ke MQTT Cloud.");

    if (lcdReady && !systemBooting) {
      setLcdOverride("MQTT Connected", "", 2000);
    }

    setRgb(0, 0, 80);
  } else {
    Serial.print("[MQTT] Gagal, state=");
    Serial.println(mqttClient.state());

    if (lcdReady && !systemBooting) {
      char stateStr[16];
      snprintf(stateStr, sizeof(stateStr), "State: %d", mqttClient.state());
      setLcdOverride("MQTT Failed", stateStr, 2000);
    }

    setRgb(80, 0, 0);
  }
}

// ==========================================================
// 11. MQTT COMMAND HANDLER
// ==========================================================
void handleRelayCommand(JsonObject data, const char *cmdId, const char *type) {
  // Format baru: { relay: 1, state: true }
  // Format lama : { relay: "socket_1", enabled: true }

  bool state = false;

  if (data["state"].is<bool>()) {
    state = data["state"].as<bool>();
  } else {
    state = data["enabled"] | false;
  }

  if (data["relay"].is<int>()) {
    int relayNumber = data["relay"] | 1;
    if (relayNumber == 1 || relayNumber == 2) {
      setRelay(relayNumber, state, true);
      publishAck(cmdId, type, true, "Relay updated.");
      return;
    }
  }

  const char *relayName = data["relay"] | "";
  if (strcmp(relayName, "socket_1") == 0) {
    setRelay(1, state, true);
    publishAck(cmdId, type, true, "Socket 1 updated.");
  } else if (strcmp(relayName, "socket_2") == 0) {
    setRelay(2, state, true);
    publishAck(cmdId, type, true, "Socket 2 updated.");
  } else if (strcmp(relayName, "bluetooth_ampli") == 0) {
    setBluetoothAudio(state);
    publishAck(cmdId, type, true, "Bluetooth audio updated.");
  } else {
    publishAck(cmdId, type, false, "Unknown relay.");
  }
}

void handleAlarmCommand(JsonObject data, const char *cmdId, const char *type) {
  const char *alarmId = data["id"] | "";
  if (strlen(alarmId) == 0) {
    alarmId = data["label"] | "morning";
  }

  bool enabled = data["enabled"] | true;

  int track = 2;
  if (data["track"].is<int>()) {
    track = data["track"].as<int>();
  } else if (data["audioTrack"].is<int>()) {
    track = data["audioTrack"].as<int>();
  }

  int hour = -1;
  int minute = -1;

  if (data["hour"].is<int>() && data["minute"].is<int>()) {
    hour = data["hour"] | 7;
    minute = data["minute"] | 0;
  } else {
    const char *alarmTime = data["time"] | "";
    sscanf(alarmTime, "%d:%d", &hour, &minute);
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    publishAck(cmdId, type, false, "Invalid alarm time.");
    return;
  }

  int slot = data["slot"] | -1;

  if (slot < 0 || slot > 2) {
    // Cari berdasarkan id.
    for (int i = 0; i < 3; i++) {
      if (strcmp(alarmList[i].id, alarmId) == 0) {
        slot = i;
        break;
      }
    }

    if (slot < 0 || slot > 2) {
      slot = 0;
    }
  }

  strncpy(alarmList[slot].id, alarmId, sizeof(alarmList[slot].id) - 1);
  alarmList[slot].id[sizeof(alarmList[slot].id) - 1] = '\0';
  alarmList[slot].hour = hour;
  alarmList[slot].minute = minute;
  alarmList[slot].track = track;
  alarmList[slot].enabled = enabled;
  alarmList[slot].lastTriggeredDay = -1;

  Serial.printf("[ALARM] Slot %d: %s %02d:%02d track %d %s\n", slot,
                alarmList[slot].id, hour, minute, track,
                enabled ? "ON" : "OFF");

  publishAck(cmdId, type, true, "Alarm updated.");
}

void handleCommandJson(JsonDocument &doc, const String &topic) {
  const char *cmdId = doc["id"] | "";
  const char *type = doc["type"] | "";

  JsonObject data = doc["payload"].as<JsonObject>();
  if (data.isNull()) {
    data = doc["data"].as<JsonObject>();
  }
  if (data.isNull()) {
    data = doc.as<JsonObject>();
  }

  // Support topic lama.
  if (topic == "smartbox/relay/set") {
    type = "relay.set";
  } else if (topic == "smartbox/buzzer/set") {
    type = "buzzer.set";
  } else if (topic == "smartbox/alarm/set") {
    type = "alarm.set";
  } else if (topic == "smartbox/voice/mode") {
    type = "voice.mode";
  } else if (topic == "smartbox/sensor/gas") {
    type = "gasSensor.set";
  } else if (topic == "smartbox/sensor/temperature") {
    type = "tempSensor.set";
  }

  Serial.print("[COMMAND] type=");
  Serial.println(type);

  if (strcmp(type, "relay.set") == 0) {
    handleRelayCommand(data, cmdId, type);
  }

  else if (strcmp(type, "ampRelay.set") == 0 ||
           strcmp(type, "bluetooth.set") == 0 ||
           strcmp(type, "bluetoothAudio.set") == 0) {
    bool state = false;
    if (data["state"].is<bool>()) {
      state = data["state"].as<bool>();
    } else if (data["enabled"].is<bool>()) {
      state = data["enabled"].as<bool>();
    }
    setBluetoothAudio(state);
    publishAck(cmdId, type, true, "Bluetooth audio power updated.");
  }

  else if (strcmp(type, "buzzer.set") == 0) {
    bool state = false;
    if (data["state"].is<bool>()) {
      state = data["state"].as<bool>();
    } else if (data["enabled"].is<bool>()) {
      state = data["enabled"].as<bool>();
    }
    setBuzzer(state, true);
    publishAck(cmdId, type, true, "Buzzer updated.");
  }

  else if (strcmp(type, "gasSensor.set") == 0) {
    gasEnabled = data["enabled"] | true;
    lastGasWarning = false;
    saveSettings();
    publishAck(cmdId, type, true,
               gasEnabled ? "Gas sensor ON." : "Gas sensor OFF.");
  }

  else if (strcmp(type, "tempSensor.set") == 0) {
    tempEnabled = data["enabled"] | true;
    lastTempWarning = false;
    publishAck(cmdId, type, true,
               tempEnabled ? "Temperature sensor ON."
                           : "Temperature sensor OFF.");
  }

  else if (strcmp(type, "voice.mode") == 0 ||
           strcmp(type, "assistant.set") == 0 ||
           strcmp(type, "clap.set") == 0) {
    bool state = true;
    if (data["enabled"].is<bool>()) {
      state = data["enabled"].as<bool>();
    } else if (data["state"].is<bool>()) {
      state = data["state"].as<bool>();
    }
    voiceMode = state;
    clapEnabled = state;
    playDfTrack(state ? 8 : 9);
    publishAck(cmdId, type, true,
               state ? "Voice/clap mode ON." : "Voice/clap mode OFF.");
  }

  else if (strcmp(type, "alarm.set") == 0 ||
           strcmp(type, "alarm.upsert") == 0) {
    handleAlarmCommand(data, cmdId, type);
  }

  else if (strcmp(type, "relaySchedule.set") == 0) {
    handleRelayScheduleCommand(data, cmdId, type);
  }

  else if (strcmp(type, "relaySchedule.delete") == 0) {
    const char *schId = data["id"] | "";
    deleteRelaySchedule(schId);
    publishAck(cmdId, type, true, "Relay schedule deleted.");
  }

  else if (strcmp(type, "pirSensor.set") == 0 ||
           strcmp(type, "sensor.pir") == 0) {
    pirEnabled = data["enabled"] | true;
    saveSettings();
    publishAck(cmdId, type, true,
               pirEnabled ? "PIR sensor ON." : "PIR sensor OFF.");
  }

  else if (strcmp(type, "sleepMode.set") == 0) {
    sleepModeEnabled = data["enabled"] | false;
    if (!sleepModeEnabled && !lcdBacklightOn) {
      lcd.backlight();
      lcdBacklightOn = true;
    }
    saveSettings();
    publishAck(cmdId, type, true,
               sleepModeEnabled ? "Sleep mode ON." : "Sleep mode OFF.");
  }

  else if (strcmp(type, "pirGreeting.set") == 0) {
    pirGreetingEnabled = data["enabled"] | false;
    pirGreetingTrack = data["track"] | pirGreetingTrack;
    if (data["start"].is<const char *>()) {
      sscanf(data["start"].as<const char *>(), "%d:%d", &pirGreetingStartHour,
             &pirGreetingStartMinute);
    }
    if (data["end"].is<const char *>()) {
      sscanf(data["end"].as<const char *>(), "%d:%d", &pirGreetingEndHour,
             &pirGreetingEndMinute);
    }
    saveSettings();
    publishAck(cmdId, type, true, "PIR Greeting configuration updated.");
  }

  else if (strcmp(type, "dfplayer.play") == 0 ||
           strcmp(type, "audio.play") == 0) {
    int track = 1;
    if (data["track"].is<int>()) {
      track = data["track"].as<int>();
    } else if (data["audioTrack"].is<int>()) {
      track = data["audioTrack"].as<int>();
    }
    playDfTrack(track);
    publishAck(cmdId, type, true, "DFPlayer play.");
  }

  else if (strcmp(type, "dfplayer.stop") == 0 ||
           strcmp(type, "audio.stop") == 0) {
    stopDfTrack();
    publishAck(cmdId, type, true, "DFPlayer stop.");
  }

  else if (strcmp(type, "threshold.set") == 0) {
    if (data["gasThreshold"].is<int>()) {
      GAS_THRESHOLD = data["gasThreshold"].as<int>();
    } else if (data["gas"].is<int>()) {
      GAS_THRESHOLD = data["gas"].as<int>();
    }

    if (data["tempThreshold"].is<float>() || data["tempThreshold"].is<int>()) {
      TEMP_THRESHOLD = data["tempThreshold"].as<float>();
    } else if (data["temperature"].is<float>() ||
               data["temperature"].is<int>()) {
      TEMP_THRESHOLD = data["temperature"].as<float>();
    }
    publishAck(cmdId, type, true, "Threshold updated.");
  }

  else if (strcmp(type, "led.effect") == 0) {
    const char *effect = data["effect"] | "idle";
    if (strcmp(effect, "off") == 0)
      setRgb(0, 0, 0);
    else if (strcmp(effect, "danger") == 0)
      setRgb(255, 0, 0);
    else if (strcmp(effect, "warning") == 0)
      setRgb(255, 120, 0);
    else if (strcmp(effect, "voice") == 0)
      setRgb(0, 0, 255);
    else
      setRgb(0, 60, 0);
    publishAck(cmdId, type, true, "RGB LED updated.");
  }

  else {
    publishAck(cmdId, type, false, "Unknown command type.");
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.println();
  Serial.print("[MQTT IN] Topic: ");
  Serial.println(topic);

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, payload, length);

  if (err) {
    Serial.print("[MQTT IN] JSON error: ");
    Serial.println(err.c_str());
    return;
  }

  String topicStr = String(topic);
  handleCommandJson(doc, topicStr);
}

// ==========================================================
// 12. SENSOR, TELEMETRY, WARNING, ALARM
// ==========================================================
void publishTelemetry(int gasRaw, float tempC, bool gasWarning,
                      bool tempWarning, bool pirDetected, bool obstacleNear) {
  StaticJsonDocument<1024> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = tempC;
  doc["temperatureC"] = tempC;
  doc["tempEnabled"] = tempEnabled;
  doc["tempWarning"] = tempWarning;
  doc["tempDetected"] = tempWarning;

  doc["gasEnabled"] = gasEnabled;
  doc["gasRaw"] = gasRaw;
  doc["gasDetected"] = gasWarning;

  doc["flameDetected"] = false;
  doc["pirDetected"] = pirDetected;
  doc["motion"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;
  doc["obstacle"] = obstacleNear;

  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  doc["bluetoothAudio"] = bluetoothAudioState;
  doc["ampRelay"] = bluetoothAudioState;
  doc["buzzerActive"] = digitalRead(BUZZER_PIN) == HIGH;

  doc["rtcReady"] = rtcReady;
  doc["lcdReady"] = lcdReady;
  doc["dfPlayerReady"] = dfPlayerReady;
  doc["voiceMode"] = voiceMode;

  doc["wifiRssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;

  // New system status fields
  doc["sleepModeEnabled"] = sleepModeEnabled;
  doc["pirEnabled"] = pirEnabled;
  doc["pirGreetingEnabled"] = pirGreetingEnabled;
  doc["pirGreetingTrack"] = pirGreetingTrack;

  char startStr[6];
  snprintf(startStr, sizeof(startStr), "%02d:%02d", pirGreetingStartHour,
           pirGreetingStartMinute);
  doc["pirGreetingStart"] = startStr;

  char endStr[6];
  snprintf(endStr, sizeof(endStr), "%02d:%02d", pirGreetingEndHour,
           pirGreetingEndMinute);
  doc["pirGreetingEnd"] = endStr;

  int totalTracks = 7; // Default dynamic fallback
  if (dfPlayerReady) {
    int count = dfPlayer.readFileCounts();
    if (count > 0)
      totalTracks = count;
  }
  doc["dfTrackCount"] = totalTracks;

  // Relay schedules list
  JsonArray schArr = doc.createNestedArray("relaySchedules");
  for (int i = 0; i < relayScheduleCount; i++) {
    JsonObject schObj = schArr.createNestedObject();
    schObj["id"] = relaySchedules[i].id;
    schObj["relay"] = relaySchedules[i].relayNum;
    schObj["enabled"] = relaySchedules[i].enabled;

    char timeStr[13];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d-%02d:%02d",
             relaySchedules[i].startHour, relaySchedules[i].startMinute,
             relaySchedules[i].endHour, relaySchedules[i].endMinute);
    schObj["timeRange"] = timeStr;
  }

  publishJson(topicTelemetry(), doc, false);
}

void sendTelemetryHttp(int gasRaw, float tempC, bool gasWarning,
                       bool tempWarning, bool pirDetected, bool obstacleNear) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP OUT] WiFi not connected, skipping HTTP telemetry.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Required for HTTPS on Vercel

  HTTPClient http;
  const char *serverName = "https://smartbox-asisten.vercel.app/api/telemetry";

  http.begin(client, serverName);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["gasEnabled"] = gasEnabled;
  doc["gasRaw"] = gasRaw;
  doc["gasDetected"] = gasWarning;
  doc["tempEnabled"] = tempEnabled;
  doc["temperatureC"] = tempC;
  doc["flameDetected"] = false;
  doc["pirDetected"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.print("[HTTP OUT] Sending telemetry to Vercel: ");
  Serial.println(requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP OUT] Response: %d - %s\n", httpResponseCode,
                  response.c_str());
  } else {
    Serial.printf("[HTTP OUT] Error sending POST: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

void checkWarnings(int gasRaw, float tempC, bool gasWarning, bool tempWarning) {
  if (gasWarning || tempWarning) {
    setBuzzer(true, false);
    setBluetoothAudio(true);
    setRgb(255, 80, 0);

    if (gasWarning && !lastGasWarning) {
      publishEvent("WARNING", "gas.detected",
                   "Peringatan asap/gas terdeteksi.");
      lastGasWarning = true;
      setRelay(1, true, false); // Automatically turn ON Relay 1 (exhaust/warning)
    }

    if (tempWarning && !lastTempWarning) {
      publishEvent("WARNING", "temperature.high",
                   "Peringatan suhu tinggi terdeteksi.");
      lastTempWarning = true;
      setRelay(2, true, false); // Automatically turn ON Relay 2 (cooling fan/AC)
    }

    if (millis() - lastWarningAudioAt > WARNING_AUDIO_GAP_MS) {
      if (gasWarning) {
        playDfTrack(4); // 0004_asap_terdeteksi.mp3 = peringatan gas/asap.
      } else if (tempWarning) {
        playDfTrack(5); // 0005_suhu_panas.mp3 = peringatan suhu tinggi.
      }
      lastWarningAudioAt = millis();
    }
  } else {
    if (!buzzerManual)
      setBuzzer(false, false);
    if (lastGasWarning || lastTempWarning) {
      publishEvent("INFO", "warning.normal", "Kondisi sensor kembali normal.");
      if (lastGasWarning) {
        setRelay(1, false, false); // Automatically turn OFF Relay 1
      }
      if (lastTempWarning) {
        setRelay(2, false, false); // Automatically turn OFF Relay 2
      }
    }
    lastGasWarning = false;
    lastTempWarning = false;
  }
}

void checkAlarms() {
  if (!rtcReady)
    return;

  DateTime now = rtc.now();

  for (int i = 0; i < 3; i++) {
    if (!alarmList[i].enabled)
      continue;

    if (now.hour() == alarmList[i].hour &&
        now.minute() == alarmList[i].minute &&
        alarmList[i].lastTriggeredDay != now.day()) {

      alarmList[i].lastTriggeredDay = now.day();

      char msg[96];
      snprintf(msg, sizeof(msg), "Alarm %s aktif pukul %02d:%02d.",
               alarmList[i].id, alarmList[i].hour, alarmList[i].minute);

      Serial.println(msg);
      publishEvent("INFO", "alarm.triggered", msg);

      setBluetoothAudio(true);
      setBuzzer(true, false);
      setRgb(0, 0, 255);
      playDfTrack(alarmList[i].track);
    }
  }
}

void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning,
               bool pirDetected) {
  if (!lcdReady)
    return;

  // Handle sleep mode (if backlight is off, don't draw anything)
  if (!lcdBacklightOn) {
    return;
  }

  if (millis() - lastLcdAt < LCD_INTERVAL_MS)
    return;
  lastLcdAt = millis();

  // Handle temporary overrides (like status messages from button press or BLE connect)
  if (millis() < lcdOverrideUntil) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(lcdOverrideLine1);
    lcd.setCursor(0, 1);
    lcd.print(lcdOverrideLine2);
    return;
  }

  lcd.clear();

  // Notification Hierarchy (If warnings or modes are active, we display them)
  if (gasWarning) {
    lcd.setCursor(0, 0);
    lcd.print("AWAS ADA ASAP/GAS");
    lcd.setCursor(0, 1);
    lcd.print("SEGERA PERIKSA!");
  }
  else if (tempWarning) {
    lcd.setCursor(0, 0);
    lcd.print("SUHU PANAS!");
    char tempStr[16];
    snprintf(tempStr, sizeof(tempStr), "SUHU: %0.1f C", tempC);
    lcd.setCursor(0, 1);
    lcd.print(tempStr);
  }
  else if (bluetoothAktif) {
    lcd.setCursor(0, 0);
    lcd.print("BLUETOOTH ACTIVE");
    lcd.setCursor(0, 1);
    lcd.print(deviceConnected ? "CONNECTED" : "WAITING FOR HP");
  }
  else if (relay1State || relay2State) {
    lcd.setCursor(0, 0);
    if (relay1State && relay2State) {
      lcd.print("SK 1 & SK 2 ON");
    } else if (relay1State) {
      lcd.print("STOP KONTAK 1 ON");
    } else {
      lcd.print("STOP KONTAK 2 ON");
    }
    lcd.setCursor(0, 1);
    lcd.print("TIMER ACTIVE");
  }
  else {
    // Base State: Show initial ready message
    lcd.setCursor(0, 0);
    lcd.print("SMARTBOX ASISTEN");
    lcd.setCursor(0, 1);
    lcd.print("SIAP DIAKTIFKAN");
  }
}

// ==========================================================
// 13. CLAP DETECTION
// ==========================================================
void checkClaps() {
  if (!voiceMode || !clapEnabled)
    return;

  size_t bytesRead = 0;
  esp_err_t err =
      i2s_read(MIC_I2S_PORT, sampleBuffer, sizeof(sampleBuffer), &bytesRead, 0);

  if (err != ESP_OK || bytesRead == 0)
    return;

  int numSamples = bytesRead / sizeof(int32_t);
  if (numSamples <= 0)
    return;

  long maxSample = 0;
  long sum = 0;

  for (int i = 0; i < numSamples; i++) {
    long val = abs(sampleBuffer[i] >> 14);
    sum += val;
    if (val > maxSample)
      maxSample = val;
  }

  long currentAvg = sum / numSamples;
  runningAverage = (runningAverage * 98 + currentAvg * 2) / 100;

  unsigned long now = millis();

  if (maxSample > (runningAverage * CLAP_THRESHOLD_FACTOR) &&
      maxSample > CLAP_MIN_VALUE && (now - lastClapTime > 180)) {

    lastClapTime = now;
    clapCount++;

    Serial.printf("[CLAP] Peak=%ld Avg=%ld Count=%d\n", maxSample,
                  runningAverage, clapCount);
  }

  if (clapCount > 0 && now - lastClapTime > 600) {
    if (clapCount == 1) {
      Serial.println("[CLAP] 1x -> OFF relay 1/2, LED, audio stop.");
      setRelay(1, false, false);
      setRelay(2, false, false);
      setRgb(0, 0, 0);
      stopDfTrack();
      playDfTrack(7); // sistem mati.
      publishEvent("INFO", "clap.single", "1 tepukan: sistem dimatikan.");
    } else {
      Serial.println("[CLAP] 2x atau lebih -> ON relay 1/2.");
      setRelay(1, true, false);
      setRelay(2, true, false);
      setRgb(0, 80, 0);
      playDfTrack(6); // sistem hidup.
      publishEvent("INFO", "clap.double", "2 tepukan: sistem dihidupkan.");
    }

    clapCount = 0;
  }
}

// ==========================================================
// 14. BUTTON HANDLER
// ==========================================================
void checkButtons() {
  static unsigned long lastButtonAt = 0;

  // States for Black Button
  static bool blackBtnWasHigh = true;
  static unsigned long blackBtnPressStart = 0;
  static bool blackBtnIsPressed = false;
  static bool blackBtnLongPressed = false;

  // Read Black Button (Active LOW)
  bool blackBtnState = (digitalRead(BLACK_BTN_PIN) == LOW);

  if (blackBtnState) {
    if (blackBtnWasHigh) {
      // Button just pressed
      blackBtnPressStart = millis();
      blackBtnIsPressed = true;
      blackBtnLongPressed = false;
      blackBtnWasHigh = false;
    } else if (blackBtnIsPressed && !blackBtnLongPressed &&
               (millis() - blackBtnPressStart >= 1000)) {
      // Long press detected (held for 1 second)
      blackBtnLongPressed = true;
      Serial.println("[BUTTON] Black Button HOLD -> Mulai Rekam Suara");

      // LCD Feedback
      setLcdOverride("REKAM SUARA...", "MENDENGARKAN...",
                     30000); // 30s max override

      // Audio Feedback (Track 8 - system hidup/listening)
      playDfTrack(8);

      // MQTT event
      publishEvent("INFO", "voice.record.start",
                   "Tombol hitam ditahan: Mulai merekam suara.");
    }
  } else {
    if (!blackBtnWasHigh) {
      // Button just released
      unsigned long duration = millis() - blackBtnPressStart;

      if (blackBtnIsPressed) {
        if (blackBtnLongPressed) {
          // Long press released
          Serial.println(
              "[BUTTON] Black Button RELEASE -> Selesai Rekam Suara");

          // Clear LCD override
          lcdOverrideUntil = 0;

          // Audio Feedback (Track 9 - system mati)
          playDfTrack(9);

          // MQTT event
          publishEvent("INFO", "voice.record.stop",
                       "Tombol hitam dilepas: Selesai merekam.");
        } else if (duration > 50) { // Debounce short press
          // Short press
          Serial.println(
              "[BUTTON] Black Button SHORT PRESS -> Tampilkan Jam/Suhu");

          if (rtcReady) {
            DateTime now = rtc.now();
            float tempC = rtc.getTemperature();
            char line1[17];
            char line2[17];
            snprintf(line1, sizeof(line1), "WAKTU: %02d:%02d:%02d", now.hour(),
                     now.minute(), now.second());
            snprintf(line2, sizeof(line2), "SUHU RTC: %4.1f C", tempC);
            setLcdOverride(line1, line2, 4000);
          } else {
            setLcdOverride("RTC TIDAK READY", "Suhu: -", 3000);
          }
          publishEvent("INFO", "button.black.short",
                       "Tombol hitam ditekan cepat: Tampilkan jam/suhu.");
        }
      }
      blackBtnIsPressed = false;
      blackBtnLongPressed = false;
      blackBtnWasHigh = true;
    }
  }

  // Read White Button (Active LOW) - Debounced
  static bool whiteBtnWasHigh = true;
  bool whiteBtnState = (digitalRead(WHITE_BTN_PIN) == LOW);

  if (whiteBtnState && whiteBtnWasHigh) {
    if (millis() - lastButtonAt > 300) {
      lastButtonAt = millis();
      whiteBtnWasHigh = false;

      Serial.println("[BUTTON] White Button Press -> Tampilkan Jadwal Alarm");

      char line1[17];
      char line2[17];
      snprintf(line1, sizeof(line1), "P:%02d:%02d S:%02d:%02d",
               alarmList[0].hour, alarmList[0].minute, alarmList[1].hour,
               alarmList[1].minute);
      snprintf(line2, sizeof(line2), "M:%02d:%02d Jadwal:%d", alarmList[2].hour,
               alarmList[2].minute, relayScheduleCount);

      setLcdOverride(line1, line2, 5000);

      publishEvent("INFO", "button.white",
                   "Tombol putih ditekan: Tampilkan jadwal alarm.");
    }
  } else if (!whiteBtnState) {
    whiteBtnWasHigh = true;
  }

  // Read Red Button (Active LOW) - Debounced (Toggles BLE)
  static bool redBtnWasHigh = true;
  bool redBtnState = (digitalRead(RED_BTN_PIN) == LOW);

  if (redBtnState && redBtnWasHigh) {
    if (millis() - lastButtonAt > 300) {
      lastButtonAt = millis();
      redBtnWasHigh = false;

      if (bluetoothAktif) {
        matikanBluetooth();
        publishEvent("INFO", "button.red",
                     "Tombol merah mematikan Bluetooth BLE.");
      } else {
        nyalakanBluetooth();
        publishEvent("INFO", "button.red",
                     "Tombol merah menyalakan Bluetooth BLE.");
      }
    }
  } else if (!redBtnState) {
    redBtnWasHigh = true;
  }
}

// ==========================================================
// 15. SETUP
// ==========================================================
void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println();
  Serial.println("====================================================");
  Serial.println(" SMARTBOX ASSISTANT ESP32-S3 INTEGRATED STARTING");
  Serial.println("====================================================");

  // Load Settings and Schedules from NVS
  loadSettings();
  loadSchedules();

  // Output pin
  pinMode(RELAY_1_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(RELAY_2_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(BT_BASE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(RELAY_1_PIN, RELAY_OFF);
  digitalWrite(RELAY_2_PIN, RELAY_OFF);
  digitalWrite(BT_BASE_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Input pin
  pinMode(MQ2_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(IR_PIN, INPUT);

  pinMode(BLACK_BTN_PIN, INPUT_PULLUP);
  pinMode(WHITE_BTN_PIN, INPUT_PULLUP);
  pinMode(RED_BTN_PIN, INPUT_PULLUP);

  // RGB LED
  rgbLed.begin();
  rgbLed.setBrightness(45);
  rgbLed.show();
  setRgb(0, 0, 40);

  // I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  // LCD
  lcd.init();
  lcd.backlight();
  lcdReady = true;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SMARTBOX ASISTEN");
  lcd.setCursor(0, 1);
  lcd.print("SIAP DIAKTIFKAN");

  // RTC DS3231
  if (!rtc.begin()) {
    Serial.println("[RTC] DS3231 tidak terdeteksi. Cek SDA/SCL/VCC/GND.");
    rtcReady = false;
    if (lcdReady) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("RTC ERROR");
    }
  } else {
    Serial.println("[RTC] DS3231 terdeteksi.");
    rtcReady = true;

    if (rtc.lostPower()) {
      Serial.println("[RTC] Lost power, set waktu dari compile time.");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  }

  // DFPlayer
  dfSerial.begin(9600, SERIAL_8N1, ESP_RX_PIN, ESP_TX_PIN);
  delay(1000);

  if (!dfPlayer.begin(dfSerial, false, false)) {
    Serial.println("[DFPLAYER] Tidak terdeteksi, program tetap jalan.");
    dfPlayerReady = false;
  } else {
    Serial.println("[DFPLAYER] Siap.");
    dfPlayerReady = true;
    dfPlayer.volume(24); // 0-30.
  }

  // Microphone
  setupMicI2S();

#if ENABLE_PT8211_TEST
  setupPT8211();
#endif

  // WiFi & MQTT
  connectWiFi();

  secureClient.setInsecure(); // Praktis untuk testing TLS. Produksi lebih aman
                              // pakai CA certificate.
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);

  if (lcdReady) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SMARTBOX ASISTEN");
    lcd.setCursor(0, 1);
    lcd.print("SIAP DIAKTIFKAN");
  }

  systemBooting = false;
  publishEvent("INFO", "device.boot", "SmartBox boot selesai.");
  nyalakanBluetooth();
}

// ==========================================================
// 16. LOOP
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  connectMqtt();
  mqttClient.loop();

  // BLE & System checks
  cekTimerBluetooth();
  prosesDataBluetooth();
  checkRelaySchedules();
  checkSleepMode();

  checkClaps();
  checkButtons();
  checkAlarms();

  int gasRaw = analogRead(MQ2_PIN);
  float tempC = rtcReady ? rtc.getTemperature() : 0.0;

  bool gasWarning = gasEnabled && gasRaw >= GAS_THRESHOLD;
  bool tempWarning = tempEnabled && rtcReady && tempC >= TEMP_THRESHOLD;

  bool pirHardwareState = (digitalRead(PIR_PIN) == HIGH);
  bool pirDetected = pirEnabled && pirHardwareState;
  bool obstacleNear = digitalRead(IR_PIN) == LOW;

  // Handle PIR movement events
  if (pirDetected) {
    wakeUpFromSleep();

    // Otomatis nyalakan lampu (Relay 1)
    if (!relay1State) {
      setRelay(1, true, false); // Turn on Relay 1 (Light) without playing relay audio track to avoid overlapping with greeting
      Serial.println("[PIR] Motion detected, automatically turned ON Relay 1 (Light)");
      publishEvent("INFO", "pir.light.on", "Gerakan terdeteksi: Lampu (Relay 1) dinyalakan.");
    }

    if (pirGreetingEnabled && isPirGreetingScheduled()) {
      if (millis() - lastPirGreetingTime >= PIR_GREETING_COOLDOWN) {
        lastPirGreetingTime = millis();
        Serial.printf("[PIR GREETING] Triggered, playing track %d\n",
                      pirGreetingTrack);
        playDfTrack(pirGreetingTrack);
        publishEvent("INFO", "pir.greeting", "Greeting wake-up diputar.");
      }
    }
  }

  checkWarnings(gasRaw, tempC, gasWarning, tempWarning);
  updateLcd(gasRaw, tempC, gasWarning, tempWarning, pirDetected);

  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();
    publishTelemetry(gasRaw, tempC, gasWarning, tempWarning, pirDetected,
                     obstacleNear);
  }

  // Send HTTP Telemetry to Vercel every 15s, or instantly when a warning is
  // triggered
  static bool firstHttpSend = true;
  static bool lastHttpWarningState = false;
  bool currentHttpWarningState = gasWarning || tempWarning;
  if (firstHttpSend || (millis() - lastHttpTelemetryAt >= 15000) ||
      (currentHttpWarningState && !lastHttpWarningState)) {
    firstHttpSend = false;
    lastHttpTelemetryAt = millis();
    sendTelemetryHttp(gasRaw, tempC, gasWarning, tempWarning, pirDetected,
                      obstacleNear);
  }
  lastHttpWarningState = currentHttpWarningState;

  // Handle delayed Bluetooth connection song play
  if (pendingBluetoothSongPlay && millis() >= bluetoothSongPlayTime) {
    pendingBluetoothSongPlay = false;
    playDfTrack(1); // Play song (Track 1)
    Serial.println("[BLE] Playing song (Track 1) after connection announcement");
  }

  // Blink LED green if Bluetooth is active but not connected (and no warning is active)
  if (bluetoothAktif && !deviceConnected && !gasWarning && !tempWarning) {
    static unsigned long lastBlink = 0;
    static bool blinkState = false;
    if (millis() - lastBlink >= 500) {
      lastBlink = millis();
      blinkState = !blinkState;
      if (blinkState) {
        setRgb(0, 120, 0); // Blink Green
      } else {
        setRgb(0, 0, 0); // OFF
      }
    }
  }

  delay(10);
}
