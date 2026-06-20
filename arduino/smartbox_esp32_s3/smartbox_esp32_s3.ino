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
  0013.mp3 = bluetooth dimatikan
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
#include <LiquidCrystal_I2C.h>
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
#define TRACK_BLUETOOTH_OFF       13
#define TRACK_TEMP_HIGH_ALARM     14
#define DFPLAYER_MAX_TRACK        TRACK_TEMP_HIGH_ALARM

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

int smokeThreshold = 1260; // 21 PPM default
int gasThreshold   = 1380; // 23 PPM default
int resetThreshold = 1140; // 19 PPM default

int mq2Baseline = 1000;
int gasWarningThreshold = 1260;
int gasDangerThreshold = 1380;
float tempThreshold = 38.0;
float tempOffset = 0.0;
float gasRawFiltered = -1.0;

// ==========================================================
// 6. VOICE COOLDOWN
// ==========================================================
const unsigned long VOICE_MIN_GAP_MS = 2500;
unsigned long lastVoiceMillis = 0;
bool dfplayerBusy = false;
unsigned long dfplayerBusyUntil = 0;
uint8_t currentVoicePriority = 0;
uint8_t pendingVoiceTrack = 0;
uint8_t pendingVoicePriority = 0;
String pendingVoiceReason = "";

const unsigned long GAS_VOICE_COOLDOWN_MS  = 10000;
const unsigned long TEMP_VOICE_COOLDOWN_MS = 10000;
unsigned long PIR_GREETING_COOLDOWN = 10000;

unsigned long lastGasAudioTime  = 0;
unsigned long lastTempAudioTime = 0;
unsigned long lastPirEventTime  = 0;

// Audio recording variables and struct
struct __attribute__((packed)) WavHeader {
  char chunkId[4] = {'R', 'I', 'F', 'F'};
  uint32_t chunkSize;
  char format[4] = {'W', 'A', 'V', 'E'};
  char subchunk1Id[4] = {'f', 'm', 't', ' '};
  uint32_t subchunk1Size = 16;
  uint16_t audioFormat = 1; // PCM
  uint16_t numChannels = 1; // Mono
  uint32_t sampleRate = 16000;
  uint32_t byteRate = 16000 * 2;
  uint16_t blockAlign = 2;
  uint16_t bitsPerSample = 16;
  char subchunk2Id[4] = {'d', 'a', 't', 'a'};
  uint32_t subchunk2Size;
};

const size_t MAX_RECORD_TIME_SEC = 5;
const size_t RECORD_BUFFER_SIZE = MAX_RECORD_TIME_SEC * 16000 * 2; // 160,000 bytes
uint8_t *recordBuffer = NULL;
size_t recordBufferIdx = 0;
bool isRecording = false;
unsigned long recordingStartMillis = 0;

// AI Backend URL (Sesuaikan IP dengan IP laptop/PC Anda, contoh: http://192.168.1.10:3000)
// PENTING: Jangan gunakan localhost di ESP32
const char* AI_BACKEND_URL = "https://smartbox-asisten.vercel.app/api/gemini/chat-audio";

// Black Button Debounce & State Variables
const unsigned long BLACK_BUTTON_DEBOUNCE_MS = 50;
const unsigned long BLACK_BUTTON_LONG_PRESS_MS = 1500;

bool blackBtnLastReading = HIGH;
bool blackBtnStableState = HIGH;
unsigned long blackBtnLastChangeAt = 0;
unsigned long blackBtnPressedAt = 0;
bool blackLongPressHandled = false;

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
LiquidCrystal_I2C lcd(0x27, 16, 2); // Jika LCD tidak tampil, ganti 0x27 menjadi 0x3F
Adafruit_NeoPixel rgbLed(NUM_PIXELS, RGB_PIN, NEO_GRB + NEO_KHZ800);

HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;

// ==========================================================
// 9. STATE VARIABLES
// ==========================================================
bool rtcReady = false;
bool lcdReady = false;
bool dfPlayerReady = false;
bool systemReadyPlayed = false;

bool gasEnabled = true;
bool tempEnabled = true;
bool voiceMode = true;
bool buzzerManual = false;

bool relay1State = false;
bool relay2State = false;
bool relay1AutoOffActive = false;
unsigned long relay1AutoOffAt = 0;
bool relay2AutoOffActive = false;
unsigned long relay2AutoOffAt = 0;
bool bluetoothAudioState = false;
bool relay1ForcedByGas = false;
bool relay1ForcedByTemp = false;

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

const char* BLUETOOTH_DEVICE_NAME = "Smartbox Assistant";

BLEServer *pServer = NULL;
BLECharacteristic *txCharacteristic = NULL;
bool deviceConnected = false;
bool bluetoothAktif = false;
bool bleSudahDibuat = false;
String dataBluetooth = "";
unsigned long waktuBluetoothMulai = 0;
unsigned long durasiBluetooth = 0;
bool pendingBluetoothSongPlay = false;
unsigned long bluetoothSongPlayTime = 0;
bool bluetoothAudioOffAfterVoice = false;

Preferences preferences;

bool sleepModeEnabled = false;
bool pirEnabled = true;
bool pirGreetingEnabled = false;
int pirGreetingTrack = TRACK_GESTURE_WALK;
int pirGreetingStartHour = 7;
int pirGreetingStartMinute = 0;
int pirGreetingEndHour = 22;
int pirGreetingEndMinute = 0;
uint8_t pirGreetingDaysMask = 0x7F;
String pirGreetingPlayMode = "cooldown";

unsigned long lastMotionDetectedTime = 0;
unsigned long lastPirGreetingTime = 0;
bool lastPirDetectedState = false;
bool pirGreetingPirWasHigh = false;
bool pirGreetingPlayedThisWindow = false;

bool lcdBacklightOn = true;
unsigned long lcdOverrideUntil = 0;
char lcdOverrideLine1[17] = "";
char lcdOverrideLine2[17] = "";
bool systemBooting = true;

bool led12cEnabled = true;
unsigned long lastLedBlinkAt = 0;
unsigned long ledBlinkInterval = 1000;
bool ledState = false;

#define LED_ON  HIGH
#define LED_OFF LOW

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
int lastScheduledAlarmDay = -1;
int lastScheduledAlarmHour = -1;
int lastScheduledAlarmMinute = -1;
int lastScheduledAlarmTrack = -1;

// ==========================================================
// FORWARD DECLARATIONS
// ==========================================================
void printLcdLine(uint8_t row, const char *text);
void scanI2C();
void initLCD();
void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning, bool pirDetected);
void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs);
void setBluetoothAudio(bool state);
void playDfTrack(int track);
void playVoice(uint8_t track, const char* reason);
void serviceVoiceQueue();
void stopDfTrack();
void setRelay(uint8_t relayNumber, bool state, bool withVoice, bool publishStatus = true);
void checkRelayAutoOff();
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
void handleWhiteButtonQuickPress();
void sendRecordedAudio();
void updateRecording();
void checkPirGreeting();
int timeToMinutes(int hour, int minute);
bool isNowInTimeRange(int nowHour, int nowMinute, int startHour, int startMinute, int endHour, int endMinute);
bool parseTimeToHourMinute(const char* timeStr, int &hour, int &minute);
void checkRelaySchedules();
void checkBluetoothTimer();
void checkBlackButton();
void handleBlackButtonQuickPress();
void handleBlackButtonLongPress();
bool recordAudioWavToBuffer(uint8_t** wavData, size_t* wavSize, int seconds);
bool sendVoiceToAIBackend(uint8_t* wavData, size_t wavSize);
bool recordAndSendVoiceToAI();

void initLed12c();
void led12cOn();
void led12cOff();
void blinkLed12c(int times, int delayMs);
void updateLed12c(bool gasWarning, bool smokeWarning, bool pirDetected, bool wifiConnected, bool mqttConnected);
void playScheduledAlarm(int track, const char *timeStr);

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
  if (!mqttClient.connected()) {
    Serial.print("[MQTT] Publish gagal, belum connected. Topic: ");
    Serial.println(topic);
    return;
  }

  String payload;
  serializeJson(doc, payload);

  bool ok = mqttClient.publish(topic.c_str(), payload.c_str(), retained);

  Serial.print("[MQTT] Publish topic: ");
  Serial.println(topic);
  Serial.print("[MQTT] Payload: ");
  Serial.println(payload);
  Serial.print("[MQTT] Retained: ");
  Serial.println(retained ? "true" : "false");
  Serial.print("[MQTT] Publish result: ");
  Serial.println(ok ? "OK" : "FAILED");
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

int timeToMinutes(int hour, int minute) {
  return hour * 60 + minute;
}

bool isNowInTimeRange(int nowHour, int nowMinute, int startHour, int startMinute, int endHour, int endMinute) {
  int nowValue = timeToMinutes(nowHour, nowMinute);
  int startValue = timeToMinutes(startHour, startMinute);
  int endValue = timeToMinutes(endHour, endMinute);

  if (startValue <= endValue) {
    return nowValue >= startValue && nowValue <= endValue;
  }

  return nowValue >= startValue || nowValue <= endValue;
}

bool parseTimeToHourMinute(const char* timeStr, int &hour, int &minute) {
  if (timeStr == NULL || strlen(timeStr) != 5 || timeStr[2] != ':') {
    return false;
  }

  int parsedHour = -1;
  int parsedMinute = -1;
  if (sscanf(timeStr, "%2d:%2d", &parsedHour, &parsedMinute) != 2) {
    return false;
  }
  if (parsedHour < 0 || parsedHour > 23 || parsedMinute < 0 || parsedMinute > 59) {
    return false;
  }

  hour = parsedHour;
  minute = parsedMinute;
  return true;
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
  tempEnabled = preferences.getBool("tempEnabled", true);
  pirGreetingEnabled = preferences.getBool("pirGreetEn", false);
  pirGreetingTrack = preferences.getInt("pirGreetTrk", TRACK_GESTURE_WALK);
  pirGreetingStartHour = preferences.getInt("pirGreetSH", 7);
  pirGreetingStartMinute = preferences.getInt("pirGreetSM", 0);
  pirGreetingEndHour = preferences.getInt("pirGreetEH", 22);
  pirGreetingEndMinute = preferences.getInt("pirGreetEM", 0);
  PIR_GREETING_COOLDOWN = preferences.getULong("pirGreetCool", 10000);
  if (PIR_GREETING_COOLDOWN < 10000) PIR_GREETING_COOLDOWN = 10000;
  pirGreetingPlayMode = preferences.getString("pirGreetMode", "cooldown");
  pirGreetingDaysMask = preferences.getUChar("pirGreetDays", 0x7F);
  if (pirGreetingTrack < TRACK_GESTURE_WALK || pirGreetingTrack > TRACK_GESTURE_WAVE) {
    pirGreetingTrack = TRACK_GESTURE_WALK;
  }
  mq2Baseline = preferences.getInt("mq2Baseline", 1000);
  MQ2_BASELINE = mq2Baseline;
  SMOKE_THRESHOLD_OFFSET = preferences.getInt("smokeOffset", 250);
  GAS_THRESHOLD_OFFSET   = preferences.getInt("gasOffset", 400);
  RESET_THRESHOLD_OFFSET = preferences.getInt("resetOffset", 150);
  smokeThreshold = preferences.getInt("gasWarning", 1260);
  gasThreshold = preferences.getInt("gasDanger", 1380);
  tempThreshold = preferences.getFloat("tempThreshold", 38.0);
  tempOffset = preferences.getFloat("tempOffset", 0.0);
  preferences.end();
  Serial.println("[SETTINGS] Loaded settings from NVS.");
}

void saveSettings() {
  preferences.begin("settings", false);
  preferences.putBool("sleepMode", sleepModeEnabled);
  preferences.putBool("pirEnabled", pirEnabled);
  preferences.putBool("gasEnabled", gasEnabled);
  preferences.putBool("tempEnabled", tempEnabled);
  preferences.putBool("pirGreetEn", pirGreetingEnabled);
  preferences.putInt("pirGreetTrk", pirGreetingTrack);
  preferences.putInt("pirGreetSH", pirGreetingStartHour);
  preferences.putInt("pirGreetSM", pirGreetingStartMinute);
  preferences.putInt("pirGreetEH", pirGreetingEndHour);
  preferences.putInt("pirGreetEM", pirGreetingEndMinute);
  preferences.putULong("pirGreetCool", PIR_GREETING_COOLDOWN);
  preferences.putString("pirGreetMode", pirGreetingPlayMode);
  preferences.putUChar("pirGreetDays", pirGreetingDaysMask);
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

  BLEDevice::init(BLUETOOTH_DEVICE_NAME);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  txCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );

  txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *rxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE
  );

  rxCharacteristic->setCallbacks(new RxCallbacks());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  bleSudahDibuat = true;

  Serial.print("[BLE] Server dibuat. Nama: ");
  Serial.println(BLUETOOTH_DEVICE_NAME);
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
uint8_t getVoicePriority(const char* reason) {
  if (strstr(reason, "gas") != NULL || strstr(reason, "smoke") != NULL || strstr(reason, "temperature_warning") != NULL) return 6;
  if (strstr(reason, "alarm") != NULL) return 5;
  if (strstr(reason, "system_boot") != NULL) return 4;
  if (strstr(reason, "bluetooth") != NULL) return 3;
  if (strstr(reason, "pir") != NULL) return 2;
  return 1;
}

void startVoiceNow(uint8_t track, const char* reason, uint8_t priority) {
  bool audioEnabledTemporarily = false;
  if (!bluetoothAudioState) {
    setBluetoothAudio(true);
    delay(300);
    audioEnabledTemporarily = !bluetoothAktif;
  }

  Serial.print("[DFPLAYER] Play track: ");
  Serial.print(track);
  Serial.print(" reason: ");
  Serial.println(reason);

  dfPlayer.play(track);
  lastVoiceMillis = millis();
  dfplayerBusy = true;
  dfplayerBusyUntil = lastVoiceMillis + VOICE_MIN_GAP_MS;
  currentVoicePriority = priority;
  dfplayerStatusStr = "playing_" + String(track);
  publishVoicePlayedEvent(track, reason);

  if (audioEnabledTemporarily) {
    bluetoothAudioOffAfterVoice = true;
  }
}

void playVoice(uint8_t track, const char* reason) {
  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Tidak ready, suara batal diputar.");
    return;
  }
  if (track < 1 || track > DFPLAYER_MAX_TRACK) {
    Serial.printf("[DFPLAYER] Track di luar rentang 1-%d.\n", DFPLAYER_MAX_TRACK);
    return;
  }

  unsigned long now = millis();
  uint8_t priority = getVoicePriority(reason);

  if (dfplayerBusy || now - lastVoiceMillis < VOICE_MIN_GAP_MS) {
    if (pendingVoiceTrack == 0 || priority > pendingVoicePriority) {
      pendingVoiceTrack = track;
      pendingVoicePriority = priority;
      pendingVoiceReason = reason;
      Serial.println("[DFPLAYER] Suara masuk antrean prioritas.");
    } else {
      Serial.println("[DFPLAYER] Voice cooldown aktif, prioritas lebih rendah dilewati.");
    }
    return;
  }

  startVoiceNow(track, reason, priority);
}

void serviceVoiceQueue() {
  if (dfplayerBusy && millis() >= dfplayerBusyUntil) {
    dfplayerBusy = false;
    currentVoicePriority = 0;
  }

  if (!dfplayerBusy && pendingVoiceTrack > 0 && millis() - lastVoiceMillis >= VOICE_MIN_GAP_MS) {
    uint8_t track = pendingVoiceTrack;
    uint8_t priority = pendingVoicePriority;
    String reason = pendingVoiceReason;
    pendingVoiceTrack = 0;
    pendingVoicePriority = 0;
    pendingVoiceReason = "";
    startVoiceNow(track, reason.c_str(), priority);
  }

  if (!dfplayerBusy && pendingVoiceTrack == 0 && bluetoothAudioOffAfterVoice) {
    bluetoothAudioOffAfterVoice = false;
    setBluetoothAudio(false);
    setRgb(255, 0, 0);
    Serial.println("[BLE] Audio amplifier OFF setelah suara Bluetooth dimatikan selesai.");
  }
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
  if (systemReadyPlayed) {
    Serial.println("[DFPLAYER] Startup voice sudah diputar, permintaan ulang diabaikan.");
    return;
  }

  setLcdOverride("SMARTBOX READY", "SIAP DIGUNAKAN", 4000);

  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Startup voice gagal: DFPlayer belum ready.");
    setLcdOverride("DFPLAYER ERROR", "CEK RX TX SD", 4000);
    publishEvent("ERROR", "system.ready_audio_failed", "DFPlayer belum ready saat startup.");
    return;
  }

  systemReadyPlayed = true;
  playVoice(TRACK_STARTUP_READY, "system_boot");
  publishEvent("INFO", "system.ready", "Smartbox Assistant siap digunakan.");
}

void playTimeTemperatureVoice() {
  playVoice(TRACK_TIME_TEMP_REALTIME, "time_temp_display");
  if (rtcReady) {
    DateTime now = rtc.now();
    float tempC = rtc.getTemperature() + tempOffset;
    char line1[17];
    char line2[17];
    snprintf(line1, sizeof(line1), "WAKTU: %02d:%02d:%02d", now.hour(), now.minute(), now.second());
    snprintf(line2, sizeof(line2), "SUHU: %4.1f C", tempC);
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
  }
}

void playScheduledAlarm(int track, const char *timeStr) {
  if (track < 1 || track > DFPLAYER_MAX_TRACK) return;

  if (rtcReady) {
    DateTime now = rtc.now();
    if (lastScheduledAlarmDay == now.day() &&
        lastScheduledAlarmHour == now.hour() &&
        lastScheduledAlarmMinute == now.minute() &&
        lastScheduledAlarmTrack == track) {
      Serial.println("[ALARM] Trigger duplikat dalam menit yang sama dilewati.");
      return;
    }
    lastScheduledAlarmDay = now.day();
    lastScheduledAlarmHour = now.hour();
    lastScheduledAlarmMinute = now.minute();
    lastScheduledAlarmTrack = track;
  }

  char line2[17];
  snprintf(line2, sizeof(line2), "TRACK %04d", track);
  setLcdOverride("ALARM JADWAL", line2, 4000);
  playVoice((uint8_t)track, "alarm_schedule");

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "alarm.triggered";
  doc["message"] = "Alarm jadwal diputar";
  JsonObject payload = doc.createNestedObject("payload");
  payload["track"] = track;
  payload["time"] = timeStr;
  publishJson(topicEvent(), doc, false);
}

void playGasWarningVoice(String gasType) {
  unsigned long now = millis();
  if (lastGasAudioTime > 0 && now - lastGasAudioTime < GAS_VOICE_COOLDOWN_MS) return;
  lastGasAudioTime = now;
  int track = -1;
  const char* reason = "";
  
  // Alternate warning track to support MQ-2 non-differentiation request
  static bool alternateGasTrack = false;
  track = alternateGasTrack ? TRACK_GAS_DETECTED : TRACK_SMOKE_DETECTED;
  reason = alternateGasTrack ? "gas_detected" : "smoke_detected";
  alternateGasTrack = !alternateGasTrack;

  if (track != -1) {
    playVoice((uint8_t)track, reason);
  }
}

void playTemperatureWarningVoice() {
  unsigned long now = millis();
  if (now - lastTempAudioTime < TEMP_VOICE_COOLDOWN_MS) return;
  lastTempAudioTime = now;
  playVoice(TRACK_TEMP_HIGH_ALARM, "temperature_warning");
}

void playPirGreeting(String motionType) {
  int track = TRACK_GESTURE_WALK;
  const char* reason = "pir_walk";

  if (motionType == "jump") {
    track = TRACK_GESTURE_JUMP;
    reason = "pir_jump";
  } else if (motionType == "wave") {
    track = TRACK_GESTURE_WAVE;
    reason = "pir_wave";
  } else {
    track = TRACK_GESTURE_WALK;
    reason = "pir_walk";
  }

  playVoice((uint8_t)track, reason);
}

void handleWhiteButtonQuickPress() {
  Serial.println("[BUTTON] White button pressed - assistant intro");
  playVoice(TRACK_STARTUP_READY, "white_button_intro");
  setLcdOverride("SMARTBOX", "ASSISTANT SIAP", 3000);
  publishEvent("INFO", "assistant_intro", "Assistant memperkenalkan diri.");
}

void sendRecordedAudio() {
  if (recordBuffer == NULL || recordBufferIdx == 0) {
    Serial.println("[GEMINI] Tidak ada data audio untuk dikirim.");
    if (recordBuffer != NULL) {
      free(recordBuffer);
      recordBuffer = NULL;
    }
    return;
  }

  Serial.printf("[BUTTON] Black hold recording - sending %d bytes to Gemini backend...\n", recordBufferIdx);
  setLcdOverride("PROSES SUARA...", "MENGIRIM KE AI", 5000);

  // Setup WAV header
  WavHeader header;
  header.chunkSize = 36 + recordBufferIdx;
  header.subchunk2Size = recordBufferIdx;

  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  String serverUrl = "https://smartbox-asisten.vercel.app/api/gemini/chat-audio";
  
  if (http.begin(client, serverUrl)) {
    http.addHeader("Content-Type", "audio/mp3");
    
    uint8_t *payload = (uint8_t*)malloc(44 + recordBufferIdx);
    if (payload != NULL) {
      memcpy(payload, &header, 44);
      memcpy(payload + 44, recordBuffer, recordBufferIdx);
      
      Serial.println("[GEMINI] Audio request sent");
      int httpResponseCode = http.POST(payload, 44 + recordBufferIdx);
      
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.printf("[GEMINI] HTTP Response: %d\n", httpResponseCode);
        Serial.println(response);
        
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, response);
        if (!error && doc["success"]) {
          const char* aiText = doc["text"] | "Success";
          setLcdOverride("AI JAWABAN:", aiText, 5000);
        } else {
          setLcdOverride("AI ERROR", "GAGAL PARSE", 3000);
        }
      } else {
        Serial.printf("[GEMINI] HTTP Post failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
        setLcdOverride("KONEKSI ERROR", "KIRIM GAGAL", 3000);
      }
      free(payload);
    } else {
      Serial.println("[GEMINI] Gagal alokasi payload kirim.");
      setLcdOverride("MEMORI PENUH", "KIRIM GAGAL", 3000);
    }
    http.end();
  } else {
    Serial.println("[GEMINI] Gagal memulai koneksi HTTP.");
    setLcdOverride("HTTP ERROR", "KIRIM GAGAL", 3000);
  }

  free(recordBuffer);
  recordBuffer = NULL;
}

void updateRecording() {
  if (!isRecording) return;
  
  int32_t i2sSamples[64];
  size_t bytesRead = 0;
  esp_err_t err = i2s_read(MIC_I2S_PORT, i2sSamples, sizeof(i2sSamples), &bytesRead, 0);
  if (err == ESP_OK && bytesRead > 0) {
    size_t numSamples = bytesRead / 4;
    for (size_t i = 0; i < numSamples; i++) {
      if (recordBufferIdx + 2 <= RECORD_BUFFER_SIZE) {
        int16_t sample16 = (int16_t)(i2sSamples[i] >> 14);
        recordBuffer[recordBufferIdx++] = sample16 & 0xFF;
        recordBuffer[recordBufferIdx++] = (sample16 >> 8) & 0xFF;
      } else {
        isRecording = false;
        Serial.println("[BUTTON] Buffer recording penuh, kirim otomatis");
        sendRecordedAudio();
        break;
      }
    }
  }
  
  if (isRecording && (millis() - recordingStartMillis >= MAX_RECORD_TIME_SEC * 1000)) {
    isRecording = false;
    Serial.println("[BUTTON] Waktu recording habis, kirim otomatis");
    sendRecordedAudio();
  }
}

void checkPirGreeting() {
  if (!pirGreetingEnabled) return;
  if (!pirEnabled) return;
  if (!rtcReady) return;

  DateTime now = rtc.now();
  bool inTimeRange = isNowInTimeRange(
    now.hour(),
    now.minute(),
    pirGreetingStartHour,
    pirGreetingStartMinute,
    pirGreetingEndHour,
    pirGreetingEndMinute
  );

  bool dayActive = (pirGreetingDaysMask & (1 << now.dayOfTheWeek())) != 0;
  if (!inTimeRange || !dayActive) {
    pirGreetingPlayedThisWindow = false;
    pirGreetingPirWasHigh = digitalRead(PIR_PIN) == HIGH;
    return;
  }

  bool pirDetected = digitalRead(PIR_PIN) == HIGH;
  bool motionEdge = pirDetected && !pirGreetingPirWasHigh;
  pirGreetingPirWasHigh = pirDetected;
  if (!pirDetected) return;

  unsigned long currentMillis = millis();
  if (pirGreetingPlayMode == "once_schedule") {
    if (pirGreetingPlayedThisWindow) return;
  } else if (pirGreetingPlayMode == "once_motion") {
    if (!motionEdge) return;
  } else if (lastPirGreetingTime > 0 && currentMillis - lastPirGreetingTime < PIR_GREETING_COOLDOWN) {
    return;
  }

  if (dfplayerBusy && currentVoicePriority >= 6) {
    Serial.println("[PIR] Greeting ditunda karena suara bahaya aktif.");
    return;
  }

  lastPirGreetingTime = currentMillis;
  lastMotionDetectedTime = currentMillis;
  pirGreetingPlayedThisWindow = true;

  if (pirGreetingTrack < TRACK_GESTURE_WALK || pirGreetingTrack > TRACK_GESTURE_WAVE) {
    pirGreetingTrack = TRACK_GESTURE_WALK;
  }

  playVoice((uint8_t)pirGreetingTrack, "pir_greeting");
  setLcdOverride("GERAKAN", "TERDETEKSI", 4000);

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "pir.greeting.played";
  doc["message"] = "Greeting Wakeup PIR diputar karena gerakan terdeteksi.";
  JsonObject payload = doc.createNestedObject("payload");
  payload["track"] = pirGreetingTrack;
  payload["playMode"] = pirGreetingPlayMode;
  publishJson(topicEvent(), doc, false);
}

void handleRelayScheduleCommand(JsonObject data, const char *cmdId, const char *type) {
  const char *schId = data["id"] | "";
  if (strlen(schId) == 0) {
    publishAck(cmdId, type, false, "Missing schedule ID.");
    return;
  }

  int relayNum = data["relay"] | 1;
  const char *startStr = data["start"] | "00:00";
  const char *endStr = data["end"] | "00:00";
  bool enabled = data["enabled"] | true;

  int startHour = 0, startMinute = 0;
  int endHour = 0, endMinute = 0;
  sscanf(startStr, "%d:%d", &startHour, &startMinute);
  sscanf(endStr, "%d:%d", &endHour, &endMinute);

  int idx = -1;
  for (int i = 0; i < relayScheduleCount; i++) {
    if (strcmp(relaySchedules[i].id, schId) == 0) {
      idx = i;
      break;
    }
  }

  if (idx == -1) {
    if (relayScheduleCount >= MAX_RELAY_SCHEDULES) {
      publishAck(cmdId, type, false, "Schedules list full.");
      return;
    }
    idx = relayScheduleCount++;
  }

  strncpy(relaySchedules[idx].id, schId, 15);
  relaySchedules[idx].id[15] = '\0';
  relaySchedules[idx].startHour = startHour;
  relaySchedules[idx].startMinute = startMinute;
  relaySchedules[idx].endHour = endHour;
  relaySchedules[idx].endMinute = endMinute;
  relaySchedules[idx].relayNum = relayNum;
  relaySchedules[idx].enabled = enabled;
  relaySchedules[idx].lastTriggeredStartDay = -1;
  relaySchedules[idx].lastTriggeredEndDay = -1;

  saveSchedules();
  Serial.printf("[SCHEDULE] Set schedule %s: %02d:%02d to %02d:%02d for Relay %d (enabled=%d)\n",
                schId, startHour, startMinute, endHour, endMinute, relayNum, enabled);

  publishAck(cmdId, type, true, "Schedule saved.");
}

void deleteRelaySchedule(const char *schId) {
  int idx = -1;
  for (int i = 0; i < relayScheduleCount; i++) {
    if (strcmp(relaySchedules[i].id, schId) == 0) {
      idx = i;
      break;
    }
  }

  if (idx == -1) {
    Serial.printf("[SCHEDULE] Schedule %s not found for deletion.\n", schId);
    return;
  }

  for (int i = idx; i < relayScheduleCount - 1; i++) {
    relaySchedules[i] = relaySchedules[i + 1];
  }
  relayScheduleCount--;
  saveSchedules();
  Serial.printf("[SCHEDULE] Deleted schedule %s.\n", schId);
}

void checkRelaySchedules() {
  if (!rtcReady) return;
  DateTime now = rtc.now();

  for (int i = 0; i < relayScheduleCount; i++) {
    if (!relaySchedules[i].enabled) continue;

    // Check Start Time (Turn ON)
    if (now.hour() == relaySchedules[i].startHour && 
        now.minute() == relaySchedules[i].startMinute && 
        relaySchedules[i].lastTriggeredStartDay != now.day()) {
      
      relaySchedules[i].lastTriggeredStartDay = now.day();
      Serial.printf("[SCHEDULE] Trigger START for Relay %d (Schedule: %s)\n", 
                    relaySchedules[i].relayNum, relaySchedules[i].id);
      setRelay(relaySchedules[i].relayNum, true, false); // false = silent
    }

    // Check End Time (Turn OFF)
    if (now.hour() == relaySchedules[i].endHour && 
        now.minute() == relaySchedules[i].endMinute && 
        relaySchedules[i].lastTriggeredEndDay != now.day()) {
      
      relaySchedules[i].lastTriggeredEndDay = now.day();
      Serial.printf("[SCHEDULE] Trigger END for Relay %d (Schedule: %s)\n", 
                    relaySchedules[i].relayNum, relaySchedules[i].id);
      setRelay(relaySchedules[i].relayNum, false, false); // false = silent
    }
  }
}

void checkRelayAutoOff() {
  unsigned long now = millis();

  if (relay1AutoOffActive && (long)(now - relay1AutoOffAt) >= 0) {
    relay1AutoOffActive = false;
    Serial.println("[RELAY] Relay 1 OFF by auto-off");
    setRelay(1, false, false);
    setLcdOverride("STOP KONTAK 1", "KIPAS OFF", 3000);
    publishEvent("INFO", "relay1.auto_off", "Stop Kontak 1 otomatis mati setelah 1 menit.");
  }

  if (relay2AutoOffActive && (long)(now - relay2AutoOffAt) >= 0) {
    relay2AutoOffActive = false;
    Serial.println("[RELAY] Relay 2 OFF by auto-off");
    setRelay(2, false, false);
    setLcdOverride("STOP KONTAK 2", "CHARGER OFF", 3000);
    publishEvent("INFO", "relay2.auto_off", "Stop Kontak 2 otomatis mati setelah 1 menit.");
  }
}

void nyalakanBluetooth() {
  if (bluetoothAktif) return;

  bluetoothAudioOffAfterVoice = false;
  setupBluetooth();

  bluetoothAktif = true;
  deviceConnected = false;

  setBluetoothAudio(true);
  delay(300);

  setLcdOverride("BLUETOOTH", "DIAKTIFKAN", 4000);

  playVoice(TRACK_BLUETOOTH_ACTIVE, "bluetooth_active");

  waktuBluetoothMulai = millis();

  setRgb(0, 255, 0);

  publishEvent("INFO", "bluetooth.on", "Bluetooth Smartbox Assistant diaktifkan.");
}

void matikanBluetooth() {
  if (!bluetoothAktif) return;

  bluetoothAktif = false;
  deviceConnected = false;

  if (bleSudahDibuat) {
    BLEDevice::getAdvertising()->stop();
  }

  setBluetoothAudio(false);

  setRgb(255, 0, 0);

  setLcdOverride("BLUETOOTH", "DIMATIKAN", 4000);

  playVoice(TRACK_BLUETOOTH_OFF, "bluetooth_off");
  bluetoothAudioOffAfterVoice = true;

  publishEvent("INFO", "bluetooth.off", "Bluetooth Smartbox Assistant dimatikan.");
}

void checkBluetoothTimer() {
  if (!bluetoothAktif || durasiBluetooth == 0) return;

  if (millis() - waktuBluetoothMulai >= durasiBluetooth) {
    matikanBluetooth();
    setLcdOverride("BT OFF", "TIMER HABIS", 3000);
    Serial.println("[BLE] Bluetooth mati otomatis setelah timer selesai.");
    publishEvent("INFO", "bluetooth.auto_off", "Bluetooth mati otomatis setelah timer selesai.");
  }
}

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

// ==========================================================
// LCD I2C 16x2 FUNCTIONS
// ==========================================================
void printLcdLine(uint8_t row, const char *text) {
  if (!lcdReady) return;

  char buffer[17];
  snprintf(buffer, sizeof(buffer), "%-16.16s", text);

  lcd.setCursor(0, row);
  lcd.print(buffer);
}

void scanI2C() {
  Serial.println("[I2C] Scan alamat I2C...");
  byte count = 0;
  uint8_t foundAddr = 0x27; // default

  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("[I2C] Device ditemukan di alamat 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      count++;
      if (address == 0x27 || address == 0x3F) {
        foundAddr = address;
      }
    }
  }

  if (count == 0) {
    Serial.println("[I2C] Tidak ada device terdeteksi. Cek kabel SDA/SCL/VCC/GND.");
  } else {
    if (foundAddr == 0x3F) {
      lcd = LiquidCrystal_I2C(0x3F, 16, 2);
    }
  }
}

void initLCD() {
  Serial.println("[LCD] Init LCD...");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  delay(300);

  scanI2C();

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcdReady = true;
  lcdBacklightOn = true;

  printLcdLine(0, "SMARTBOX");
  printLcdLine(1, "LCD AKTIF");

  Serial.println("[LCD] LCD I2C aktif.");
}

void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs) {
  strncpy(lcdOverrideLine1, l1, 16);
  lcdOverrideLine1[16] = '\0';

  strncpy(lcdOverrideLine2, l2, 16);
  lcdOverrideLine2[16] = '\0';

  lcdOverrideUntil = millis() + durationMs;

  Serial.printf("[LCD] %s - %s\n", lcdOverrideLine1, lcdOverrideLine2);

  if (lcdReady) {
    printLcdLine(0, lcdOverrideLine1);
    printLcdLine(1, lcdOverrideLine2);
  }
}

void setBluetoothAudio(bool state) {
  bluetoothAudioState = state;
  digitalWrite(BT_BASE_PIN, state ? HIGH : LOW);
  if (state) setRgb(0, 80, 0); else setRgb(80, 0, 0);
  
  // Also send telemetry now to update status instantly
  sendTelemetryNow();
}

void playDfTrack(int track) {
  playVoice((uint8_t)track, "manual");
}

void stopDfTrack() {
  if (dfPlayerReady) {
    dfPlayer.stop();
    dfplayerBusy = false;
    currentVoicePriority = 0;
    pendingVoiceTrack = 0;
    pendingVoicePriority = 0;
    pendingVoiceReason = "";
    dfplayerStatusStr = "stopped";
  }
}

void setRelay(uint8_t relayNumber, bool state, bool withVoice, bool publishStatus) {
  if (relayNumber == 1) { relay1State = state; digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF); }
  if (relayNumber == 2) { relay2State = state; digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF); }
  Serial.printf("[RELAY] Relay %d %s\n", relayNumber, state ? "ON" : "OFF");

  if (relayNumber == 1) {
    setLcdOverride("STOP KONTAK 1", state ? "KIPAS ON" : "KIPAS OFF", 3000);
  } else if (relayNumber == 2) {
    setLcdOverride("STOP KONTAK 2", state ? "CHARGER ON" : "CHARGER OFF", 3000);
  }

  if (publishStatus) {
    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["level"] = "INFO";
    doc["type"] = "relay.updated";
    char msg[32];
    snprintf(msg, sizeof(msg), "Relay %d %s", relayNumber, state ? "ON" : "OFF");
    doc["message"] = msg;
    JsonObject payload = doc.createNestedObject("payload");
    payload["relay"] = relayNumber;
    payload["state"] = state;
    publishJson(topicEvent(), doc, false);
  }

  // Also send telemetry now to update status instantly
  sendTelemetryNow();
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
  StaticJsonDocument<256> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["millis"] = millis();

  publishJson(topicStatus(), doc, true);

  Serial.print("[MQTT] Publish status retained: ");
  Serial.println(online ? "ONLINE" : "OFFLINE");
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi belum connected, MQTT batal.");
    return;
  }

  if (mqttClient.connected()) {
    return;
  }

  if (millis() - lastMqttReconnectAt < MQTT_RETRY_GAP_MS) {
    return;
  }

  lastMqttReconnectAt = millis();

  Serial.println("[MQTT] Connecting to HiveMQ Cloud...");
  Serial.print("[MQTT] Host: ");
  Serial.println(MQTT_HOST);
  Serial.print("[MQTT] Port: ");
  Serial.println(MQTT_PORT);
  Serial.print("[MQTT] User: ");
  Serial.println(MQTT_USER);
  Serial.print("[MQTT] Status topic: ");
  Serial.println(topicStatus());

  String clientId = String("SmartBox-") + DEVICE_ID + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  String willPayload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"online\":false}";

  bool ok = mqttClient.connect(
    clientId.c_str(),
    MQTT_USER,
    MQTT_PASS,
    topicStatus().c_str(),
    1,
    true,
    willPayload.c_str()
  );

  if (ok) {
    Serial.println("[MQTT] Connected");

    mqttClient.subscribe(topicCommand().c_str());
    mqttClient.subscribe("smartbox/relay/set");
    mqttClient.subscribe("smartbox/buzzer/set");
    mqttClient.subscribe("smartbox/alarm/set");
    mqttClient.subscribe("smartbox/voice/mode");
    mqttClient.subscribe("smartbox/sensor/gas");
    mqttClient.subscribe("smartbox/sensor/temperature");

    publishOnlineStatus(true);
    sendTelemetryNow();

    publishEvent("INFO", "mqtt.connected", "ESP32 tersambung ke MQTT Cloud.");

    Serial.println("[MQTT] Device status sekarang ONLINE.");
  } else {
    Serial.print("[MQTT] Gagal connect. State = ");
    Serial.println(mqttClient.state());

    if (mqttClient.state() == -2) {
      Serial.println("[MQTT] State -2: gagal koneksi network/TLS/server.");
    } else if (mqttClient.state() == 5) {
      Serial.println("[MQTT] State 5: username/password MQTT salah.");
    } else if (mqttClient.state() == -4) {
      Serial.println("[MQTT] State -4: timeout koneksi MQTT.");
    }
  }
}

void handleRelayCommand(JsonObject data, const char *cmdId, const char *type) {
  bool state = data["state"] | false;
  int relayNumber = data["relay"] | 1;
  int autoOffSeconds = data["autoOffSeconds"] | 0;
  const char *source = data["source"] | "";

  if (state && autoOffSeconds == 0 && strcmp(source, "schedule") != 0) {
    autoOffSeconds = 60;
  }

  if (relayNumber < 1 || relayNumber > 2) {
    publishAck(cmdId, type, false, "Relay tidak valid.");
    Serial.printf("[RELAY] Relay %d tidak valid.\n", relayNumber);
    return;
  }

  setRelay(relayNumber, state, false, false);

  if (relayNumber == 1) {
    if (state && autoOffSeconds > 0) {
      relay1AutoOffActive = true;
      relay1AutoOffAt = millis() + (autoOffSeconds * 1000UL);
      Serial.printf("[RELAY] Relay 1 auto-off in %d seconds\n", autoOffSeconds);
      setLcdOverride("STOP KONTAK 1", "KIPAS ON 1 MENIT", 3000);
    } else {
      relay1AutoOffActive = false;
      if (!state) setLcdOverride("STOP KONTAK 1", "KIPAS OFF", 3000);
    }
  }

  if (relayNumber == 2) {
    if (state && autoOffSeconds > 0) {
      relay2AutoOffActive = true;
      relay2AutoOffAt = millis() + (autoOffSeconds * 1000UL);
      Serial.printf("[RELAY] Relay 2 auto-off in %d seconds\n", autoOffSeconds);
      setLcdOverride("STOP KONTAK 2", "CHARGER 1 MENIT", 3000);
    } else {
      relay2AutoOffActive = false;
      if (!state) setLcdOverride("STOP KONTAK 2", "CHARGER OFF", 3000);
    }
  }

  publishAck(cmdId, type, true, "Relay updated.");

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "relay.updated";
  doc["message"] = "Relay state updated";
  JsonObject payload = doc.createNestedObject("payload");
  payload["relay"] = relayNumber;
  payload["state"] = state;
  payload["autoOffSeconds"] = autoOffSeconds;
  payload["millis"] = millis();

  publishJson(topicEvent(), doc, false);
}

void handleAlarmCommand(JsonObject data, const char *cmdId, const char *type) {
  const char *alarmId = data["id"] | "morning";
  int track = data["track"] | TRACK_ALARM_MORNING;
  int hour = data["hour"] | 7;
  int minute = data["minute"] | 0;
  const char *timeStr = data["time"] | "";
  if (strlen(timeStr) > 0 && !parseTimeToHourMinute(timeStr, hour, minute)) {
    publishAck(cmdId, type, false, "Format waktu alarm harus HH:MM.");
    return;
  }
  bool enabled = data["enabled"] | true;
  int slot = data["slot"] | -1;
  if (slot < 0) {
    for (int i = 0; i < 3; i++) {
      if (strcmp(alarmList[i].id, alarmId) == 0) {
        slot = i;
        break;
      }
    }
  }
  if (slot < 0 || slot >= 3 || track < 1 || track > DFPLAYER_MAX_TRACK) {
    publishAck(cmdId, type, false, "Slot atau track alarm tidak valid.");
    return;
  }
  strncpy(alarmList[slot].id, alarmId, 15);
  alarmList[slot].id[15] = '\0';
  alarmList[slot].hour = hour; alarmList[slot].minute = minute;
  alarmList[slot].track = track; alarmList[slot].enabled = enabled;
  publishAck(cmdId, type, true, "Alarm updated.");
}

void handleCommandJson(JsonDocument &doc, const String &topic) {
  const char *cmdId = doc["id"] | "";
  const char *type = doc["type"] | "";
  JsonObject data = doc["payload"].as<JsonObject>();
  if (data.isNull()) data = doc.as<JsonObject>();

  // Detect type from topic if empty (for direct MQTT publishes)
  if (strlen(type) == 0) {
    if (topic.endsWith("/buzzer/set")) type = "buzzer.set";
    else if (topic.endsWith("/relay/set")) type = "relay.set";
    else if (topic.endsWith("/alarm/set")) type = "alarm.set";
  }

  Serial.printf("[CMD] %s received\n", type);

  if (strcmp(type, "relay.set") == 0) handleRelayCommand(data, cmdId, type);
  else if (strcmp(type, "gasSensor.set") == 0) {
    gasEnabled = data["enabled"] | true;
    lastGasWarning = false; lastSmokeWarning = false;
    saveSettings();
    publishAck(cmdId, type, true, "Sensor updated.");
  } else if (strcmp(type, "voice.play") == 0) {
    int track = data["track"] | -1;
    const char *reason = data["reason"] | "dashboard_voice_test";
    if (track >= 1 && track <= DFPLAYER_MAX_TRACK) {
      Serial.println("[CMD] voice.play received");
      Serial.printf("[DFPLAYER] Play track: %d reason: %s\n", track, reason);
      playVoice((uint8_t)track, reason);
      publishAck(cmdId, type, true, "DFPlayer play command received.");
    } else {
      publishAck(cmdId, type, false, "Track tidak valid.");
    }
  } else if (strcmp(type, "dfplayer.stop") == 0) {
    stopDfTrack();
    publishAck(cmdId, type, true, "DFPlayer dihentikan.");
  } else if (strcmp(type, "alarm.set") == 0) {
    handleAlarmCommand(data, cmdId, type);
  } else if (strcmp(type, "alarm.trigger") == 0) {
    int track = data["track"] | -1;
    const char *timeStr = data["time"] | "";
    if (track >= 1 && track <= 13) {
      playScheduledAlarm(track, timeStr);
      publishAck(cmdId, type, true, "Alarm jadwal dipicu.");
    } else {
      publishAck(cmdId, type, false, "Track alarm tidak valid.");
    }
  } else if (strcmp(type, "relaySchedule.set") == 0) {
    handleRelayScheduleCommand(data, cmdId, type);
  } else if (strcmp(type, "relaySchedule.delete") == 0) {
    const char *schId = data["id"] | "";
    if (strlen(schId) > 0) {
      deleteRelaySchedule(schId);
      publishAck(cmdId, type, true, "Schedule deleted.");
    } else {
      publishAck(cmdId, type, false, "Missing schedule ID.");
    }
  } else if (strcmp(type, "buzzer.set") == 0) {
    bool state = data["state"] | false;
    setBuzzer(state, true);
    publishAck(cmdId, type, true, state ? "Buzzer ON" : "Buzzer OFF");
    StaticJsonDocument<256> eventDoc;
    eventDoc["deviceId"] = DEVICE_ID;
    eventDoc["level"] = "INFO";
    eventDoc["type"] = "buzzer.updated";
    eventDoc["message"] = state ? "Buzzer dinyalakan" : "Buzzer dimatikan";
    JsonObject eventPayload = eventDoc.createNestedObject("payload");
    eventPayload["state"] = state;
    eventPayload["millis"] = millis();
    publishJson(topicEvent(), eventDoc, false);
  } else if (strcmp(type, "bluetooth.set") == 0) {
    bool state = data["state"] | false;
    int durationSeconds = data["durationSeconds"] | 0;

    if (state) {
      durasiBluetooth = durationSeconds > 0 ? durationSeconds * 1000UL : 0;
      nyalakanBluetooth();
      publishAck(cmdId, type, true, "Bluetooth diaktifkan.");
    } else {
      matikanBluetooth();
      publishAck(cmdId, type, true, "Bluetooth dimatikan.");
    }
  } else if (strcmp(type, "sensor.calibrate") == 0) {
    int samples = data["samples"] | 100;
    setLcdOverride("KALIBRASI SENSOR", "MOHON TUNGGU", 5000);
    calibrateMQ2(samples);
    publishAck(cmdId, type, true, "Sensor gas MQ-2 berhasil dikalibrasi.");
  } else if (strcmp(type, "gasThreshold.set") == 0) {
    int ppm = data["ppm"] | 21;
    smokeThreshold = ppm * 60;
    gasThreshold = (ppm + 2) * 60;
    resetThreshold = (ppm - 2) * 60;
    SMOKE_THRESHOLD_OFFSET = smokeThreshold - MQ2_BASELINE;
    GAS_THRESHOLD_OFFSET = gasThreshold - MQ2_BASELINE;
    RESET_THRESHOLD_OFFSET = resetThreshold - MQ2_BASELINE;
    saveSettings();
    publishAck(cmdId, type, true, "Gas threshold updated.");
    sendTelemetryNow();
  } else if (strcmp(type, "tempThreshold.set") == 0) {
    float threshold = data["threshold"] | 38.0;
    tempThreshold = threshold;
    saveSettings();
    publishAck(cmdId, type, true, "Temperature threshold updated.");
    sendTelemetryNow();
  } else if (strcmp(type, "temperatureSensor.set") == 0 || strcmp(type, "tempSensor.set") == 0) {
    tempEnabled = data["enabled"] | true;
    lastTempWarning = false;
    saveSettings();
    publishAck(cmdId, type, true, "Temperature sensor updated.");
  } else if (strcmp(type, "pirSensor.set") == 0) {
    pirEnabled = data["enabled"] | true;
    saveSettings();
    publishAck(cmdId, type, true, "PIR sensor updated.");
  } else if (strcmp(type, "pirGreeting.set") == 0) {
    pirGreetingEnabled = data["enabled"] | false;
    pirGreetingTrack = data["track"] | TRACK_GESTURE_WALK;
    if (pirGreetingTrack < TRACK_GESTURE_WALK || pirGreetingTrack > TRACK_GESTURE_WAVE) {
      pirGreetingTrack = TRACK_GESTURE_WALK;
    }

    const char* startTime = data["startTime"] | "07:00";
    const char* endTime = data["endTime"] | "22:00";
    int startHour = pirGreetingStartHour;
    int startMinute = pirGreetingStartMinute;
    int endHour = pirGreetingEndHour;
    int endMinute = pirGreetingEndMinute;
    if (!parseTimeToHourMinute(startTime, startHour, startMinute) ||
        !parseTimeToHourMinute(endTime, endHour, endMinute)) {
      publishAck(cmdId, type, false, "Format waktu PIR greeting harus HH:MM.");
      return;
    }
    pirGreetingStartHour = startHour;
    pirGreetingStartMinute = startMinute;
    pirGreetingEndHour = endHour;
    pirGreetingEndMinute = endMinute;

    int cooldownSeconds = data["cooldownSeconds"] | 10;
    if (cooldownSeconds < 10) cooldownSeconds = 10;
    PIR_GREETING_COOLDOWN = (unsigned long)cooldownSeconds * 1000UL;

    const char *playMode = data["playMode"] | "cooldown";
    if (strcmp(playMode, "once_schedule") != 0 && strcmp(playMode, "once_motion") != 0) {
      pirGreetingPlayMode = "cooldown";
    } else {
      pirGreetingPlayMode = playMode;
    }

    if (data["days"].is<JsonArray>()) {
      pirGreetingDaysMask = 0;
      JsonArray days = data["days"].as<JsonArray>();
      for (JsonVariant dayValue : days) {
        const char *day = dayValue.as<const char*>();
        if (strcmp(day, "sunday") == 0) pirGreetingDaysMask |= (1 << 0);
        else if (strcmp(day, "monday") == 0) pirGreetingDaysMask |= (1 << 1);
        else if (strcmp(day, "tuesday") == 0) pirGreetingDaysMask |= (1 << 2);
        else if (strcmp(day, "wednesday") == 0) pirGreetingDaysMask |= (1 << 3);
        else if (strcmp(day, "thursday") == 0) pirGreetingDaysMask |= (1 << 4);
        else if (strcmp(day, "friday") == 0) pirGreetingDaysMask |= (1 << 5);
        else if (strcmp(day, "saturday") == 0) pirGreetingDaysMask |= (1 << 6);
      }
    }

    pirGreetingPlayedThisWindow = false;
    lastPirGreetingTime = 0;
    saveSettings();

    char line2[17];
    if (pirGreetingEnabled) snprintf(line2, sizeof(line2), "ON TRACK %04d", pirGreetingTrack);
    else snprintf(line2, sizeof(line2), "OFF");
    setLcdOverride("PIR GREETING", line2, 3000);
    publishAck(cmdId, type, true, "PIR greeting updated.");
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
  doc["gasThresholdPpm"] = smokeThreshold / 60;
  doc["tempThreshold"] = tempThreshold;
  doc["pirDetected"] = pirDetected;
  doc["motionDetected"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;
  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  unsigned long nowMs = millis();
  unsigned long relay1RemainingMs =
    relay1AutoOffActive && (long)(relay1AutoOffAt - nowMs) > 0 ? relay1AutoOffAt - nowMs : 0;
  unsigned long relay2RemainingMs =
    relay2AutoOffActive && (long)(relay2AutoOffAt - nowMs) > 0 ? relay2AutoOffAt - nowMs : 0;
  doc["relay1AutoOffRemaining"] = relay1RemainingMs > 0 ? (relay1RemainingMs + 999UL) / 1000UL : 0;
  doc["relay2AutoOffRemaining"] = relay2RemainingMs > 0 ? (relay2RemainingMs + 999UL) / 1000UL : 0;
  doc["bluetoothRelay"] = bluetoothAktif;
  doc["bluetoothAudio"] = bluetoothAudioState;
  doc["buzzer"] = digitalRead(BUZZER_PIN) == HIGH;
  doc["rtcReady"] = rtcReady;
  doc["lcdReady"] = lcdReady;
  doc["dfPlayerReady"] = dfPlayerReady;
  doc["pirEnabled"] = pirEnabled;
  doc["pirGreetingEnabled"] = pirGreetingEnabled;
  doc["pirGreetingTrack"] = pirGreetingTrack;
  char pirStart[6];
  char pirEnd[6];
  snprintf(pirStart, sizeof(pirStart), "%02d:%02d", pirGreetingStartHour, pirGreetingStartMinute);
  snprintf(pirEnd, sizeof(pirEnd), "%02d:%02d", pirGreetingEndHour, pirGreetingEndMinute);
  doc["pirGreetingStart"] = pirStart;
  doc["pirGreetingEnd"] = pirEnd;
  if (rtcReady) doc["createdAt"] = getIsoTimestamp();
  else doc["createdAt"] = nullptr;
  publishJson(topicTelemetry(), doc, false);
}

void sendTelemetryNow() {
  int gas = getFilteredGas();
  float temp = rtcReady ? (rtc.getTemperature() + tempOffset) : 0.0;
  bool isGas = (gas >= gasThreshold);
  bool isSmoke = (gas >= smokeThreshold);
  String gasLevel = "normal";
  if (isGas) gasLevel = "gas";
  else if (isSmoke) gasLevel = "smoke";
  bool pir = pirEnabled && (digitalRead(PIR_PIN) == HIGH);
  bool obstacle = (digitalRead(IR_PIN) == HIGH);
  publishTelemetry(gas, temp, isGas || isSmoke, false, pir, gasLevel, obstacle);
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

void checkWarnings(int gasRaw, float tempC, bool anyGasWarning, bool tempWarning, bool pirDetected) {
  bool isGas = gasEnabled && gasRaw >= gasThreshold;
  bool isSmoke = gasEnabled && gasRaw >= smokeThreshold && gasRaw < gasThreshold;
  bool gasWarning = isGas || isSmoke;
  bool triggerBuzzer = (gasWarning && pirDetected) || (gasEnabled && gasRaw >= 1300);

  if (isGas) {
    setBluetoothAudio(true);
    setRgb(255, 0, 0);
    if (!relay1State) setRelay(1, true, false);
    relay1ForcedByGas = true;
    playGasWarningVoice("gas");

    if (!lastGasWarning) {
      lastGasWarning = true;
      lastSmokeWarning = false;
      gasStatusStr = "detected";
      smokeStatusStr = "normal";
      publishEvent("WARNING", "gas.detected", "Gas terdeteksi!");
      setLcdOverride("GAS TERDETEKSI", "SEGERA PERIKSA!", 5000);
    }
  } 
  else if (isSmoke) {
    setBluetoothAudio(true);
    setRgb(255, 80, 0);

    if (!lastSmokeWarning) {
      lastSmokeWarning = true;
      lastGasWarning = false;
      smokeStatusStr = "detected";
      gasStatusStr = "normal";
      playGasWarningVoice("smoke");
      publishEvent("WARNING", "smoke.detected", "Asap terdeteksi!");
      setLcdOverride("ASAP TERDETEKSI", "SEGERA PERIKSA!", 5000);
    }
  } 
  else {
    if (gasRaw < resetThreshold) {
      if (lastGasWarning || lastSmokeWarning) {
        publishEvent("INFO", "gas.cleared", "Kondisi gas/asap kembali normal.");
      }
      lastGasWarning = false;
      lastSmokeWarning = false;
      gasStatusStr = "normal";
      smokeStatusStr = "normal";
      if (relay1ForcedByGas) {
        if (!relay1ForcedByTemp) {
          setRelay(1, false, false);
        }
        relay1ForcedByGas = false;
      }
    }
  }

  // Handle buzzer state based on new rules
  if (triggerBuzzer) {
    setBuzzer(true, false);
  } else {
    if (gasRaw < resetThreshold || (!pirDetected && gasRaw < 1300)) {
      if (!buzzerManual) {
        setBuzzer(false, false);
      }
    }
  }

  if (tempWarning) {
    if (!relay1State) setRelay(1, true, false);
    relay1ForcedByTemp = true;
    if (!lastTempWarning) {
      lastTempWarning = true;
      playTemperatureWarningVoice();
      publishEvent("WARNING", "temperature.high", "Suhu terdeteksi melebihi ambang batas");
      setLcdOverride("SUHU TINGGI!", "CEK RUANGAN", 5000);
    }
  } else {
    if (lastTempWarning) {
      publishEvent("INFO", "temperature.normal", "Suhu ruangan kembali normal.");
    }
    lastTempWarning = false;
    if (relay1ForcedByTemp) {
      if (!relay1ForcedByGas) {
        setRelay(1, false, false);
      }
      relay1ForcedByTemp = false;
    }
  }
}

void checkAlarms() {
  if (!rtcReady) return;
  DateTime now = rtc.now();
  for (int i = 0; i < 3; i++) {
    if (alarmList[i].enabled && now.hour() == alarmList[i].hour && now.minute() == alarmList[i].minute && alarmList[i].lastTriggeredDay != now.day()) {
      alarmList[i].lastTriggeredDay = now.day();
      char timeStr[6];
      snprintf(timeStr, sizeof(timeStr), "%02d:%02d", alarmList[i].hour, alarmList[i].minute);
      playScheduledAlarm(alarmList[i].track, timeStr);
    }
  }
}

void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning, bool pirDetected) {
  if (!lcdReady || !lcdBacklightOn) return;
  if (millis() - lastLcdAt < LCD_INTERVAL_MS) return;

  lastLcdAt = millis();

  if (lcdOverrideUntil > millis()) {
    printLcdLine(0, lcdOverrideLine1);
    printLcdLine(1, lcdOverrideLine2);
    return;
  }

  char line1[17];
  char line2[17];

  if (gasWarning) {
    snprintf(line1, sizeof(line1), "GAS/ASAP ALERT");
    snprintf(line2, sizeof(line2), "MQ2:%d", gasRaw);
  } else if (tempWarning) {
    snprintf(line1, sizeof(line1), "SUHU TINGGI");
    snprintf(line2, sizeof(line2), "TEMP:%0.1fC", tempC);
  } else if (pirDetected) {
    snprintf(line1, sizeof(line1), "GERAKAN");
    snprintf(line2, sizeof(line2), "TERDETEKSI");
  } else {
    Serial.println("[LCD] Update status normal.");
    if (rtcReady) {
      DateTime now = rtc.now();
      snprintf(line1, sizeof(line1), "SMARTBOX %02d:%02d", now.hour(), now.minute());
      snprintf(line2, sizeof(line2), "G:%d T:%0.1fC", gasRaw, tempC);
    } else {
      snprintf(line1, sizeof(line1), "SMARTBOX READY");
      snprintf(line2, sizeof(line2), "MQ2:%d", gasRaw);
    }
  }

  printLcdLine(0, line1);
  printLcdLine(1, line2);
}

void checkClaps() {
  if (!voiceMode || !clapEnabled) return;
  size_t bytesRead = 0;
  i2s_read(MIC_I2S_PORT, sampleBuffer, sizeof(sampleBuffer), &bytesRead, 0);
  if (bytesRead > 0) {
    clapCount++; lastClapTime = millis();
  }
}

void checkBlackButton() {
  bool reading = digitalRead(BLACK_BTN_PIN);
  unsigned long now = millis();

  // Debounce logic
  if (reading != blackBtnLastReading) {
    blackBtnLastChangeAt = now;
  }
  blackBtnLastReading = reading;

  if (now - blackBtnLastChangeAt >= BLACK_BUTTON_DEBOUNCE_MS) {
    if (reading != blackBtnStableState) {
      blackBtnStableState = reading;

      if (blackBtnStableState == LOW) {
        blackBtnPressedAt = now;
        blackLongPressHandled = false;
        Serial.println("[BUTTON] Black button pressed down");
      } else {
        Serial.println("[BUTTON] Black button released");
        if (!blackLongPressHandled) {
          unsigned long pressDuration = now - blackBtnPressedAt;
          if (pressDuration < 800) {
            handleBlackButtonQuickPress();
          } else {
            Serial.printf("[BUTTON] Pressed for %d ms (not quick, not long enough, or already handled)\n", (int)pressDuration);
          }
        }
      }
    }
  }

  // Handle long press while button is still pressed down
  if (blackBtnStableState == LOW && !blackLongPressHandled) {
    if (now - blackBtnPressedAt >= BLACK_BUTTON_LONG_PRESS_MS) {
      blackLongPressHandled = true;
      handleBlackButtonLongPress();
    }
  }
}

void handleBlackButtonQuickPress() {
  Serial.println("[BUTTON] Black quick press - time/temp");

  playVoice(TRACK_TIME_TEMP_REALTIME, "black_button_time_temp");

  if (rtcReady) {
    DateTime now = rtc.now();
    float tempC = rtc.getTemperature() + tempOffset;

    char line1[17];
    char line2[17];

    snprintf(line1, sizeof(line1), "WAKTU %02d:%02d:%02d", now.hour(), now.minute(), now.second());
    snprintf(line2, sizeof(line2), "SUHU %4.1f C", tempC);

    setLcdOverride(line1, line2, 4000);
  } else {
    setLcdOverride("RTC ERROR", "CEK DS3231", 3000);
  }

  publishEvent("INFO", "button.black.quick", "Tombol hitam tekan cepat: tampil jam dan suhu.");
}

void handleBlackButtonLongPress() {
  Serial.println("[BUTTON] Black long press - AI voice question");

  setLcdOverride("AI MENDENGAR", "SILAKAN BICARA", 3000);
  publishEvent("INFO", "button.black.long", "Tombol hitam tahan: mode tanya AI.");

  bool ok = recordAndSendVoiceToAI();

  if (ok) {
    setLcdOverride("AI MENJAWAB", "CEK WEBSITE", 4000);
  } else {
    setLcdOverride("AI ERROR", "CEK KONEKSI", 4000);
  }
}

bool recordAudioWavToBuffer(uint8_t** wavData, size_t* wavSize, int seconds) {
  Serial.printf("[AI] Starting recording: %d seconds\n", seconds);
  
  size_t rawSize = 16000 * 2 * seconds;
  size_t totalSize = 44 + rawSize;
  
  uint8_t* buffer = NULL;
  if (psramFound()) {
    buffer = (uint8_t*)ps_malloc(totalSize);
    if (buffer == NULL) {
      Serial.println("[AI] Failed allocating with ps_malloc, trying malloc");
      buffer = (uint8_t*)malloc(totalSize);
    }
  } else {
    Serial.println("[AI] PSRAM tidak tersedia / buffer tidak cukup");
    buffer = (uint8_t*)malloc(totalSize);
  }
  
  if (buffer == NULL) {
    Serial.printf("[AI] Memory allocation failed for size %d\n", (int)totalSize);
    return false;
  }
  
  WavHeader header;
  header.chunkSize = 36 + rawSize;
  header.subchunk2Size = rawSize;
  memcpy(buffer, &header, 44);
  
  size_t bytesRecorded = 0;
  unsigned long startMillis = millis();
  unsigned long durationMs = seconds * 1000;
  
  int32_t i2sSamples[64];
  
  while (millis() - startMillis < durationMs) {
    size_t bytesRead = 0;
    esp_err_t err = i2s_read(MIC_I2S_PORT, i2sSamples, sizeof(i2sSamples), &bytesRead, 0);
    if (err == ESP_OK && bytesRead > 0) {
      size_t numSamples = bytesRead / 4;
      for (size_t i = 0; i < numSamples; i++) {
        if (bytesRecorded + 2 <= rawSize) {
          int16_t sample16 = (int16_t)(i2sSamples[i] >> 14);
          buffer[44 + bytesRecorded] = sample16 & 0xFF;
          buffer[44 + bytesRecorded + 1] = (sample16 >> 8) & 0xFF;
          bytesRecorded += 2;
        }
      }
    }
    yield();
  }
  
  Serial.printf("[AI] Recorded %d bytes of raw PCM audio (%d bytes total with WAV header)\n", (int)bytesRecorded, (int)(44 + bytesRecorded));
  
  *wavData = buffer;
  *wavSize = 44 + bytesRecorded;
  return true;
}

bool sendVoiceToAIBackend(uint8_t* wavData, size_t wavSize) {
  if (wavData == NULL || wavSize <= 44) {
    Serial.println("[AI] Invalid audio data to send.");
    return false;
  }

  Serial.println("[AI] Preparing WAV buffer...");
  Serial.printf("[AI] WAV size: %d bytes\n", (int)wavSize);
  Serial.printf("[AI] Sending to backend: %s\n", AI_BACKEND_URL);

  WiFiClientSecure clientSecure;
  WiFiClient clientHttp;
  HTTPClient http;
  
  bool isHttps = String(AI_BACKEND_URL).startsWith("https://");
  bool beginSuccess = false;
  
  if (isHttps) {
    clientSecure.setInsecure();
    beginSuccess = http.begin(clientSecure, AI_BACKEND_URL);
  } else {
    beginSuccess = http.begin(clientHttp, AI_BACKEND_URL);
  }

  if (!beginSuccess) {
    Serial.println("[AI] HTTP begin failed.");
    return false;
  }

  http.setTimeout(20000);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-source", "black_button_long_press");

  int httpCode = http.POST(wavData, wavSize);
  Serial.printf("[AI] HTTP code: %d\n", httpCode);

  bool success = false;
  if (httpCode == 200) {
    String response = http.getString();
    Serial.printf("[AI] Response: %s\n", response.c_str());
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);
    if (!error && doc["success"]) {
      success = true;
    } else {
      Serial.println("[AI] Response parse failed or success is false.");
    }
  } else {
    Serial.println("[AI] Connection failed");
    Serial.println("[AI] Backend URL salah / WiFi putus / HTTPS gagal");
    if (httpCode > 0) {
      String response = http.getString();
      Serial.println(response);
    }
  }

  http.end();
  return success;
}

bool recordAndSendVoiceToAI() {
  uint8_t* wavData = NULL;
  size_t wavSize = 0;
  int seconds = 4;
  
  bool success = recordAudioWavToBuffer(&wavData, &wavSize, seconds);
  
  if (!success) {
    seconds = 3;
    success = recordAudioWavToBuffer(&wavData, &wavSize, seconds);
  }
  
  if (!success) {
    Serial.println("[AI] Gagal merekam audio.");
    return false;
  }
  
  setLcdOverride("AI MEMPROSES", "MOHON TUNGGU", 3000);
  setLcdOverride("MENGIRIM AI", "KE SERVER", 3000);
  
  bool sent = sendVoiceToAIBackend(wavData, wavSize);
  
  if (wavData != NULL) {
    free(wavData);
  }
  
  return sent;
}

void checkButtons() {
  unsigned long now = millis();
  const unsigned long DEBOUNCE_DELAY_MS = 50;

  // 2. White Button Logic (Short: Assistant Intro)
  static unsigned long whiteBtnPressTime = 0;
  static bool whiteBtnWasPressed = false;
  bool whiteBtnState = (digitalRead(WHITE_BTN_PIN) == LOW);

  if (whiteBtnState) {
    if (!whiteBtnWasPressed) {
      whiteBtnWasPressed = true;
      whiteBtnPressTime = now;
    }
  } else {
    if (whiteBtnWasPressed) {
      unsigned long pressDuration = now - whiteBtnPressTime;
      whiteBtnWasPressed = false;
      if (pressDuration >= DEBOUNCE_DELAY_MS) {
        Serial.println("[BUTTON] White intro");
        handleWhiteButtonQuickPress();
      }
    }
  }

  // 3. Red Button Logic (Toggle BLE Bluetooth)
  static unsigned long redBtnPressTime = 0;
  static bool redBtnWasPressed = false;
  bool redBtnState = (digitalRead(RED_BTN_PIN) == LOW);

  if (redBtnState) {
    if (!redBtnWasPressed) {
      redBtnWasPressed = true;
      redBtnPressTime = now;
    }
  } else {
    if (redBtnWasPressed) {
      unsigned long pressDuration = now - redBtnPressTime;
      redBtnWasPressed = false;
      if (pressDuration >= DEBOUNCE_DELAY_MS) {
        Serial.println("[BUTTON] Red button pressed");
        if (bluetoothAktif) {
          matikanBluetooth();
        } else {
          nyalakanBluetooth();
        }
        publishEvent("INFO", "button.red", "Tombol merah ditekan.");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("========== SMARTBOX BOOT ==========");

  pinMode(RELAY_1_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(RELAY_2_PIN, OUTPUT_OPEN_DRAIN);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BT_BASE_PIN, OUTPUT);

  pinMode(BLACK_BTN_PIN, INPUT_PULLUP);
  pinMode(WHITE_BTN_PIN, INPUT_PULLUP);
  pinMode(RED_BTN_PIN, INPUT_PULLUP);

  pinMode(MQ2_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(IR_PIN, INPUT);

  digitalWrite(RELAY_1_PIN, RELAY_OFF);
  digitalWrite(RELAY_2_PIN, RELAY_OFF);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(BT_BASE_PIN, LOW);

  rgbLed.begin();
  rgbLed.clear();
  rgbLed.show();

  initLed12c();
  blinkLed12c(2, 200);

  initLCD();

  if (rtc.begin()) {
    rtcReady = true;
    Serial.println("[RTC] DS3231 terdeteksi.");
    printLcdLine(0, "RTC TERDETEKSI");
    printLcdLine(1, "DS3231 AKTIF");
  } else {
    rtcReady = false;
    Serial.println("[RTC] DS3231 tidak terdeteksi.");
    printLcdLine(0, "RTC ERROR");
    printLcdLine(1, "CEK KABEL I2C");
  }
  delay(1500);

  dfSerial.begin(9600, SERIAL_8N1, ESP_RX_PIN, ESP_TX_PIN);
  dfPlayerReady = dfPlayer.begin(dfSerial);

  if (dfPlayerReady) {
    dfPlayer.volume(30);
    dfPlayer.EQ(DFPLAYER_EQ_ROCK);
    dfplayerStatusStr = "ready";
    Serial.println("[DFPLAYER] Siap.");
    printLcdLine(0, "DFPLAYER");
    printLcdLine(1, "SIAP");
  } else {
    dfplayerStatusStr = "not_ready";
    Serial.println("[DFPLAYER] Gagal terdeteksi.");
    printLcdLine(0, "DFPLAYER ERROR");
    printLcdLine(1, "CEK RX TX SD");
  }
  delay(1500);

  setupMicI2S();

  secureClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(15);
  mqttClient.setBufferSize(2048);

  connectWiFi();
  connectMqtt();

  loadSettings();
  loadSchedules();
  calibrateMQ2(100);

  playSystemReady();

  Serial.println("========== SMARTBOX READY ==========");
}
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  connectMqtt();

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  checkButtons();
  checkBlackButton();
  // checkAlarms(); // Dinonaktifkan secara lokal agar tidak bentrok dengan alarm server Next.js (MQTT Worker)
  // checkRelaySchedules(); // Dinonaktifkan secara lokal agar tidak ada mismatch hari aktif, pemicuan sepenuhnya dikelola oleh MQTT Worker
  checkRelayAutoOff();
  checkBluetoothTimer();
  serviceVoiceQueue();

  // Force DS3231 temperature conversion to bypass default 64-second update interval
  static unsigned long lastTempConvAt = 0;
  if (rtcReady && (millis() - lastTempConvAt >= 2000)) {
    lastTempConvAt = millis();
    Wire.beginTransmission(0x68);
    Wire.write(0x0E);
    Wire.endTransmission(false);
    Wire.requestFrom(0x68, 1);
    if (Wire.available()) {
      uint8_t ctrl = Wire.read();
      if (!(ctrl & 0x20)) {
        Wire.beginTransmission(0x68);
        Wire.write(0x0E);
        Wire.write(ctrl | 0x20);
        Wire.endTransmission();
      }
    }
  }

  int gasRaw = getFilteredGas();
  float tempC = rtcReady ? rtc.getTemperature() + tempOffset : 0.0;

  bool isGas = gasEnabled && gasRaw >= gasThreshold;
  bool isSmoke = gasEnabled && gasRaw >= smokeThreshold && gasRaw < gasThreshold;
  bool gasWarning = isGas || isSmoke;
  bool tempWarning = tempEnabled && tempC >= tempThreshold;
  bool pirDetected = pirEnabled && digitalRead(PIR_PIN) == HIGH;

  if (pirDetected != lastPirDetectedState) {
    lastMotionDetectedTime = millis();
    Serial.printf("[PIR] State changed to: %s\n", pirDetected ? "HIGH" : "LOW");

    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["level"] = "INFO";
    doc["type"] = "pir.motion";
    doc["message"] = pirDetected ? "Gerakan terdeteksi oleh PIR" : "Tidak ada gerakan";
    JsonObject payload = doc.createNestedObject("payload");
    payload["pirDetected"] = pirDetected;
    publishJson(topicEvent(), doc, false);
  }
  lastPirDetectedState = pirDetected;

  checkWarnings(gasRaw, tempC, gasWarning, tempWarning, pirDetected);
  checkPirGreeting();

  updateLed12c(gasWarning, isSmoke, pirDetected, WiFi.status() == WL_CONNECTED, mqttClient.connected());
  updateLcd(gasRaw, tempC, gasWarning, tempWarning, pirDetected);

  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();

    String gasLevel = "normal";
    if (isGas) gasLevel = "gas";
    else if (isSmoke) gasLevel = "smoke";

    publishTelemetry(
      gasRaw,
      tempC,
      gasWarning,
      tempWarning,
      pirDetected,
      gasLevel,
      digitalRead(IR_PIN) == HIGH
    );
  }

  delay(10);
}
