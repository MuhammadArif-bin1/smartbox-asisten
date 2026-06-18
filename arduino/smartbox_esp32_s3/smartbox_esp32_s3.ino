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
  - Relay stop kontak 1 dan 2 (Low-Level Trigger)
  - Bluetooth/amplifier power via transistor GPIO14
  - DFPlayer Mini untuk suara alarm/peringatan
  - Buzzer
  - RGB LED bawaan ESP32-S3 GPIO48
  - INMP441 untuk KWS & Gemini (I2S_NUM_1)
  - PT8211 DAC untuk Gemini Response (I2S_NUM_0 via ESP8266Audio)
  - MQTT telemetry, event, ack, dan command

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
  0014.mp3 = Hallo Aero
  0015.mp3 = Perkenalkan, saya adalah Aero...
*/

#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <DFRobotDFPlayerMini.h>
#include <FS.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <RTClib.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <driver/i2s.h>

// ESP8266Audio Libraries
#include "AudioFileSourceLittleFS.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2S.h"

// Edge Impulse Library
#include <Smartbox_asistent_inferencing.h>

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

// ========================================================
// KAMUS PIN & PENGATURAN (ESP32-S3)
// ========================================================

// --------------------------------------------------------
// 1. Jalur Layar & Waktu (I2C Bus)
// --------------------------------------------------------
#define I2C_SDA 1 // Menuju pin SDA (LCD 16x2 & Modul RTC DS3231)
#define I2C_SCL 2 // Menuju pin SCL (LCD 16x2 & Modul RTC DS3231)

// --------------------------------------------------------
// 2. Jalur Mesin Suara (I2S & Serial)
// --------------------------------------------------------
// Mic INMP441 (Input Rekaman)
#define MIC_SCK 4 // SCK Mic INMP441
#define MIC_WS 5  // WS Mic INMP441
#define MIC_SD 6  // SD Mic INMP441 (Data Masuk)
#define MIC_I2S_PORT I2S_NUM_1

// DAC PT8211 (Output Putar Rekaman)
#define PT_BCLK 15 // BCK / BCLK DAC PT8211
#define PT_LRC 16  // WS / LRC DAC PT8211
#define PT_DOUT 17 // DIN / DOUT DAC PT8211 (Data Keluar)
#define PT_I2S_PORT I2S_NUM_0

// DFPlayer Mini (Output Efek Suara/MP3)
#define ESP_TX_PIN 18 // Menuju RX DFPlayer Mini (via resistor 1k Ohm)
#define ESP_RX_PIN 8  // Menuju TX DFPlayer Mini

// --------------------------------------------------------
// 3. Jalur Keamanan & Aktuator (Output)
// --------------------------------------------------------
#define RELAY_21 21 // Relay 1 (Utama / Kondisi Aman - Low Level Trigger)
#define RELAY_47                                                               \
  47 // Relay 2 (Darurat / Aktif saat ada gas - Low Level Trigger)
#define RELAY_1_PIN RELAY_21
#define RELAY_2_PIN RELAY_47
#define BUZZER_PIN 10 // Buzzer (Alarm peringatan gas MQ-2)
#define BT_BASE_PIN                                                            \
  14               // Kaki Base Transistor (TIP122/TIP31C untuk daya Bluetooth)
#define RGB_PIN 48 // LED RGB Internal (Tertanam di papan ESP32-S3)
#define NUM_PIXELS 1

// --------------------------------------------------------
// 4. Jalur Input Pengguna & Sensor
// --------------------------------------------------------
#define MQ2_PIN 3 // Sensor MQ-2 (Pin A0 / Analog Out pembacaan gas)
#define BLACK_BTN_PIN                                                          \
  7 // Tombol Hitam (Tekan Cepat = Jam/Suhu| Tahan = Rekam Suara lalu ai
    // menjawab sesuai user ucapkan) pada mic inmp441 merekam suara user, lalu
    // frontend next.js lalu kirim ke neon db lalu nanti ai akan membalas
    // printah suara user dengan menggunakan model pada gemini tts (text to
    // speech) dan sts (speak to speech)
#define WHITE_BTN_PIN 19 // Tombol Putih (Ditambahkan sesuai permintaan)
#define RED_BTN_PIN 20   // Tombol Merah (Tekan Cepat = Nyala/Mati Bluetooth)

#define PIR_PIN 9
#define IR_PIN 42
#define LED_12C_PIN 12

// ==========================================================
// 3. RELAY LOGIC
// ==========================================================
#define RELAY_ON LOW
#define RELAY_OFF HIGH

// ==========================================================
// 4. TRACK MAPPING DFPLAYER
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
#define TRACK_INTRO 15
#define DFPLAYER_MAX_TRACK TRACK_INTRO

#define TRACK_SYSTEM_READY TRACK_STARTUP_READY
#define TRACK_SHOW_TIME_TEMP TRACK_TIME_TEMP_REALTIME
#define TRACK_BT_GREETING TRACK_BLUETOOTH_ACTIVE
#define TRACK_ALARM_NOON TRACK_ALARM_AFTERNOON
#define TRACK_PIR_WALK TRACK_GESTURE_WALK
#define TRACK_PIR_JUMP TRACK_GESTURE_JUMP
#define TRACK_PIR_WAVE TRACK_GESTURE_WAVE

// ==========================================================
// 5. KALIBRASI MQ-2 - KONFIGURASI MANUAL
// ==========================================================
int MQ2_BASELINE = 0;
int SMOKE_THRESHOLD_OFFSET = 250;
int GAS_THRESHOLD_OFFSET = 400;
int RESET_THRESHOLD_OFFSET = 150;

int smokeThreshold = 1250;
int gasThreshold = 1400;
int resetThreshold = 1150;

int mq2Baseline = 1000;
int gasWarningThreshold = 1300;
int gasDangerThreshold = 1800;
float tempThreshold = 35.0;
float tempOffset = 0.0;
float gasRawFiltered = -1.0;

// ==========================================================
// 6. VOICE COOLDOWN & WARNING FLAGS
// ==========================================================
const unsigned long VOICE_MIN_GAP_MS = 2500;
unsigned long lastVoiceMillis = 0;
bool dfplayerBusy = false;
unsigned long dfplayerBusyUntil = 0;
uint8_t currentVoicePriority = 0;
uint8_t pendingVoiceTrack = 0;
uint8_t pendingVoicePriority = 0;
String pendingVoiceReason = "";

const unsigned long GAS_VOICE_COOLDOWN_MS = 10000;
const unsigned long TEMP_VOICE_COOLDOWN_MS = 10000;
unsigned long PIR_GREETING_COOLDOWN = 10000;

unsigned long lastGasAudioTime = 0;
unsigned long lastTempAudioTime = 0;
unsigned long lastPirEventTime = 0;

// Warning audio single play flags (Anti-stuttering)
bool isGasWarningPlayed = false;
bool isSmokeWarningPlayed = false;

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

const size_t RECORD_TIME_SEC = 4;
const size_t RECORD_BUFFER_SIZE = RECORD_TIME_SEC * 16000 * 2; // 128,000 bytes
uint8_t *recordBuffer = NULL;
size_t recordBufferIdx = 0;
unsigned long recordingStartMillis = 0;

// Next.js API URL (dynamic, updated via MQTT and stored in NVS)
String aiBackendUrl = "http://192.168.1.10:3000/api/gemini/chat-audio";
String aiResponseHost = "http://192.168.1.10:3000";

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

// Edge Impulse configuration
#define SAMPLE_RATE EI_CLASSIFIER_FREQUENCY
#define I2S_SHIFT 14
#define AUDIO_GAIN 2.0f
#define MIC_RMS_MIN 10.0f

#define SCORE_THRESHOLD_HALO 0.70f
#define SCORE_THRESHOLD_CALIBRATION 0.70f
#define SCORE_THRESHOLD_CLAP 0.70f
#define COMMAND_COOLDOWN_MS 2500

#ifndef EI_CLASSIFIER_SLICE_SIZE
#define EI_CLASSIFIER_SLICE_SIZE                                               \
  (EI_CLASSIFIER_RAW_SAMPLE_COUNT / EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW)
#endif

int16_t *audio_buffer = NULL;
unsigned long lastCommandTime = 0;
unsigned long lastDebugTime = 0;
const unsigned long DEBUG_INTERVAL_MS = 700;
bool smartboxAwake = false;

// ==========================================================
// I2S & MEMORY STATES (STATE MACHINE)
// ==========================================================
enum SystemState {
  STATE_KWS,         // Menjalankan Edge Impulse Keyword Spotting secara bawaan
  STATE_RECORDING,   // Merekam suara dari mic ke buffer PSRAM (KWS dihentikan
                     // sementara)
  STATE_SENDING,     // Mengunggah file WAV ke server Next.js (KWS dihentikan
                     // sementara)
  STATE_DOWNLOADING, // Mengunduh respon file MP3 ke LittleFS (KWS dihentikan
                     // sementara)
  STATE_PLAYING      // Memutar audio balasan Gemini via PT8211 (KWS dihentikan
                     // sementara)
};

SystemState systemState = STATE_KWS;
String aiResponseUrl = "";
bool isPlayingResponse = false;

// Pointers untuk ESP8266Audio
AudioFileSourceLittleFS *audioFile = nullptr;
AudioOutputI2S *audioOut = nullptr;
AudioGeneratorMP3 *audioMp3 = nullptr;

// ==========================================================
// 8. OBJECTS
// ==========================================================
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

RTC_DS3231 rtc;
LiquidCrystal_I2C *lcd = nullptr;
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
bool buzzerAutoWarningActive = false;

bool relay1State = false;
bool relay2State = false;
bool relay1AutoOffActive = false;
unsigned long relay1AutoOffAt = 0;
bool relay2AutoOffActive = false;
unsigned long relay2AutoOffAt = 0;
bool bluetoothAudioState = false;
bool relay1ForcedByGas = false;

bool lastGasWarning = false;
bool lastSmokeWarning = false;
bool lastTempWarning = false;

String gasStatusStr = "normal";
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

const char *BLUETOOTH_DEVICE_NAME = "Smartbox Assistant 003";

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

#define LED_ON HIGH
#define LED_OFF LOW

#define MAX_RELAY_SCHEDULES 5
#define RELAY_SCHEDULE_ALL_DAYS 0x7F
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
uint8_t relayScheduleDaysMask[MAX_RELAY_SCHEDULES];
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
uint8_t scanI2C();
void initLCD();
void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning,
               bool pirDetected);
void setLcdOverride(const char *l1, const char *l2, unsigned long durationMs);
void setBluetoothAudio(bool state);
void playDfTrack(int track);
void playVoice(uint8_t track, const char *reason);
void serviceVoiceQueue();
void stopDfTrack();
void setRelay(uint8_t relayNumber, bool state, bool withVoice,
              bool publishStatus = true);
void checkRelayAutoOff();
void setBuzzer(bool state, bool manualMode);
void handleRelayScheduleCommand(JsonObject data, const char *cmdId,
                                const char *type);
void deleteRelaySchedule(const char *schId);
void saveSettings();
void saveSchedules();
void calibrateMQ2(int samples);
void calibrateMQ2(); // Overload dummy kalibrasi
void toggleRelay1(); // Overload dummy toggle relay
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
void playScheduledAlarm(int track, const char *timeStr);
void playGasWarningVoice(String gasType);
void playTemperatureWarningVoice();
void playPirGreeting(String motionType);
void publishVoicePlayedEvent(int track, const char *source);
void handleWhiteButtonQuickPress();
void checkPirGreeting();
int timeToMinutes(int hour, int minute);
bool isNowInTimeRange(int nowHour, int nowMinute, int startHour,
                      int startMinute, int endHour, int endMinute);
bool parseTimeToHourMinute(const char *timeStr, int &hour, int &minute);
void checkRelaySchedules();
void checkBluetoothTimer();
void checkBlackButton();
void handleBlackButtonQuickPress();
void handleBlackButtonLongPress();

void initLed12c();
void led12cOn();
void led12cOff();
void blinkLed12c(int times, int delayMs);
void updateLed12c(bool gasWarning, bool smokeWarning, bool pirDetected,
                  bool wifiConnected, bool mqttConnected);

// State Machine Helpers
void handleSendingState();
void handleDownloadingState();
void handlePlayingState();

// Edge Impulse Get Data Callback
int microphone_audio_signal_get_data(size_t offset, size_t length,
                                     float *out_ptr);

// Dummy check claps untuk menghindari kompilasi error jika dipanggil
void checkClaps() {}

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

void publishJson(const String &topic, JsonDocument &doc,
                 bool retained = false) {
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

void publishBuzzerUpdated(bool state, const char *reason) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "buzzer.updated";
  doc["message"] =
      state ? "Buzzer dinyalakan otomatis" : "Buzzer dimatikan otomatis";
  doc["millis"] = millis();
  JsonObject payload = doc.createNestedObject("payload");
  payload["state"] = state;
  payload["reason"] = reason;
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
// 12. SERIAL DEBUG MQ-2 (LENGKAP)
// ==========================================================
void printMQ2Debug(int mq2Value) {
  Serial.println("---------- [MQ2 DEBUG] ----------");
  Serial.printf("MQ2 value      : %d\n", mq2Value);
  Serial.printf("Baseline       : %d\n", MQ2_BASELINE);
  Serial.printf("Smoke threshold: %d (baseline + %d)\n", smokeThreshold,
                SMOKE_THRESHOLD_OFFSET);
  Serial.printf("Gas threshold  : %d (baseline + %d)\n", gasThreshold,
                GAS_THRESHOLD_OFFSET);
  Serial.printf("Reset threshold: %d (baseline + %d)\n", resetThreshold,
                RESET_THRESHOLD_OFFSET);
  Serial.printf("Gas status     : %s\n", gasStatusStr.c_str());
  Serial.printf("Asap status    : %s\n", smokeStatusStr.c_str());
  Serial.printf("DFPlayer status: %s\n", dfplayerStatusStr.c_str());
  unsigned long gasCooldownLeft = 0;
  if (lastGasAudioTime > 0 &&
      millis() < lastGasAudioTime + GAS_VOICE_COOLDOWN_MS) {
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
  if (PIR_GREETING_COOLDOWN < 10000)
    PIR_GREETING_COOLDOWN = 10000;
  pirGreetingPlayMode = preferences.getString("pirGreetMode", "cooldown");
  pirGreetingDaysMask = preferences.getUChar("pirGreetDays", 0x7F);
  if (pirGreetingTrack < TRACK_GESTURE_WALK ||
      pirGreetingTrack > TRACK_GESTURE_WAVE) {
    pirGreetingTrack = TRACK_GESTURE_WALK;
  }
  mq2Baseline = preferences.getInt("mq2Baseline", 1000);
  MQ2_BASELINE = mq2Baseline;
  SMOKE_THRESHOLD_OFFSET = preferences.getInt("smokeOffset", 250);
  GAS_THRESHOLD_OFFSET = preferences.getInt("gasOffset", 400);
  RESET_THRESHOLD_OFFSET = preferences.getInt("resetOffset", 150);
  smokeThreshold = MQ2_BASELINE + SMOKE_THRESHOLD_OFFSET;
  gasThreshold = MQ2_BASELINE + GAS_THRESHOLD_OFFSET;
  resetThreshold = MQ2_BASELINE + RESET_THRESHOLD_OFFSET;
  gasWarningThreshold = smokeThreshold;
  gasDangerThreshold = gasThreshold;
  tempThreshold = preferences.getFloat("tempThreshold", 35.0);
  tempOffset = preferences.getFloat("tempOffset", 0.0);
  aiBackendUrl = preferences.getString("backendUrl", "http://192.168.1.10:3000/api/gemini/chat-audio");
  aiResponseHost = preferences.getString("responseHost", "http://192.168.1.10:3000");
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
  preferences.putString("backendUrl", aiBackendUrl);
  preferences.putString("responseHost", aiResponseHost);
  preferences.end();
  Serial.println("[SETTINGS] Saved settings to NVS.");
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
    char daysKey[16];
    snprintf(daysKey, sizeof(daysKey), "days_%d", i);
    relayScheduleDaysMask[i] =
        preferences.getUChar(daysKey, RELAY_SCHEDULE_ALL_DAYS);
    if (relayScheduleDaysMask[i] == 0)
      relayScheduleDaysMask[i] = RELAY_SCHEDULE_ALL_DAYS;
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
    char daysKey[16];
    snprintf(daysKey, sizeof(daysKey), "days_%d", i);
    preferences.putUChar(daysKey, relayScheduleDaysMask[i] == 0
                                      ? RELAY_SCHEDULE_ALL_DAYS
                                      : relayScheduleDaysMask[i]);
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
    if (value.length() > 0)
      dataBluetooth = value;
  }
};

void setupBluetooth() {
  if (bleSudahDibuat)
    return;

  BLEDevice::init(BLUETOOTH_DEVICE_NAME);

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

void updateLed12c(bool gasWarning, bool smokeWarning, bool pirDetected,
                  bool wifiConnected, bool mqttConnected) {
  if (!led12cEnabled)
    return;

  unsigned long now = millis();

  // 1. Peringatan Gas / Asap (Prioritas 1 - Berkedip Cepat)
  if (gasWarning || smokeWarning) {
    unsigned int fastBlinkInterval = 150;
    if (now - lastLedBlinkAt >= fastBlinkInterval) {
      lastLedBlinkAt = now;
      ledState = !ledState;
      digitalWrite(LED_12C_PIN, ledState ? LED_ON : LED_OFF);
    }
    return;
  }

  // 2. PIR Deteksi Gerakan (Prioritas 2 - Menyala Singkat dengan Cooldown)
  static unsigned long pirLedActiveUntil = 0;
  static unsigned long lastPirLedTriggerAt = 0;
  const unsigned long pirLedDuration = 1000;
  const unsigned long pirLedCooldown = 5000;

  if (pirDetected && (now - lastPirLedTriggerAt >= pirLedCooldown)) {
    lastPirLedTriggerAt = now;
    pirLedActiveUntil = now + pirLedDuration;
    digitalWrite(LED_12C_PIN, LED_ON);
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
  }

  // 3. Kondisi Normal (Berkedip Pelan sebagai indikator sistem hidup)
  unsigned int normalBlinkInterval = 2000;
  if (now - lastLedBlinkAt >= normalBlinkInterval) {
    lastLedBlinkAt = now;
    ledState = !ledState;
    digitalWrite(LED_12C_PIN, ledState ? LED_ON : LED_OFF);
  }
}

// ==========================================================
// VOICE / DFPLAYER FUNCTIONS
// ==========================================================
uint8_t getVoicePriority(const char *reason) {
  if (strstr(reason, "gas") != NULL || strstr(reason, "smoke") != NULL ||
      strstr(reason, "temperature_warning") != NULL)
    return 6;
  if (strstr(reason, "alarm") != NULL)
    return 5;
  if (strstr(reason, "system_boot") != NULL)
    return 4;
  if (strstr(reason, "bluetooth") != NULL)
    return 3;
  if (strstr(reason, "pir") != NULL)
    return 2;
  return 1;
}

void startVoiceNow(uint8_t track, const char *reason, uint8_t priority) {
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

  unsigned long duration = VOICE_MIN_GAP_MS;
  if (track == TRACK_HALO_AERO) {
    duration = 3500;
  } else if (track == TRACK_INTRO) {
    duration = 5500;
  }

  dfplayerBusyUntil = lastVoiceMillis + duration;
  currentVoicePriority = priority;
  dfplayerStatusStr = "playing_" + String(track);
  publishVoicePlayedEvent(track, reason);

  if (track == TRACK_HALO_AERO) {
    pendingVoiceTrack = TRACK_INTRO;
    pendingVoicePriority = priority;
    pendingVoiceReason = "intro_after_halo";
  }

  if (audioEnabledTemporarily && pendingVoiceTrack == 0) {
    bluetoothAudioOffAfterVoice = true;
  }
}

void playVoice(uint8_t track, const char *reason) {
  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Tidak ready, sapaan/peringatan batal diputar.");
    return;
  }
  if (track < 1 || track > DFPLAYER_MAX_TRACK) {
    Serial.printf("[DFPLAYER] Track di luar rentang 1-%d.\n",
                  DFPLAYER_MAX_TRACK);
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
      Serial.println(
          "[DFPLAYER] Voice cooldown aktif, prioritas lebih rendah dilewati.");
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

  if (!dfplayerBusy && pendingVoiceTrack > 0 &&
      millis() - lastVoiceMillis >= VOICE_MIN_GAP_MS) {
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
    Serial.println(
        "[BLE] Audio amplifier OFF setelah suara Bluetooth dimatikan selesai.");
  }
}

void playVoiceTrack(int track) { playVoice((uint8_t)track, "manual"); }

void publishVoicePlayedEvent(int track, const char *source) {
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
    Serial.println(
        "[DFPLAYER] Startup voice sudah diputar, permintaan ulang diabaikan.");
    return;
  }

  setLcdOverride("SMARTBOX", "SIAP DIGUNAKAN", 4000);

  if (!dfPlayerReady) {
    Serial.println("[DFPLAYER] Startup voice gagal: DFPlayer belum ready.");
    setLcdOverride("DFPLAYER ERROR", "CEK RX TX SD", 4000);
    publishEvent("ERROR", "system.ready_audio_failed",
                 "DFPlayer belum ready saat startup.");
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
    snprintf(line1, sizeof(line1), "WAKTU: %02d:%02d:%02d", now.hour(),
             now.minute(), now.second());
    snprintf(line2, sizeof(line2), "SUHU: %4.1f C", tempC);
    setLcdOverride(line1, line2, 4000);
  }
}

void playBluetoothGreeting() {
  setBluetoothAudio(true);
  delay(250);
  playVoice(TRACK_BLUETOOTH_ACTIVE, "bluetooth_on");
  publishEvent("INFO", "bluetooth.on",
               "Bluetooth/audio aktif dan sapaan diputar");
}

void playAlarmVoice(String alarmType) {
  int track = -1;
  if (alarmType == "morning")
    track = TRACK_ALARM_MORNING;
  else if (alarmType == "noon")
    track = TRACK_ALARM_AFTERNOON;
  else if (alarmType == "evening")
    track = TRACK_ALARM_EVENING;
  if (track != -1) {
    char reason[32];
    snprintf(reason, sizeof(reason), "alarm_%s", alarmType.c_str());
    playVoice((uint8_t)track, reason);
    publishEvent("INFO", ("alarm." + alarmType).c_str(),
                 ("Alarm " + alarmType + " aktif.").c_str());
  }
}

void playScheduledAlarm(int track, const char *timeStr) {
  if (track < 1 || track > DFPLAYER_MAX_TRACK)
    return;

  if (rtcReady) {
    DateTime now = rtc.now();
    if (lastScheduledAlarmDay == now.day() &&
        lastScheduledAlarmHour == now.hour() &&
        lastScheduledAlarmMinute == now.minute() &&
        lastScheduledAlarmTrack == track) {
      Serial.println(
          "[ALARM] Trigger duplikat dalam menit yang sama dilewati.");
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
  if (lastGasAudioTime > 0 && now - lastGasAudioTime < GAS_VOICE_COOLDOWN_MS)
    return;
  lastGasAudioTime = now;
  int track = -1;
  const char *reason = "";
  if (gasType == "gas") {
    track = TRACK_GAS_DETECTED;
    reason = "gas_detected";
  } else if (gasType == "smoke") {
    track = TRACK_SMOKE_DETECTED;
    reason = "smoke_detected";
  }
  if (track != -1) {
    playVoice((uint8_t)track, reason);
  }
}

void playTemperatureWarningVoice() {
  unsigned long now = millis();
  if (now - lastTempAudioTime < TEMP_VOICE_COOLDOWN_MS)
    return;
  lastTempAudioTime = now;
  playVoice(TRACK_TEMP_DETECTED, "temperature_warning");
}

void playPirGreeting(String motionType) {
  int track = TRACK_GESTURE_WALK;
  const char *reason = "pir_walk";

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
  Serial.println("[BUTTON] White button pressed - Aero self introduction");

  setLcdOverride("HALLO TUAN", "SAYA AERO", 10000);
  playVoice(TRACK_INTRO, "white_btn_intro");
  publishEvent("INFO", "button.white.quick",
               "Tombol putih tekan cepat: Aero memperkenalkan diri.");
}

void checkPirGreeting() {
  if (!pirEnabled)
    return;

  bool pirDetected = (digitalRead(PIR_PIN) == HIGH);
  if (!pirDetected)
    return;

  unsigned long currentMillis = millis();
  unsigned long cooldownMs = pirGreetingEnabled ? PIR_GREETING_COOLDOWN : 10000;
  if (cooldownMs < 10000)
    cooldownMs = 10000;
  if (lastPirGreetingTime > 0 &&
      (currentMillis - lastPirGreetingTime < cooldownMs)) {
    return;
  }

  lastPirGreetingTime = currentMillis;
  lastMotionDetectedTime = currentMillis;

  // Pilih track secara acak antara 10, 11, atau 12
  int selectedTrack =
      random(10, 13); // random(10, 13) menghasilkan 10, 11, atau 12

  if (selectedTrack == TRACK_GESTURE_WALK) {
    setLcdOverride("GERAKAN JALAN", "TERDETEKSI", 4000);
  } else if (selectedTrack == TRACK_GESTURE_JUMP) {
    setLcdOverride("GERAKAN LOMPAT", "TERDETEKSI", 4000);
  } else {
    setLcdOverride("GERAKAN LAMBAI", "TERDETEKSI", 4000);
  }

  playVoice((uint8_t)selectedTrack, "pir_greeting");

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "pir.greeting.played";
  doc["message"] = "Greeting Wakeup PIR diputar secara acak.";
  JsonObject payload = doc.createNestedObject("payload");
  payload["pirDetected"] = true;
  payload["track"] = selectedTrack;
  payload["cooldownSeconds"] = cooldownMs / 1000UL;
  publishJson(topicEvent(), doc, false);
}

uint8_t relayScheduleDayBit(const char *day) {
  if (day == NULL)
    return 0;
  if (strcmp(day, "sunday") == 0 || strcmp(day, "minggu") == 0 ||
      strcmp(day, "min") == 0)
    return (1 << 0);
  if (strcmp(day, "monday") == 0 || strcmp(day, "senin") == 0 ||
      strcmp(day, "sen") == 0)
    return (1 << 1);
  if (strcmp(day, "tuesday") == 0 || strcmp(day, "selasa") == 0 ||
      strcmp(day, "sel") == 0)
    return (1 << 2);
  if (strcmp(day, "wednesday") == 0 || strcmp(day, "rabu") == 0 ||
      strcmp(day, "rab") == 0)
    return (1 << 3);
  if (strcmp(day, "thursday") == 0 || strcmp(day, "kamis") == 0 ||
      strcmp(day, "kam") == 0)
    return (1 << 4);
  if (strcmp(day, "friday") == 0 || strcmp(day, "jumat") == 0 ||
      strcmp(day, "jum") == 0)
    return (1 << 5);
  if (strcmp(day, "saturday") == 0 || strcmp(day, "sabtu") == 0 ||
      strcmp(day, "sab") == 0)
    return (1 << 6);
  return 0;
}

uint8_t parseRelayScheduleDaysMask(JsonObject data) {
  if (data["daysMask"].is<int>()) {
    uint8_t mask =
        (uint8_t)(data["daysMask"].as<int>() & RELAY_SCHEDULE_ALL_DAYS);
    return mask == 0 ? RELAY_SCHEDULE_ALL_DAYS : mask;
  }

  if (data["days"].is<JsonArray>()) {
    uint8_t mask = 0;
    JsonArray days = data["days"].as<JsonArray>();
    for (JsonVariant dayValue : days) {
      mask |= relayScheduleDayBit(dayValue.as<const char *>());
    }
    return mask == 0 ? RELAY_SCHEDULE_ALL_DAYS : mask;
  }

  const char *daysText = data["days"] | "";
  if (strlen(daysText) > 0) {
    uint8_t mask = 0;
    if (strstr(daysText, "sunday") || strstr(daysText, "minggu") ||
        strstr(daysText, "min"))
      mask |= (1 << 0);
    if (strstr(daysText, "monday") || strstr(daysText, "senin") ||
        strstr(daysText, "sen"))
      mask |= (1 << 1);
    if (strstr(daysText, "tuesday") || strstr(daysText, "selasa") ||
        strstr(daysText, "sel"))
      mask |= (1 << 2);
    if (strstr(daysText, "wednesday") || strstr(daysText, "rabu") ||
        strstr(daysText, "rab"))
      mask |= (1 << 3);
    if (strstr(daysText, "thursday") || strstr(daysText, "kamis") ||
        strstr(daysText, "kam"))
      mask |= (1 << 4);
    if (strstr(daysText, "friday") || strstr(daysText, "jumat") ||
        strstr(daysText, "jum"))
      mask |= (1 << 5);
    if (strstr(daysText, "saturday") || strstr(daysText, "sabtu") ||
        strstr(daysText, "sab"))
      mask |= (1 << 6);
    return mask == 0 ? RELAY_SCHEDULE_ALL_DAYS : mask;
  }

  return RELAY_SCHEDULE_ALL_DAYS;
}

bool isRelayScheduleDayActive(uint8_t daysMask, DateTime now) {
  uint8_t mask = daysMask == 0 ? RELAY_SCHEDULE_ALL_DAYS : daysMask;
  return (mask & (1 << now.dayOfTheWeek())) != 0;
}

void handleRelayScheduleCommand(JsonObject data, const char *cmdId,
                                const char *type) {
  const char *schId = data["id"] | "";
  if (strlen(schId) == 0) {
    publishAck(cmdId, type, false, "Missing schedule ID.");
    return;
  }

  int relayNum = data["relay"] | (data["relayNumber"] | 1);
  const char *startStr = data["start"] | "";
  if (strlen(startStr) == 0)
    startStr = data["startTime"] | "00:00";
  const char *endStr = data["end"] | "";
  if (strlen(endStr) == 0)
    endStr = data["endTime"] | "00:00";
  bool enabled = data["enabled"] | true;
  uint8_t daysMask = parseRelayScheduleDaysMask(data);

  if (relayNum < 1 || relayNum > 2) {
    publishAck(cmdId, type, false, "Relay jadwal tidak valid.");
    return;
  }

  int startHour = 0, startMinute = 0;
  int endHour = 0, endMinute = 0;
  if (!parseTimeToHourMinute(startStr, startHour, startMinute) ||
      !parseTimeToHourMinute(endStr, endHour, endMinute)) {
    publishAck(cmdId, type, false, "Format waktu jadwal harus HH:MM.");
    return;
  }

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
  relayScheduleDaysMask[idx] = daysMask;

  saveSchedules();
  Serial.printf("[SCHEDULE] Set schedule %s: %02d:%02d to %02d:%02d for Relay "
                "%d (enabled=%d, daysMask=%u)\n",
                schId, startHour, startMinute, endHour, endMinute, relayNum,
                enabled, daysMask);

  publishAck(cmdId, type, true, "Schedule saved.");

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["level"] = "INFO";
  doc["type"] = "relay.schedule.saved";
  doc["message"] = "Jadwal otomatis stop kontak disimpan.";
  JsonObject payload = doc.createNestedObject("payload");
  payload["id"] = schId;
  payload["relay"] = relayNum;
  payload["start"] = startStr;
  payload["end"] = endStr;
  payload["enabled"] = enabled;
  payload["daysMask"] = daysMask;
  publishJson(topicEvent(), doc, false);

  if (rtcReady && enabled) {
    DateTime now = rtc.now();
    int nowValue = timeToMinutes(now.hour(), now.minute());
    int startValue = timeToMinutes(startHour, startMinute);
    int endValue = timeToMinutes(endHour, endMinute);
    bool insideActiveWindow =
        startValue <= endValue
            ? (nowValue >= startValue && nowValue < endValue)
            : (nowValue >= startValue || nowValue < endValue);

    if (insideActiveWindow && isRelayScheduleDayActive(daysMask, now)) {
      relaySchedules[idx].lastTriggeredStartDay = now.day();
      if (relayNum == 1)
        relay1AutoOffActive = false;
      if (relayNum == 2)
        relay2AutoOffActive = false;
      setRelay(relayNum, true, false);
      setLcdOverride(relayNum == 1 ? "JADWAL KONTAK 1" : "JADWAL KONTAK 2",
                     "MENYALA", 3000);
      publishEvent("INFO", "relay.schedule.synced",
                   "Jadwal aktif sekarang, stop kontak langsung menyala.");
    }
  }
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
    relayScheduleDaysMask[i] = relayScheduleDaysMask[i + 1];
  }
  relayScheduleCount--;
  if (relayScheduleCount >= 0 && relayScheduleCount < MAX_RELAY_SCHEDULES) {
    relayScheduleDaysMask[relayScheduleCount] = RELAY_SCHEDULE_ALL_DAYS;
  }
  saveSchedules();
  Serial.printf("[SCHEDULE] Deleted schedule %s.\n", schId);
}

void checkRelaySchedules() {
  if (!rtcReady)
    return;
  DateTime now = rtc.now();

  for (int i = 0; i < relayScheduleCount; i++) {
    if (!relaySchedules[i].enabled)
      continue;
    if (!isRelayScheduleDayActive(relayScheduleDaysMask[i], now))
      continue;

    // Check Start Time (Turn ON)
    if (now.hour() == relaySchedules[i].startHour &&
        now.minute() == relaySchedules[i].startMinute &&
        relaySchedules[i].lastTriggeredStartDay != now.day()) {

      relaySchedules[i].lastTriggeredStartDay = now.day();
      Serial.printf("[SCHEDULE] Trigger START for Relay %d (Schedule: %s)\n",
                    relaySchedules[i].relayNum, relaySchedules[i].id);
      if (relaySchedules[i].relayNum == 1)
        relay1AutoOffActive = false;
      if (relaySchedules[i].relayNum == 2)
        relay2AutoOffActive = false;
      setRelay(relaySchedules[i].relayNum, true, false);
      setLcdOverride(relaySchedules[i].relayNum == 1 ? "JADWAL KONTAK 1"
                                                     : "JADWAL KONTAK 2",
                     "MENYALA", 3000);

      StaticJsonDocument<384> doc;
      doc["deviceId"] = DEVICE_ID;
      doc["level"] = "INFO";
      doc["type"] = "relay.schedule.on";
      doc["message"] = "Jadwal otomatis menyalakan stop kontak.";
      JsonObject payload = doc.createNestedObject("payload");
      payload["id"] = relaySchedules[i].id;
      payload["relay"] = relaySchedules[i].relayNum;
      payload["state"] = true;
      payload["hour"] = now.hour();
      payload["minute"] = now.minute();
      publishJson(topicEvent(), doc, false);
    }

    // Check End Time (Turn OFF)
    if (now.hour() == relaySchedules[i].endHour &&
        now.minute() == relaySchedules[i].endMinute &&
        relaySchedules[i].lastTriggeredEndDay != now.day()) {

      relaySchedules[i].lastTriggeredEndDay = now.day();
      Serial.printf("[SCHEDULE] Trigger END for Relay %d (Schedule: %s)\n",
                    relaySchedules[i].relayNum, relaySchedules[i].id);
      if (relaySchedules[i].relayNum == 1)
        relay1AutoOffActive = false;
      if (relaySchedules[i].relayNum == 2)
        relay2AutoOffActive = false;
      setRelay(relaySchedules[i].relayNum, false, false);
      setLcdOverride(relaySchedules[i].relayNum == 1 ? "JADWAL KONTAK 1"
                                                     : "JADWAL KONTAK 2",
                     "MATI", 3000);

      StaticJsonDocument<384> doc;
      doc["deviceId"] = DEVICE_ID;
      doc["level"] = "INFO";
      doc["type"] = "relay.schedule.off";
      doc["message"] = "Jadwal otomatis mematikan stop kontak.";
      JsonObject payload = doc.createNestedObject("payload");
      payload["id"] = relaySchedules[i].id;
      payload["relay"] = relaySchedules[i].relayNum;
      payload["state"] = false;
      payload["hour"] = now.hour();
      payload["minute"] = now.minute();
      publishJson(topicEvent(), doc, false);
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
    publishEvent("INFO", "relay1.auto_off",
                 "Stop Kontak 1 otomatis mati setelah 1 menit.");
  }

  if (relay2AutoOffActive && (long)(now - relay2AutoOffAt) >= 0) {
    relay2AutoOffActive = false;
    Serial.println("[RELAY] Relay 2 OFF by auto-off");
    setRelay(2, false, false);
    setLcdOverride("STOP KONTAK 2", "CHARGER OFF", 3000);
    publishEvent("INFO", "relay2.auto_off",
                 "Stop Kontak 2 otomatis mati setelah 1 menit.");
  }
}

void nyalakanBluetooth() {
  if (bluetoothAktif)
    return;

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

  publishEvent("INFO", "bluetooth.on",
               "Bluetooth Smartbox Assistant diaktifkan.");
}

void matikanBluetooth() {
  if (!bluetoothAktif)
    return;

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

  publishEvent("INFO", "bluetooth.off",
               "Bluetooth Smartbox Assistant dimatikan.");
}

void checkBluetoothTimer() {
  if (!bluetoothAktif || durasiBluetooth == 0)
    return;

  if (millis() - waktuBluetoothMulai >= durasiBluetooth) {
    matikanBluetooth();
    setLcdOverride("BT OFF", "TIMER HABIS", 3000);
    Serial.println("[BLE] Bluetooth mati otomatis setelah timer selesai.");
    publishEvent("INFO", "bluetooth.auto_off",
                 "Bluetooth mati otomatis setelah timer selesai.");
  }
}

void prosesDataBluetooth() {
  if (dataBluetooth.length() == 0)
    return;
  dataBluetooth.trim();
  dataBluetooth.toLowerCase();
  if (dataBluetooth == "relay1 on") {
    setRelay(1, true, true);
    setLcdOverride("RELAY 1", "ON", 3000);
  } else if (dataBluetooth == "relay1 off") {
    setRelay(1, false, true);
    setLcdOverride("RELAY 1", "OFF", 3000);
  } else if (dataBluetooth == "relay2 on") {
    setRelay(2, true, true);
    setLcdOverride("RELAY 2", "ON", 3000);
  } else if (dataBluetooth == "relay2 off") {
    setRelay(2, false, true);
    setLcdOverride("RELAY 2", "OFF", 3000);
  } else if (dataBluetooth == "status") {
    int gasRaw = analogRead(MQ2_PIN);
    float tempC = rtcReady ? rtc.getTemperature() : 0.0;
    char statusBuf[64];
    snprintf(statusBuf, sizeof(statusBuf), "MQ2: %d, Temp: %0.1fC", gasRaw,
             tempC);
    setLcdOverride("STATUS SMARTBOX", statusBuf, 3000);
  } else if (dataBluetooth == "bt on") {
    nyalakanBluetooth();
  } else if (dataBluetooth == "bt off") {
    matikanBluetooth();
  }
  dataBluetooth = "";
}

// ==========================================================
// LCD I2C 16x2 FUNCTIONS
// ==========================================================
void printLcdLine(uint8_t row, const char *text) {
  if (!lcdReady)
    return;

  char buffer[17];
  snprintf(buffer, sizeof(buffer), "%-16.16s", text);

  lcd->setCursor(0, row);
  lcd->print(buffer);
}

uint8_t scanI2C() {
  Serial.println("[I2C] Scan alamat I2C...");
  byte count = 0;
  uint8_t lcdAddr = 0;

  for (byte address = 1; address < 127; address++) {
    // Abaikan alamat RTC DS3231 (0x68) dan EEPROM AT24C32 (0x57) agar tidak
    // salah deteksi sebagai LCD
    if (address == 0x68 || address == 0x57) {
      continue;
    }
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("[I2C] Device ditemukan di alamat 0x");
      if (address < 16)
        Serial.print("0");
      Serial.println(address, HEX);
      count++;
      // standard PCF8574 I2C LCD addresses (biasanya 0x27, 0x3F, 0x38, atau
      // 0x20)
      if (address == 0x27 || address == 0x3F || address == 0x38 ||
          address == 0x20) {
        lcdAddr = address;
      }
    }
  }

  if (count == 0) {
    Serial.println(
        "[I2C] Tidak ada device terdeteksi. Cek kabel SDA/SCL/VCC/GND.");
  }
  return lcdAddr;
}

void initLCD() {
  Serial.println("[LCD] Init LCD...");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  delay(300);

  uint8_t lcdAddr = scanI2C();

  if (lcdAddr != 0) {
    Serial.printf(
        "[LCD] LCD terdeteksi di alamat 0x%02X. Menginisialisasi...\n",
        lcdAddr);
    if (lcd != nullptr) {
      delete lcd;
    }
    lcd = new LiquidCrystal_I2C(lcdAddr, 16, 2);
    lcd->init();
    lcd->backlight();
    lcd->clear();

    lcdReady = true;
    lcdBacklightOn = true;

    printLcdLine(0, "SMARTBOX");
    printLcdLine(1, "LCD AKTIF");

    Serial.println("[LCD] LCD I2C aktif.");
  } else {
    Serial.println("[LCD] LCD I2C tidak ditemukan! LCD dinonaktifkan.");
    lcdReady = false;
    lcdBacklightOn = false;
  }
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
  if (state)
    setRgb(0, 80, 0);
  else
    setRgb(80, 0, 0);

  sendTelemetryNow();
}

void playDfTrack(int track) { playVoice((uint8_t)track, "manual"); }

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

void setRelay(uint8_t relayNumber, bool state, bool withVoice,
              bool publishStatus) {
  if (relayNumber == 1) {
    relay1State = state;
    digitalWrite(RELAY_1_PIN, state ? RELAY_ON : RELAY_OFF);
  }
  if (relayNumber == 2) {
    relay2State = state;
    digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF);
  }
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
    snprintf(msg, sizeof(msg), "Relay %d %s", relayNumber,
             state ? "ON" : "OFF");
    doc["message"] = msg;
    JsonObject payload = doc.createNestedObject("payload");
    payload["relay"] = relayNumber;
    payload["state"] = state;
    publishJson(topicEvent(), doc, false);
  }

  sendTelemetryNow();
}

void setBuzzer(bool state, bool manualMode) {
  if (manualMode)
    buzzerManual = state;
  if (state) {
    tone(BUZZER_PIN, 1000); // 1000 Hz tone
  } else {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED)
    return;

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
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
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

  String clientId = String("SmartBox-") + DEVICE_ID + "-" +
                    String((uint32_t)ESP.getEfuseMac(), HEX);
  String willPayload =
      String("{\"deviceId\":\"") + DEVICE_ID + "\",\"online\":false}";

  bool ok =
      mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                         topicStatus().c_str(), 1, true, willPayload.c_str());

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
  } else {
    Serial.print("[MQTT] Gagal connect. State = ");
    Serial.println(mqttClient.state());
  }
}

void handleRelayCommand(JsonObject data, const char *cmdId, const char *type) {
  bool state = data["state"] | false;
  int relayNumber = data["relay"] | 1;
  int autoOffSeconds = data["autoOffSeconds"] | 0;
  const char *source = data["source"] | "";
  bool fromSchedule = strcmp(source, "schedule") == 0 ||
                      strcmp(source, "relay_schedule") == 0 ||
                      data.containsKey("scheduleId");

  if (state && autoOffSeconds <= 0 && !fromSchedule) {
    autoOffSeconds = 60;
  }

  if (relayNumber < 1 || relayNumber > 2) {
    publishAck(cmdId, type, false, "Relay tidak valid.");
    return;
  }

  setRelay(relayNumber, state, false, false);

  if (relayNumber == 1) {
    if (state && autoOffSeconds > 0) {
      relay1AutoOffActive = true;
      relay1AutoOffAt = millis() + (autoOffSeconds * 1000UL);
      setLcdOverride("STOP KONTAK 1", "KIPAS ON 1 MENIT", 3000);
    } else {
      relay1AutoOffActive = false;
      if (!state)
        setLcdOverride("STOP KONTAK 1", "KIPAS OFF", 3000);
    }
  }

  if (relayNumber == 2) {
    if (state && autoOffSeconds > 0) {
      relay2AutoOffActive = true;
      relay2AutoOffAt = millis() + (autoOffSeconds * 1000UL);
      setLcdOverride("STOP KONTAK 2", "CHARGER 1 MENIT", 3000);
    } else {
      relay2AutoOffActive = false;
      if (!state)
        setLcdOverride("STOP KONTAK 2", "CHARGER OFF", 3000);
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
  alarmList[slot].hour = hour;
  alarmList[slot].minute = minute;
  alarmList[slot].track = track;
  alarmList[slot].enabled = enabled;
  publishAck(cmdId, type, true, "Alarm updated.");
}

void handleCommandJson(JsonDocument &doc, const String &topic) {
  const char *cmdId = doc["id"] | "";
  const char *type = doc["type"] | "";
  JsonObject data = doc["payload"].as<JsonObject>();
  if (data.isNull())
    data = doc.as<JsonObject>();

  if (strlen(type) == 0) {
    if (topic.endsWith("/buzzer/set"))
      type = "buzzer.set";
    else if (topic.endsWith("/relay/set"))
      type = "relay.set";
    else if (topic.endsWith("/alarm/set"))
      type = "alarm.set";
  }

  Serial.printf("[CMD] %s received\n", type);

  if (strcmp(type, "relay.set") == 0)
    handleRelayCommand(data, cmdId, type);
  else if (strcmp(type, "gasSensor.set") == 0) {
    gasEnabled = data["enabled"] | true;
    lastGasWarning = false;
    lastSmokeWarning = false;
    saveSettings();
    publishAck(cmdId, type, true, "Sensor updated.");
  } else if (strcmp(type, "voice.play") == 0) {
    int track = data["track"] | -1;
    const char *reason = data["reason"] | "dashboard_voice_test";
    if (track >= 1 && track <= DFPLAYER_MAX_TRACK) {
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
    if (track >= 1 && track <= DFPLAYER_MAX_TRACK) {
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
  } else if (strcmp(type, "backend.set") == 0) {
    const char *url = data["url"] | "";
    if (strlen(url) > 0) {
      aiResponseHost = String(url);
      aiBackendUrl = aiResponseHost + "/api/gemini/chat-audio";
      saveSettings();
      publishAck(cmdId, type, true, "Backend URL synchronized successfully.");
      Serial.printf("[SETTINGS] Synced backend host: %s, URL: %s\n", aiResponseHost.c_str(), aiBackendUrl.c_str());
    } else {
      publishAck(cmdId, type, false, "Invalid backend URL.");
    }
  } else if (strcmp(type, "sensor.calibrate") == 0) {
    int samples = data["samples"] | 100;
    setLcdOverride("KALIBRASI SENSOR", "MOHON TUNGGU", 5000);
    calibrateMQ2(samples);
    publishAck(cmdId, type, true, "Sensor gas MQ-2 berhasil dikalibrasi.");
  } else if (strcmp(type, "temperatureSensor.set") == 0 ||
             strcmp(type, "tempSensor.set") == 0) {
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
    if (pirGreetingTrack < TRACK_GESTURE_WALK ||
        pirGreetingTrack > TRACK_GESTURE_WAVE) {
      pirGreetingTrack = TRACK_GESTURE_WALK;
    }

    const char *startTime = data["startTime"] | "07:00";
    const char *endTime = data["endTime"] | "22:00";
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
    if (cooldownSeconds < 10)
      cooldownSeconds = 10;
    PIR_GREETING_COOLDOWN = (unsigned long)cooldownSeconds * 1000UL;

    const char *playMode = data["playMode"] | "cooldown";
    if (strcmp(playMode, "once_schedule") != 0 &&
        strcmp(playMode, "once_motion") != 0) {
      pirGreetingPlayMode = "cooldown";
    } else {
      pirGreetingPlayMode = playMode;
    }

    if (data["days"].is<JsonArray>()) {
      pirGreetingDaysMask = 0;
      JsonArray days = data["days"].as<JsonArray>();
      for (JsonVariant dayValue : days) {
        const char *day = dayValue.as<const char *>();
        if (strcmp(day, "sunday") == 0)
          pirGreetingDaysMask |= (1 << 0);
        else if (strcmp(day, "monday") == 0)
          pirGreetingDaysMask |= (1 << 1);
        else if (strcmp(day, "tuesday") == 0)
          pirGreetingDaysMask |= (1 << 2);
        else if (strcmp(day, "wednesday") == 0)
          pirGreetingDaysMask |= (1 << 3);
        else if (strcmp(day, "thursday") == 0)
          pirGreetingDaysMask |= (1 << 4);
        else if (strcmp(day, "friday") == 0)
          pirGreetingDaysMask |= (1 << 5);
        else if (strcmp(day, "saturday") == 0)
          pirGreetingDaysMask |= (1 << 6);
      }
    }

    pirGreetingPlayedThisWindow = false;
    lastPirGreetingTime = 0;
    saveSettings();

    char line2[17];
    if (pirGreetingEnabled)
      snprintf(line2, sizeof(line2), "ON TRACK %04d", pirGreetingTrack);
    else
      snprintf(line2, sizeof(line2), "OFF");
    setLcdOverride("PIR GREETING", line2, 3000);
    publishAck(cmdId, type, true, "PIR greeting updated.");
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<768> doc;
  if (!deserializeJson(doc, payload, length))
    handleCommandJson(doc, String(topic));
}

int getFilteredGas() {
  int raw = analogRead(MQ2_PIN);
  if (gasRawFiltered < 0.0)
    gasRawFiltered = raw;
  else
    gasRawFiltered = (0.15 * raw) + (0.85 * gasRawFiltered);
  return (int)gasRawFiltered;
}

void calibrateMQ2(int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(MQ2_PIN);
    delay(50);
  }
  MQ2_BASELINE = sum / samples;
  smokeThreshold = MQ2_BASELINE + SMOKE_THRESHOLD_OFFSET;
  gasThreshold = MQ2_BASELINE + GAS_THRESHOLD_OFFSET;
  resetThreshold = MQ2_BASELINE + RESET_THRESHOLD_OFFSET;
  saveSettings();
}

// Dummy kalibrasi overload (tanpa parameter untuk KWS)
void calibrateMQ2() {
  Serial.println("[AI ACTION] calibrateMQ2() dummy dipanggil.");
  calibrateMQ2(100);
}

// Dummy toggle relay 1 untuk KWS
void toggleRelay1() {
  Serial.println("[AI ACTION] toggleRelay1() dipanggil.");
  setRelay(1, !relay1State, false);
}

int timeToMinutes(int hour, int minute) { return hour * 60 + minute; }

bool isNowInTimeRange(int nowHour, int nowMinute, int startHour,
                      int startMinute, int endHour, int endMinute) {
  int nowValue = timeToMinutes(nowHour, nowMinute);
  int startValue = timeToMinutes(startHour, startMinute);
  int endValue = timeToMinutes(endHour, endMinute);

  if (startValue <= endValue) {
    return nowValue >= startValue && nowValue <= endValue;
  }

  return nowValue >= startValue || nowValue <= endValue;
}

bool parseTimeToHourMinute(const char *timeStr, int &hour, int &minute) {
  if (timeStr == NULL || strlen(timeStr) != 5 || timeStr[2] != ':') {
    return false;
  }

  int parsedHour = -1;
  int parsedMinute = -1;
  if (sscanf(timeStr, "%2d:%2d", &parsedHour, &parsedMinute) != 2) {
    return false;
  }
  if (parsedHour < 0 || parsedHour > 23 || parsedMinute < 0 ||
      parsedMinute > 59) {
    return false;
  }

  hour = parsedHour;
  minute = parsedMinute;
  return true;
}

String getIsoTimestamp() {
  DateTime now = rtc.now();
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.000Z", now.year(),
           now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(buf);
}

void publishTelemetry(int gasRaw, float tempC, bool gasWarning,
                      bool tempWarning, bool pirDetected,
                      const String &gasLevel, bool obstacleNear) {
  StaticJsonDocument<1024> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperatureC"] = tempC;
  doc["gasRaw"] = gasRaw;
  doc["gasLevel"] = gasLevel;
  doc["gasEnabled"] = gasEnabled;
  doc["gasSensorEnabled"] = gasEnabled;
  doc["tempEnabled"] = tempEnabled;
  doc["gasDetected"] = gasWarning;
  doc["smokeDetected"] = lastSmokeWarning;
  doc["temperatureHigh"] = tempWarning;
  doc["pirDetected"] = pirDetected;
  doc["motionDetected"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;
  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  unsigned long nowMs = millis();
  unsigned long relay1RemainingMs =
      relay1AutoOffActive && (long)(relay1AutoOffAt - nowMs) > 0
          ? relay1AutoOffAt - nowMs
          : 0;
  unsigned long relay2RemainingMs =
      relay2AutoOffActive && (long)(relay2AutoOffAt - nowMs) > 0
          ? relay2AutoOffAt - nowMs
          : 0;
  doc["relay1AutoOffRemaining"] =
      relay1RemainingMs > 0 ? (relay1RemainingMs + 999UL) / 1000UL : 0;
  doc["relay2AutoOffRemaining"] =
      relay2RemainingMs > 0 ? (relay2RemainingMs + 999UL) / 1000UL : 0;
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
  snprintf(pirStart, sizeof(pirStart), "%02d:%02d", pirGreetingStartHour,
           pirGreetingStartMinute);
  snprintf(pirEnd, sizeof(pirEnd), "%02d:%02d", pirGreetingEndHour,
           pirGreetingEndMinute);
  doc["pirGreetingStart"] = pirStart;
  doc["pirGreetingEnd"] = pirEnd;
  if (rtcReady)
    doc["createdAt"] = getIsoTimestamp();
  else
    doc["createdAt"] = nullptr;
  publishJson(topicTelemetry(), doc, false);
}

void sendTelemetryNow() {
  int gas = getFilteredGas();
  float temp = rtcReady ? (rtc.getTemperature() + tempOffset) : 0.0;
  bool isGas = (gas >= gasThreshold);
  bool isSmoke = (gas >= smokeThreshold);
  String gasLevel = "normal";
  if (isGas)
    gasLevel = "gas";
  else if (isSmoke)
    gasLevel = "smoke";
  bool pir = pirEnabled && (digitalRead(PIR_PIN) == HIGH);
  bool obstacle = (digitalRead(IR_PIN) == HIGH);
  publishTelemetry(gas, temp, isGas || isSmoke, false, pir, gasLevel, obstacle);
}

void checkWarnings(int gasRaw, float tempC, bool anyGasWarning,
                   bool tempWarning, bool pirDetected) {
  bool isGas = gasEnabled && gasRaw >= gasThreshold;
  bool isSmoke =
      gasEnabled && gasRaw >= smokeThreshold && gasRaw < gasThreshold;
  bool gasWarning = isGas || isSmoke;
  bool triggerBuzzer = gasWarning;

  if (isGas) {
    setBluetoothAudio(true);
    setRgb(255, 0, 0);
    if (!relay1State)
      setRelay(1, true, false);
    relay1ForcedByGas = true;
    setBuzzer(true, false);

    if (!lastGasWarning) {
      lastGasWarning = true;
      lastSmokeWarning = false;
      isGasWarningPlayed = true;
      buzzerAutoWarningActive = true;
      gasStatusStr = "detected";
      smokeStatusStr = "normal";
      publishBuzzerUpdated(true, "gas_detected");
      setLcdOverride("GAS TERDETEKSI", "SEGERA PERIKSA!", 5000);
      playVoice(TRACK_GAS_DETECTED, "gas_detected");
      publishEvent("WARNING", "gas.detected", "Gas terdeteksi!");
    }
  } else if (isSmoke) {
    setBluetoothAudio(true);
    setRgb(255, 80, 0);
    setBuzzer(true, false);

    if (!lastSmokeWarning) {
      lastSmokeWarning = true;
      lastGasWarning = false;
      isSmokeWarningPlayed = true;
      buzzerAutoWarningActive = true;
      smokeStatusStr = "detected";
      gasStatusStr = "normal";
      publishBuzzerUpdated(true, "smoke_detected");
      setLcdOverride("ASAP TERDETEKSI", "SEGERA PERIKSA!", 5000);
      playVoice(TRACK_SMOKE_DETECTED, "smoke_detected");
      publishEvent("WARNING", "smoke.detected", "Asap terdeteksi!");
    }
  } else {
    if (gasRaw < resetThreshold) {
      if (lastGasWarning || lastSmokeWarning) {
        publishEvent("INFO", "gas.cleared", "Kondisi gas/asap kembali normal.");
      }
      lastGasWarning = false;
      lastSmokeWarning = false;
      isGasWarningPlayed = false;
      isSmokeWarningPlayed = false;
      gasStatusStr = "normal";
      smokeStatusStr = "normal";
      if (relay1ForcedByGas) {
        setRelay(1, false, false);
        relay1ForcedByGas = false;
      }
    }
  }

  // Handle buzzer state based on new rules
  if (triggerBuzzer) {
    setBuzzer(true, false);
  } else {
    if (gasRaw < resetThreshold) {
      if (buzzerAutoWarningActive) {
        buzzerAutoWarningActive = false;
        if (!buzzerManual) {
          setBuzzer(false, false);
          publishBuzzerUpdated(false, "gas_clear");
        }
      } else if (!buzzerManual) {
        setBuzzer(false, false);
      }
    }
  }

  if (tempWarning && !lastTempWarning) {
    lastTempWarning = true;
    setLcdOverride("SUHU TINGGI", "CEK RUANGAN", 5000);
    playVoice(TRACK_TEMP_DETECTED, "temperature_warning");
    publishEvent("WARNING", "temperature.high",
                 "Suhu terdeteksi melebihi ambang batas");
  }

  if (!tempWarning) {
    lastTempWarning = false;
  }
}

void checkAlarms() {
  if (!rtcReady)
    return;
  DateTime now = rtc.now();
  for (int i = 0; i < 3; i++) {
    if (alarmList[i].enabled && now.hour() == alarmList[i].hour &&
        now.minute() == alarmList[i].minute &&
        alarmList[i].lastTriggeredDay != now.day()) {
      alarmList[i].lastTriggeredDay = now.day();
      char timeStr[6];
      snprintf(timeStr, sizeof(timeStr), "%02d:%02d", alarmList[i].hour,
               alarmList[i].minute);
      playScheduledAlarm(alarmList[i].track, timeStr);
    }
  }
}

void updateLcd(int gasRaw, float tempC, bool gasWarning, bool tempWarning,
               bool pirDetected) {
  if (!lcdReady || !lcdBacklightOn)
    return;
  if (millis() - lastLcdAt < LCD_INTERVAL_MS)
    return;

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
    if (rtcReady) {
      DateTime now = rtc.now();
      snprintf(line1, sizeof(line1), "SMARTBOX %02d:%02d", now.hour(),
               now.minute());
      snprintf(line2, sizeof(line2), "G:%d T:%0.1fC", gasRaw, tempC);
    } else {
      snprintf(line1, sizeof(line1), "SMARTBOX READY");
      snprintf(line2, sizeof(line2), "MQ2:%d", gasRaw);
    }
  }

  printLcdLine(0, line1);
  printLcdLine(1, line2);
}

void checkBlackButton() {
  bool reading = digitalRead(BLACK_BTN_PIN);
  unsigned long now = millis();

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
          }
        }
      }
    }
  }

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

    snprintf(line1, sizeof(line1), "WAKTU %02d:%02d:%02d", now.hour(),
             now.minute(), now.second());
    snprintf(line2, sizeof(line2), "SUHU %4.1f C", tempC);

    setLcdOverride(line1, line2, 4000);
  } else {
    setLcdOverride("RTC ERROR", "CEK DS3231", 3000);
  }

  publishEvent("INFO", "button.black.quick",
               "Tombol hitam tekan cepat: tampil jam dan suhu.");
}

void handleBlackButtonLongPress() {
  Serial.println("[BUTTON] Black long press - Trigger AI voice recording flow");

  if (systemState != STATE_KWS) {
    Serial.println(
        "[BUTTON] Alur AI sedang berjalan. Mengabaikan penekanan tombol.");
    return;
  }

  // ===========================================================================
  // PERALIHAN DARI EDGE IMPULSE (KWS) KE PEREKAM WEB (GEMINI)
  // ===========================================================================
  // Langkah 1: Ubah status sistem ke STATE_RECORDING. Ini secara otomatis akan
  //            menghentikan pemanggilan klasifikasi Edge Impulse pada loop().
  systemState = STATE_RECORDING;

  // Langkah 2: Reset index buffer rekaman dan catat waktu mulai perekaman.
  recordBufferIdx = 0;
  recordingStartMillis = millis();

  // Langkah 3: Tampilkan feedback ke LCD dan kirim event.
  setLcdOverride("AI MENDENGAR", "SILAKAN BICARA", 4000);
  publishEvent("INFO", "button.black.long",
               "Tombol hitam ditahan: Memulai perekaman Gemini AI.");

  Serial.println("[I2S SWITCH] Proses KWS (Edge Impulse) ditangguhkan. "
                 "Perekaman audio ke PSRAM dimulai...");
}

void handleSendingState() {
  setLcdOverride("AI MEMPROSES", "MENGIRIM KE AI", 5000);
  Serial.println("[AI] Mengirim audio WAV ke backend...");

  WavHeader header;
  header.chunkSize = 36 + recordBufferIdx;
  header.subchunk2Size = recordBufferIdx;
  memcpy(recordBuffer, &header, 44);

  WiFiClient client;
  HTTPClient http;

  if (http.begin(client, aiBackendUrl)) {
    http.addHeader("Content-Type", "audio/wav");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-source", "black_button_long_press");
    http.setTimeout(25000);

    int httpResponseCode = http.POST(recordBuffer, 44 + recordBufferIdx);

    if (httpResponseCode == 200) {
      String response = http.getString();
      Serial.printf("[AI] Response received: %s\n", response.c_str());

      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, response);
      if (!error && doc["success"]) {
        const char *audioUrl = doc["audioUrl"] | "";
        const char *aiText = doc["text"] | "Success";
        setLcdOverride("AI JAWABAN:", aiText, 5000);

        if (strlen(audioUrl) > 0) {
          aiResponseUrl = aiResponseHost + String(audioUrl);
          systemState = STATE_DOWNLOADING;
          http.end();
          return;
        }
      }
    } else {
      Serial.printf("[AI] HTTP POST gagal, code: %d, error: %s\n",
                    httpResponseCode,
                    http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }

  setLcdOverride("AI ERROR", "KIRIM GAGAL", 3000);
  systemState = STATE_KWS; // Kembali ke KWS jika gagal
}

void handleDownloadingState() {
  setLcdOverride("MENGUNDUH JAWABAN", "MOHON TUNGGU", 5000);
  Serial.printf("[AI] Mengunduh MP3 dari: %s\n", aiResponseUrl.c_str());

  WiFiClient client;
  HTTPClient http;

  if (http.begin(client, aiResponseUrl)) {
    http.setTimeout(15000);
    int httpResponseCode = http.GET();

    if (httpResponseCode == 200) {
      File file = LittleFS.open("/response.mp3", "w");
      if (file) {
        WiFiClient *stream = http.getStreamPtr();
        int len = http.getSize();
        uint8_t buff[512];
        int written = 0;

        while (http.connected() && (len > 0 || len == -1)) {
          size_t size = stream->available();
          if (size) {
            int c = stream->readBytes(
                buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
            file.write(buff, c);
            written += c;
            if (len > 0) {
              len -= c;
              if (len <= 0)
                break;
            }
          }
          yield();
        }
        file.close();
        Serial.printf("[AI] Berhasil mengunduh %d bytes ke /response.mp3\n",
                      written);
        systemState = STATE_PLAYING;
        isPlayingResponse = false;
      } else {
        Serial.println("[AI] Gagal membuka file /response.mp3 untuk menulis.");
        systemState = STATE_KWS;
      }
    } else {
      Serial.printf("[AI] Unduh MP3 gagal, code: %d\n", httpResponseCode);
      systemState = STATE_KWS;
    }
    http.end();
  } else {
    Serial.println("[AI] Koneksi HTTP gagal untuk unduh.");
    systemState = STATE_KWS;
  }
}

void handlePlayingState() {
  if (!isPlayingResponse) {
    isPlayingResponse = true;
    Serial.println("[AI] Memulai pemutaran audio MP3 via PT8211...");
    setLcdOverride("AI MENJAWAB", "MEMUTAR AUDIO...", 10000);

    // Aktifkan amplifier audio
    setBluetoothAudio(true);
    delay(200);

    audioFile = new AudioFileSourceLittleFS("/response.mp3");
    // Gunakan I2S_NUM_0 untuk DAC PT8211
    audioOut = new AudioOutputI2S(0, AudioOutputI2S::EXTERNAL_I2S);
    audioOut->SetPinout(PT_BCLK, PT_LRC, PT_DOUT);
    audioMp3 = new AudioGeneratorMP3();

    audioMp3->begin(audioFile, audioOut);
  }

  if (audioMp3 && audioMp3->isRunning()) {
    if (!audioMp3->loop()) {
      audioMp3->stop();
      Serial.println("[AI] Selesai memutar MP3.");

      delete audioMp3;
      audioMp3 = nullptr;
      delete audioOut;
      audioOut = nullptr;
      delete audioFile;
      audioFile = nullptr;

      if (!bluetoothAktif) {
        setBluetoothAudio(false);
      }

      // ===========================================================================
      // PERALIHAN KEMBALI DARI PEMUTARAN AUDIO KE EDGE IMPULSE (KWS)
      // ===========================================================================
      // Langkah 1: Ubah status kembali ke STATE_KWS agar Edge Impulse aktif
      // kembali.
      systemState = STATE_KWS;
      isPlayingResponse = false;

      Serial.println("[I2S SWITCH] Pemutaran selesai. Mengaktifkan kembali KWS "
                     "(Edge Impulse)...");
      setLcdOverride("AI SELESAI", "KWS AKTIF KEMBALI", 3000);
    }
  }
}

// ==========================================================
// EDGE IMPULSE GET DATA CALLBACK
// ==========================================================
int microphone_audio_signal_get_data(size_t offset, size_t length,
                                     float *out_ptr) {
  numpy::int16_to_float(&audio_buffer[offset], out_ptr, length);
  return 0;
}

// ==========================================================
// INIT I2S INMP441 (I2S_NUM_1)
// ==========================================================
void initI2SMic() {
  Serial.println("[I2S] Init INMP441 pada I2S_NUM_1...");

  i2s_channel_fmt_t channelFormat = I2S_CHANNEL_FMT_ONLY_LEFT;

  i2s_config_t i2s_config = {.mode =
                                 (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
                             .sample_rate = SAMPLE_RATE,
                             .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
                             .channel_format = channelFormat,
                             .communication_format = I2S_COMM_FORMAT_I2S,
                             .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
                             .dma_buf_count = 8,
                             .dma_buf_len = 512,
                             .use_apll = false,
                             .tx_desc_auto_clear = false,
                             .fixed_mclk = 0};

  i2s_pin_config_t pin_config = {.bck_io_num = MIC_SCK,
                                 .ws_io_num = MIC_WS,
                                 .data_out_num = I2S_PIN_NO_CHANGE,
                                 .data_in_num = MIC_SD};

  esp_err_t err;

  err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S ERROR] i2s_driver_install gagal: %d\n", err);
    while (true) {
      delay(1000);
    }
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[I2S ERROR] i2s_set_pin gagal: %d\n", err);
    while (true) {
      delay(1000);
    }
  }

  err = i2s_zero_dma_buffer(MIC_I2S_PORT);
  if (err != ESP_OK) {
    Serial.printf("[I2S ERROR] i2s_zero_dma_buffer gagal: %d\n", err);
  }

  Serial.println("[I2S] INMP441 siap.");
}

// Merekam slice audio untuk Edge Impulse (Continuous mode)
bool recordAudioSlice(float *outRms, int *outPeak, float *outAvgAbs) {
  uint32_t samples_read = 0;
  int peakAbs = 0;
  uint64_t sumAbs = 0;
  uint64_t sumSquares = 0;
  unsigned long startMs = millis();
  unsigned long timeoutMs = 5000;

  while (samples_read < EI_CLASSIFIER_SLICE_SIZE) {
    if (millis() - startMs > timeoutMs) {
      Serial.println("[MIC ERROR] Timeout membaca audio untuk KWS.");
      return false;
    }

    size_t bytes_read = 0;
    int32_t raw_samples[128];

    esp_err_t err = i2s_read(MIC_I2S_PORT, raw_samples, sizeof(raw_samples),
                             &bytes_read, pdMS_TO_TICKS(100));

    if (err != ESP_OK) {
      return false;
    }

    if (bytes_read == 0) {
      continue;
    }

    int count = bytes_read / sizeof(int32_t);

    for (int i = 0; i < count; i++) {
      if (samples_read >= EI_CLASSIFIER_SLICE_SIZE) {
        break;
      }

      int32_t shifted = raw_samples[i] >> I2S_SHIFT;
      float gained = shifted * AUDIO_GAIN;

      if (gained > 32767)
        gained = 32767;
      if (gained < -32768)
        gained = -32768;

      int16_t sample16 = (int16_t)gained;

      audio_buffer[samples_read] = sample16;

      int absValue = abs((int)sample16);
      if (absValue > peakAbs)
        peakAbs = absValue;
      sumAbs += absValue;
      sumSquares += (int64_t)sample16 * (int64_t)sample16;

      samples_read++;
    }
  }

  float avgAbs = (float)sumAbs / (float)EI_CLASSIFIER_SLICE_SIZE;
  float rms = sqrt((float)sumSquares / (float)EI_CLASSIFIER_SLICE_SIZE);

  *outRms = rms;
  *outPeak = peakAbs;
  *outAvgAbs = avgAbs;

  return true;
}

// Mendapatkan nilai score dari label tertentu
float getLabelScore(ei_impulse_result_t *result, const char *targetLabel) {
  for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
    String label = result->classification[ix].label;
    if (label == targetLabel) {
      return result->classification[ix].value;
    }
  }
  return 0.0f;
}

// Mendapatkan label terbaik dengan score tertinggi
void getBestLabel(ei_impulse_result_t *result, String *bestLabel,
                  float *bestScore) {
  *bestLabel = "";
  *bestScore = 0.0f;
  for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
    float score = result->classification[ix].value;
    String label = result->classification[ix].label;
    if (score > *bestScore) {
      *bestScore = score;
      *bestLabel = label;
    }
  }
}

// Event handlers ketika keyword terdeteksi
void onHaloAeroDetected(float score, float rms, int peak) {
  smartboxAwake = true;

  Serial.println();
  Serial.println("==================================================");
  Serial.println(">>> COMMAND DETECTED: Halo_Aero");
  Serial.printf(">>> Score: %.2f%% | RMS: %.1f | Peak: %d\n", score * 100.0f,
                rms, peak);
  Serial.println(">>> Aksi: Membangunkan asisten, memutar Track 14.");
  Serial.println("==================================================");

  setLcdOverride("HALLO AERO", "ADA YANG BISA BANTU", 4000);
  playVoice(TRACK_HALO_AERO, "wake_word");
}

void onCalibrationDetected(float score, float rms, int peak) {
  Serial.println();
  Serial.println("==================================================");
  Serial.println(">>> COMMAND DETECTED: calibration");
  Serial.printf(">>> Score: %.2f%% | RMS: %.1f | Peak: %d\n", score * 100.0f,
                rms, peak);
  Serial.println(">>> Aksi: Memulai kalibrasi sensor MQ-2.");
  Serial.println("==================================================");

  calibrateMQ2();
  setLcdOverride("KALIBRASI SUARA", "MQ2 CALIBRATING", 4000);
  playVoice(TRACK_HALO_AERO, "calibration");
}

void onOneClapDetected(float score, float rms, int peak) {
  Serial.println();
  Serial.println("==================================================");
  Serial.println(">>> COMMAND DETECTED: 1_tepukan");
  Serial.printf(">>> Score: %.2f%% | RMS: %.1f | Peak: %d\n", score * 100.0f,
                rms, peak);
  Serial.println(">>> Aksi: Mengubah status stop kontak/relay 1.");
  Serial.println("==================================================");

  toggleRelay1();
  playVoice(TRACK_HALO_AERO, "1_tepukan");
}

// Mencetak hasil klasifikasi Edge Impulse ke serial untuk debug
void printDebugResult(ei_impulse_result_t *result, float micRms, int micPeak,
                      float micAvgAbs, String bestLabel, float bestScore,
                      float haloScore, float calibrationScore,
                      float clapScore) {
  Serial.println();
  Serial.println("================ VOICE DEBUG ================");
  Serial.printf("[MIC] RMS: %.1f | Peak: %d | AvgAbs: %.1f | MinRMS: %.1f\n",
                micRms, micPeak, micAvgAbs, MIC_RMS_MIN);
  Serial.printf("[BEST] %s = %.2f%%\n", bestLabel.c_str(), bestScore * 100.0f);
  Serial.printf("  Halo_Aero   : %.2f%%\n", haloScore * 100.0f);
  Serial.printf("  calibration : %.2f%%\n", calibrationScore * 100.0f);
  Serial.printf("  1_tepukan   : %.2f%%\n", clapScore * 100.0f);
  Serial.println("=============================================");
}

void checkButtons() {
  unsigned long now = millis();
  const unsigned long DEBOUNCE_DELAY_MS = 50;

  // 2. White Button Logic (Short: Play Track 1 - Assistant Intro/Ready)
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

// ==========================================================
// SETUP
// ==========================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("========== SMARTBOX BOOT ==========");

  // Inisialisasi GPIO
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

  // Inisialisasi LittleFS (Sesuai kebutuhan arsitektur)
  if (!LittleFS.begin(true)) {
    Serial.println("[LittleFS] Gagal inisialisasi LittleFS!");
  } else {
    Serial.println("[LittleFS] LittleFS berhasil diinisialisasi.");
  }

  // Inisialisasi PSRAM (Sesuai kebutuhan arsitektur)
  if (psramInit()) {
    Serial.println("[PSRAM] PSRAM terdeteksi dan diinisialisasi.");
  } else {
    Serial.println("[PSRAM] PSRAM tidak terdeteksi!");
  }

  // Alokasi record buffer di PSRAM
  recordBuffer = (uint8_t *)ps_malloc(RECORD_BUFFER_SIZE + 44);
  if (recordBuffer == NULL) {
    Serial.println(
        "[MEM] Gagal alokasi recordBuffer di PSRAM, mencoba RAM internal...");
    recordBuffer = (uint8_t *)malloc(RECORD_BUFFER_SIZE + 44);
  }
  if (recordBuffer != NULL) {
    Serial.println("[MEM] recordBuffer siap.");
  }

  // Alokasi Edge Impulse audio buffer
  audio_buffer = (int16_t *)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(int16_t));
  if (audio_buffer == NULL) {
    Serial.println("[MEM] Gagal alokasi audio_buffer untuk KWS!");
    while (true) {
      delay(1000);
    }
  }

  // Inisialisasi I2S Mic INMP441
  initI2SMic();

  // Inisialisasi Classifier Edge Impulse
  run_classifier_init();
  Serial.println("[EI] Edge Impulse classifier siap.");

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
  nyalakanBluetooth();

  Serial.println("========== SMARTBOX READY ==========");
}

// ==========================================================
// LOOP
// ==========================================================
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
  checkAlarms();
  checkRelaySchedules();
  checkRelayAutoOff();
  checkBluetoothTimer();
  serviceVoiceQueue();

  // ===========================================================================
  // STATE MACHINE AUDIO AI & SWITCHING I2S
  // ===========================================================================
  if (systemState == STATE_RECORDING) {
    // Sedang dalam proses merekam suara mic untuk dikirim ke Gemini.
    // Edge Impulse KWS sedang dihentikan sementara secara otomatis karena state
    // tidak STATE_KWS.
    int32_t i2sSamples[64];
    size_t bytesRead = 0;

    // Membaca data mic secara non-blocking dari MIC_I2S_PORT (I2S_NUM_1)
    esp_err_t err =
        i2s_read(MIC_I2S_PORT, i2sSamples, sizeof(i2sSamples), &bytesRead, 0);
    if (err == ESP_OK && bytesRead > 0) {
      size_t numSamples = bytesRead / sizeof(int32_t);
      for (size_t i = 0; i < numSamples; i++) {
        if (recordBufferIdx + 2 <= RECORD_BUFFER_SIZE) {
          int32_t shifted = i2sSamples[i] >> I2S_SHIFT;
          float gained = shifted * AUDIO_GAIN;
          if (gained > 32767)
            gained = 32767;
          if (gained < -32768)
            gained = -32768;
          int16_t sample16 = (int16_t)gained;

          recordBuffer[44 + recordBufferIdx] = sample16 & 0xFF;
          recordBuffer[44 + recordBufferIdx + 1] = (sample16 >> 8) & 0xFF;
          recordBufferIdx += 2;
        }
      }
    }

    if (millis() - recordingStartMillis >= 4000) {
      Serial.println("[AI] Perekaman 4 detik selesai.");
      systemState = STATE_SENDING;
    }
  } else if (systemState == STATE_SENDING) {
    // Mengunggah file WAV ke Next.js API
    handleSendingState();
  } else if (systemState == STATE_DOWNLOADING) {
    // Mengunduh output audio MP3 dari Gemini ke LittleFS
    handleDownloadingState();
  } else if (systemState == STATE_PLAYING) {
    // Memutar MP3 dari LittleFS ke PT8211 DAC (I2S_NUM_0)
    handlePlayingState();
  } else if (systemState == STATE_KWS) {
    // State default (Edge Impulse Active). Menjalankan classifier.
    float micRms = 0.0f;
    float micAvgAbs = 0.0f;
    int micPeak = 0;

    bool ok = recordAudioSlice(&micRms, &micPeak, &micAvgAbs);

    if (ok) {
      signal_t signal;
      signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
      signal.get_data = &microphone_audio_signal_get_data;

      ei_impulse_result_t result = {0};
      EI_IMPULSE_ERROR err = run_classifier_continuous(&signal, &result, false);

      if (err == EI_IMPULSE_OK) {
        String bestLabel = "";
        float bestScore = 0.0f;
        getBestLabel(&result, &bestLabel, &bestScore);

        float haloScore = getLabelScore(&result, "Halo_Aero");
        float calibrationScore = getLabelScore(&result, "calibration");
        float clapScore = getLabelScore(&result, "1_tepukan");

        bool micValid = micRms >= MIC_RMS_MIN;

        if (millis() - lastDebugTime >= DEBUG_INTERVAL_MS) {
          lastDebugTime = millis();
          printDebugResult(&result, micRms, micPeak, micAvgAbs, bestLabel,
                           bestScore, haloScore, calibrationScore, clapScore);
        }

        if (micValid && (millis() - lastCommandTime >= COMMAND_COOLDOWN_MS)) {
          if (haloScore >= SCORE_THRESHOLD_HALO) {
            lastCommandTime = millis();
            onHaloAeroDetected(haloScore, micRms, micPeak);
          } else if (calibrationScore >= SCORE_THRESHOLD_CALIBRATION) {
            lastCommandTime = millis();
            onCalibrationDetected(calibrationScore, micRms, micPeak);
          } else if (clapScore >= SCORE_THRESHOLD_CLAP) {
            lastCommandTime = millis();
            onOneClapDetected(clapScore, micRms, micPeak);
          }
        }
      }
    }
  }

  // ===========================================================================
  // REAL-TIME SENSOR MONITORING
  // ===========================================================================
  int gasRaw = getFilteredGas();
  float tempC = rtcReady ? rtc.getTemperature() + tempOffset : 0.0;

  bool isGas = gasEnabled && gasRaw >= gasThreshold;
  bool isSmoke =
      gasEnabled && gasRaw >= smokeThreshold && gasRaw < gasThreshold;
  bool gasWarning = isGas || isSmoke;
  bool tempWarning = tempEnabled && tempC >= tempThreshold;
  bool pirDetected = pirEnabled && digitalRead(PIR_PIN) == HIGH;
  String gasLevel = "normal";
  if (isGas)
    gasLevel = "gas";
  else if (isSmoke)
    gasLevel = "smoke";

  if (pirDetected != lastPirDetectedState) {
    lastMotionDetectedTime = millis();
    Serial.printf("[PIR] State changed to: %s\n", pirDetected ? "HIGH" : "LOW");

    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["level"] = "INFO";
    doc["type"] = "pir.motion";
    doc["message"] =
        pirDetected ? "Gerakan terdeteksi oleh PIR" : "Tidak ada gerakan";
    JsonObject payload = doc.createNestedObject("payload");
    payload["pirDetected"] = pirDetected;
    publishJson(topicEvent(), doc, false);

    publishTelemetry(gasRaw, tempC, gasWarning, tempWarning, pirDetected,
                     gasLevel, digitalRead(IR_PIN) == HIGH);
    lastTelemetryAt = millis();
  }
  lastPirDetectedState = pirDetected;

  checkWarnings(gasRaw, tempC, gasWarning, tempWarning, pirDetected);
  checkPirGreeting();

  updateLed12c(gasWarning, isSmoke, pirDetected, WiFi.status() == WL_CONNECTED,
               mqttClient.connected());
  updateLcd(gasRaw, tempC, gasWarning, tempWarning, pirDetected);

  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();

    publishTelemetry(gasRaw, tempC, gasWarning, tempWarning, pirDetected,
                     gasLevel, digitalRead(IR_PIN) == HIGH);
  }

  delay(10);
}
