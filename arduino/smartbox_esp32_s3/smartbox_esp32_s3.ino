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

#define MQTT_MAX_PACKET_SIZE 1024
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

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

bool whiteLastReading = HIGH;
bool whiteStableState = HIGH;
unsigned long whiteLastChangeAt = 0;

bool redLastReading = HIGH;
bool redStableState = HIGH;
unsigned long redLastChangeAt = 0;

// Bluetooth state
bool bluetoothState = false;

// Relay auto-off variables (1 minute)
unsigned long relay1TurnedOnAt = 0;
unsigned long relay2TurnedOnAt = 0;
const unsigned long RELAY_AUTO_OFF_MS = 60000;
unsigned long audioPowerOffAt = 0; // Non-blocking timer to turn off BT amplifier after track 13 plays

// MQ2 monitoring state
unsigned long lastMq2CheckAt = 0;
bool gasAlertActive = false;
unsigned long lastGasAlertAt = 0;
const unsigned long GAS_ALERT_COOLDOWN_MS = 10000;  // 10 detik cooldown alert gas

// Sensor toggle states
bool gasEnabled = true;
bool temperatureEnabled = true;
bool pirEnabled = true;
bool sleepModeEnabled = false;

// LCD override variables
bool lcdOverrideActive = false;
unsigned long lcdOverrideUntil = 0;

// Relay auto-off active states
bool relay1AutoOffActive = false;
unsigned long relay1AutoOffAt = 0;
bool relay2AutoOffActive = false;
unsigned long relay2AutoOffAt = 0;

// Voice cooldowns
unsigned long lastGasVoiceAt = 0;
const unsigned long GAS_VOICE_COOLDOWN_MS = 10000;
unsigned long lastTempVoiceAt = 0;
const unsigned long TEMP_VOICE_COOLDOWN_MS = 15000;
unsigned long lastPirVoiceAt = 0;
const unsigned long PIR_VOICE_COOLDOWN_MS = 8000;

int pirGreetingIndex = 0;
int pirTracks[] = {10, 11, 12};

unsigned long whiteBtnTrack15PlayAt = 0;

unsigned long lastTelemetryPublishAt = 0;
const unsigned long TELEMETRY_PUBLISH_INTERVAL_MS = 3000; // 3 seconds

// MQTT objects
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

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
void setLcdOverride(const char* line1, const char* line2, unsigned long durationMs) {
  lcdOverrideActive = true;
  lcdOverrideUntil = millis() + durationMs;
  lcdShow(line1, line2);
}

void showDefaultLcd() {
  if (rtcReady) {
    DateTime now = rtc.now();
    float tempC = rtc.getTemperature();
    char l1[17];
    char l2[17];
    snprintf(l1, sizeof(l1), "JAM  %02d:%02d:%02d", now.hour(), now.minute(), now.second());
    snprintf(l2, sizeof(l2), "SUHU %.1f C", tempC);
    lcdShow(l1, l2);
  } else {
    lcdShow("SMARTBOX READY", "SIAP DIGUNAKAN");
  }
}

void checkLcdOverride() {
  if (lcdOverrideActive && millis() >= lcdOverrideUntil) {
    lcdOverrideActive = false;
    showDefaultLcd();
  }
}

void playVoice(uint8_t track, const char* reason) {
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

  if (track < 1 || track > TRACK_INTRO_AERO) {
    Serial.println("[DFPLAYER] Track invalid.");
    lcdShow("TRACK ERROR", "1 SAMPAI 15");
    return;
  }

  // Tampilkan teks di LCD secara bersamaan / sebelum delay stabilization!
  const char *line1;
  const char *line2;
  getDfPlayerLcdText(track, line1, line2);
  setLcdOverride(line1, line2, 4000);

  setRGB(0, 0, 80);
  setAudioPower(true);
  delay(400);

  dfPlayer.play(track);

  Serial.println("[DFPLAYER] Command play dikirim.");
  Serial.println("=====================================");
}

void playDFTrack(uint8_t track, const char *reason) {
  playVoice(track, reason);
}

void publishAck(const char* cmdId, bool ok, const char* message) {
  if (!mqttClient.connected()) return;
  
  StaticJsonDocument<256> doc;
  doc["id"] = cmdId;
  doc["ok"] = ok;
  doc["message"] = message;
  
  String topic = "smartbox/" + String(DEVICE_ID) + "/ack";
  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topic.c_str(), buffer);
}

void publishEvent(const char* level, const char* type, const char* message) {
  if (!mqttClient.connected()) return;
  
  StaticJsonDocument<256> doc;
  doc["level"] = level;
  doc["type"] = type;
  doc["message"] = message;
  
  String topic = "smartbox/" + String(DEVICE_ID) + "/event";
  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topic.c_str(), buffer);
}

void turnBluetoothOn() {
  bluetoothState = true;
  setAudioPower(true);
  playVoice(TRACK_BLUETOOTH_ACTIVE, "bluetooth_on");
  publishEvent("INFO", "bluetooth.on", "Bluetooth diaktifkan");
}

void turnBluetoothOff() {
  bluetoothState = false;
  playVoice(TRACK_BLUETOOTH_OFF, "bluetooth_off");
  audioPowerOffAt = millis() + 2500; // Turn off audio power after 2.5 seconds
  publishEvent("INFO", "bluetooth.off", "Bluetooth dimatikan");
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

  int mq2Value = analogRead(MQ2_PIN);
  float tempC = rtcReady ? rtc.getTemperature() : 28.0;
  bool pirNow = (digitalRead(PIR_PIN) == HIGH);

  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["gasEnabled"] = gasEnabled;
  doc["gasRaw"] = mq2Value;
  doc["gasLevel"] = (mq2Value > 2000) ? "gas" : ((mq2Value > MQ2_GAS_THRESHOLD) ? "smoke" : "normal");
  doc["tempEnabled"] = temperatureEnabled;
  doc["temperatureC"] = tempC;
  doc["pirDetected"] = pirNow;
  doc["obstacleNear"] = (digitalRead(IR_PIN) == LOW);
  doc["rtcReady"] = rtcReady;
  doc["lcdReady"] = lcdReady;
  doc["dfPlayerReady"] = dfPlayerReady;
  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  doc["bluetoothRelay"] = bluetoothState;
  doc["buzzer"] = buzzerState;

  char buffer[512];
  serializeJson(doc, buffer);
  
  String topic = "smartbox/" + String(DEVICE_ID) + "/telemetry";
  mqttClient.publish(topic.c_str(), buffer);
}

void reconnectMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  static unsigned long lastReconnectAttempt = 0;
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  Serial.print("[MQTT] Attempting connection...");
  String clientId = "SmartBoxDevice-";
  clientId += String(random(0xffff), HEX);
  
  String willTopic = "smartbox/" + String(DEVICE_ID) + "/status";
  String willMessage = "{\"online\":false,\"deviceId\":\"" + String(DEVICE_ID) + "\"}";
  
  if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, willTopic.c_str(), 1, true, willMessage.c_str())) {
    Serial.println("connected");
    String cmdTopic = "smartbox/" + String(DEVICE_ID) + "/cmd";
    mqttClient.subscribe(cmdTopic.c_str());
    
    String statusTopic = "smartbox/" + String(DEVICE_ID) + "/status";
    String statusMessage = "{\"online\":true,\"deviceId\":\"" + String(DEVICE_ID) + "\"}";
    mqttClient.publish(statusTopic.c_str(), statusMessage.c_str(), true);
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.print("[MQTT] Message arrived [");
  Serial.print(topic);
  Serial.println("]");

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("deserializeJson() failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char* cmdId = doc["id"];
  const char* cmdType = doc["type"];
  JsonObject payloadObj = doc["payload"];

  if (!cmdType) return;

  Serial.printf("[MQTT] Cmd type: %s\n", cmdType);

  bool success = false;
  String responseMsg = "";

  if (strcmp(cmdType, "relay.set") == 0) {
    int relayNum = payloadObj["relay"];
    bool state = payloadObj["state"];
    int autoOffSeconds = payloadObj["autoOffSeconds"];
    
    if (relayNum == 1) {
      setRelay1(state);
      success = true;
      responseMsg = "Relay 1 set success";
    } else if (relayNum == 2) {
      setRelay2(state);
      success = true;
      responseMsg = "Relay 2 set success";
    }
  }
  else if (strcmp(cmdType, "bluetooth.set") == 0) {
    bool state = payloadObj["state"];
    if (state) {
      turnBluetoothOn();
    } else {
      turnBluetoothOff();
    }
    success = true;
    responseMsg = "Bluetooth state set success";
  }
  else if (strcmp(cmdType, "buzzer.set") == 0) {
    bool state = payloadObj["state"];
    setBuzzer(state);
    success = true;
    responseMsg = "Buzzer state set success";
  }
  else if (strcmp(cmdType, "voice.play") == 0) {
    int track = payloadObj["track"];
    const char* reason = payloadObj["reason"];
    playVoice(track, reason ? reason : "mqtt_cmd");
    success = true;
    responseMsg = "Voice play success";
  }
  else if (strcmp(cmdType, "gasSensor.set") == 0) {
    gasEnabled = payloadObj["enabled"];
    success = true;
  }
  else if (strcmp(cmdType, "tempSensor.set") == 0) {
    temperatureEnabled = payloadObj["enabled"];
    success = true;
  }
  else if (strcmp(cmdType, "pirSensor.set") == 0) {
    pirEnabled = payloadObj["enabled"];
    success = true;
  }
  else if (strcmp(cmdType, "sleepMode.set") == 0) {
    sleepModeEnabled = payloadObj["enabled"];
    success = true;
  }

  if (cmdId) {
    publishAck(cmdId, success, responseMsg.c_str());
  }
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
  if (state) {
    relay1TurnedOnAt = millis();
    relay1AutoOffActive = true;
    relay1AutoOffAt = millis() + 60000UL;
    setLcdOverride("STOP KONTAK 1", "ON 1 MENIT", 4000);
  } else {
    relay1TurnedOnAt = 0;
    relay1AutoOffActive = false;
    setLcdOverride("STOP KONTAK 1", "OFF", 3000);
  }

  Serial.print("[RELAY 1] ");
  Serial.println(state ? "ON" : "OFF");
}

void setRelay2(bool state) {
  relay2State = state;
  digitalWrite(RELAY_2_PIN, state ? RELAY_ON : RELAY_OFF);
  if (state) {
    relay2TurnedOnAt = millis();
    relay2AutoOffActive = true;
    relay2AutoOffAt = millis() + 60000UL;
    setLcdOverride("STOP KONTAK 2", "ON 1 MENIT", 4000);
  } else {
    relay2TurnedOnAt = 0;
    relay2AutoOffActive = false;
    setLcdOverride("STOP KONTAK 2", "OFF", 3000);
  }

  Serial.print("[RELAY 2] ");
  Serial.println(state ? "ON" : "OFF");
}

void setRelay(int relayNum, bool state) {
  if (relayNum == 1) {
    setRelay1(state);
  } else if (relayNum == 2) {
    setRelay2(state);
  }
}

void checkRelayAutoOff() {
  unsigned long now = millis();

  if (relay1AutoOffActive && now >= relay1AutoOffAt) {
    relay1AutoOffActive = false;
    setRelay(1, false);
    setLcdOverride("STOP KONTAK 1", "AUTO OFF", 3000);
    publishEvent("INFO", "relay1.auto_off", "Stop Kontak 1 otomatis mati setelah 1 menit.");
  }

  if (relay2AutoOffActive && now >= relay2AutoOffAt) {
    relay2AutoOffActive = false;
    setRelay(2, false);
    setLcdOverride("STOP KONTAK 2", "AUTO OFF", 3000);
    publishEvent("INFO", "relay2.auto_off", "Stop Kontak 2 otomatis mati setelah 1 menit.");
  }
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
  if (millis() - lastMq2CheckAt < 1000) return;
  lastMq2CheckAt = millis();

  int mq2Value = analogRead(MQ2_PIN);
  bool isDanger = (mq2Value > 2000);
  bool isWarning = (mq2Value > MQ2_GAS_THRESHOLD && mq2Value <= 2000);

  if (isDanger || isWarning) {
    if (!gasAlertActive || (millis() - lastGasVoiceAt >= GAS_VOICE_COOLDOWN_MS)) {
      gasAlertActive = true;
      lastGasVoiceAt = millis();

      if (isDanger) {
        Serial.println("[MQ2] GAS BERBAHAYA TERDETEKSI!");
        playVoice(TRACK_GAS_DETECTED, "gas_detected");
        publishEvent("CRITICAL", "gas.detected", "Gas berbahaya terdeteksi!");
      } else {
        Serial.println("[MQ2] ASAP TERDETEKSI!");
        playVoice(TRACK_SMOKE_DETECTED, "smoke_detected");
        publishEvent("WARNING", "smoke.detected", "Asap terdeteksi!");
      }
      beep();
    }
  } else {
    if (gasAlertActive) {
      gasAlertActive = false;
      Serial.println("[MQ2] Gas/asap kembali normal.");
      lcdShow("GAS NORMAL", "AMAN");
      publishEvent("INFO", "gas.cleared", "Gas dan asap kembali normal.");
      delay(1500);
    }
  }
}

void checkTemperature() {
  if (!temperatureEnabled || !rtcReady) return;

  float tempC = rtc.getTemperature();
  if (tempC >= 35.0) {
    if (millis() - lastTempVoiceAt >= TEMP_VOICE_COOLDOWN_MS) {
      lastTempVoiceAt = millis();
      Serial.println("[TEMP] Suhu tinggi terdeteksi!");
      playVoice(TRACK_TEMP_DETECTED, "temperature_detected");
      publishEvent("WARNING", "temp.high", "Suhu ruangan terlalu tinggi!");
    }
  }
}

void checkPIR() {
  if (!pirEnabled) return;

  bool pirNow = (digitalRead(PIR_PIN) == HIGH);

  if (pirNow && !lastPirState) {
    Serial.println("[PIR] Gerakan terdeteksi!");
    publishEvent("INFO", "pir.motion", "Gerakan terdeteksi");

    if (millis() - lastPirVoiceAt >= PIR_VOICE_COOLDOWN_MS) {
      lastPirVoiceAt = millis();

      int track = pirTracks[pirGreetingIndex];
      pirGreetingIndex = (pirGreetingIndex + 1) % 3;

      playVoice(track, "pir_greeting");
    }
  }
  lastPirState = pirNow;
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
  bool whiteReading = digitalRead(WHITE_BTN_PIN);
  bool redReading = digitalRead(RED_BTN_PIN);
  unsigned long now = millis();

  // White button debounce
  if (whiteReading != whiteLastReading) {
    whiteLastChangeAt = now;
  }
  whiteLastReading = whiteReading;

  if (now - whiteLastChangeAt >= BLACK_DEBOUNCE_MS) {
    if (whiteReading != whiteStableState) {
      whiteStableState = whiteReading;
      if (whiteStableState == LOW) { // Pressed
        Serial.println("[BUTTON] White pressed -> Perkenalan Aero.");
        playVoice(TRACK_AI_HELLO, "white_hello_aero");
        whiteBtnTrack15PlayAt = millis() + 4000;
      }
    }
  }

  // Red button debounce
  if (redReading != redLastReading) {
    redLastChangeAt = now;
  }
  redLastReading = redReading;

  if (now - redLastChangeAt >= BLACK_DEBOUNCE_MS) {
    if (redReading != redStableState) {
      redStableState = redReading;
      if (redStableState == LOW) { // Pressed
        if (!bluetoothState) {
          turnBluetoothOn();
        } else {
          turnBluetoothOff();
        }
      }
    }
  }
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

  // Configure TLS connection to HiveMQ Cloud without verifying certificate chains
  espClient.setInsecure();

  // Initialize MQTT
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

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
  // Reconnect MQTT if necessary
  if (!mqttClient.connected()) {
    reconnectMqtt();
  }
  mqttClient.loop();

  handleSerialCommand();

  debugDFPlayerEvent();

  checkBlackButton();
  checkOtherButtons();

  checkMQ2();
  checkTemperature();
  checkPIR();
  checkLcdOverride();
  checkRelayAutoOff();
  printSensorStatus();

  // Telemetry publish loop
  if (millis() - lastTelemetryPublishAt >= TELEMETRY_PUBLISH_INTERVAL_MS) {
    lastTelemetryPublishAt = millis();
    publishTelemetry();
  }

  // Non-blocking timer to turn off BT amplifier after track 13 finishes
  if (audioPowerOffAt > 0 && millis() >= audioPowerOffAt) {
    setAudioPower(false);
    audioPowerOffAt = 0;
  }

  // White button intro timer
  if (whiteBtnTrack15PlayAt > 0 && millis() >= whiteBtnTrack15PlayAt) {
    whiteBtnTrack15PlayAt = 0;
    playVoice(TRACK_AI_INTRO, "white_intro_aero");
  }

  delay(5);
}
