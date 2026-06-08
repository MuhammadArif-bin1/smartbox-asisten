/**
 * SmartBox Assistant ESP32-S3 Sketch
 *
 * Hardware Connections (ESP32-S3 DevKitC-1):
 * - I2C LCD & RTC DS3231: SDA = GPIO 8, SCL = GPIO 9
 * - DFPlayer Mini: TX = GPIO 16 (ESP32 TX -> DFPlayer RX via 1k resistor), RX =
 * GPIO 17 (ESP32 RX -> DFPlayer TX)
 * - MQ-2 Gas Sensor: Analog = GPIO 1
 * - Active Buzzer: GPIO 2
 * - PIR Motion Sensor: GPIO 41
 * - Infrared Obstacle / LDR: GPIO 42
 * - Push Buttons: GPIO 10, 11, 15
 * - Relay 1 (Stop Kontak 1): GPIO 35
 * - Relay 2 (Stop Kontak 2): GPIO 36
 * - Relay 3 (Bluetooth Audio / Ampli): GPIO 37
 * - LED Strip 12V Control: GPIO 18 (PWM / Digital)
 * - Microphone INMP441 (I2S): SCK = GPIO 5, WS = GPIO 6, SD = GPIO 4
 */

#include <ArduinoJson.h>
#include <DFRobotDFPlayerMini.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#define MQTT_MAX_PACKET_SIZE 1024
#include <PubSubClient.h>
#include <RTClib.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <driver/i2s.h>

// ==================== CONFIGURATIONS ====================
const char *ssid = "BAGUS";           // Ganti dengan SSID Wi-Fi Anda
const char *password = "s4sans15675"; // Ganti dengan Password Wi-Fi Anda
const char *mqtt_server =
    "smartbox-asisten.vercel.app.hivemq.cloud"; // Broker HiveMQ Cloud
const int mqtt_port = 8883;                     // Port TLS MQTT
const char *mqtt_user = "smartbox001";          // Username MQTT Cloud
const char *mqtt_password = "smartbox";         // Password MQTT Cloud
const char *device_id = "smartbox-001";         // ID Perangkat dari .env

// URL Endpoint Server Next.js untuk logging Neon DB via Prisma
const char *telemetry_api_url = "http://192.168.1.7:3000/api/telemetry";

// Ambang Batas Sensor
const int GAS_THRESHOLD = 1800; // Sesuai GAS_WARNING_RAW di Next.js

// Pins Definition
#define PIN_GAS 1
#define PIN_BUZZER 2
#define PIN_RELAY_1 35
#define PIN_RELAY_2 36
#define PIN_RELAY_3 37
#define PIN_LED_12V 18
#define PIN_PIR 41
#define PIN_IR_OBSTACLE 42
#define PIN_BUTTON_1 10
#define PIN_BUTTON_2 11
#define PIN_BUTTON_3 15

// I2S Microphone INMP441 Pins
#define I2S_WS 6
#define I2S_SD 4
#define I2S_SCK 5
#define I2S_PORT I2S_NUM_0

// ==================== OBJECTS & STATE ====================
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2); // Alamat I2C umum LCD 16x2
DFRobotDFPlayerMini dfPlayer;

// State Variables
bool rtcReady = false;
bool lcdReady = false;
bool dfPlayerReady = false;
bool voiceMode = true; // Diaktifkan dari Next.js
bool buzzerActive = false;
bool gasEnabled = true;
bool tempEnabled = true;

// Alarm schedules received from database
struct AlarmConfig {
  char id[16];
  int hour;
  int minute;
  int track;
  bool enabled;
  bool triggeredToday;
};
AlarmConfig alarmList[3] = {{"morning", 7, 0, 1, true, false},
                            {"noon", 12, 30, 2, true, false},
                            {"evening", 19, 30, 3, true, false}};

// Periodic timers
unsigned long lastTelemetryPublish = 0;
unsigned long lastTelemetryPost = 0;
const unsigned long publishInterval = 5000; // 5 detik untuk real-time MQTT
const unsigned long postInterval = 30000;   // 30 detik untuk save Neon DB

// Clap Detection State Variables
int32_t sampleBuffer[64];
long runningAverage = 0;
unsigned long lastClapTime = 0;
int clapCount = 0;
const int CLAP_THRESHOLD_FACTOR =
    3; // Sinyal harus 3x lebih keras dari rata-rata
const long MIN_CLAP_VAL =
    50000; // Nilai minimum amplitudo untuk menghindari noise

// ==================== SETUP I2S (MICROPHONE) ====================
void setupI2S() {
  i2s_config_t i2s_config = {.mode =
                                 (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
                             .sample_rate = 16000,
                             .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
                             .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
                             .communication_format = I2S_COMM_FORMAT_STAND_I2S,
                             .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
                             .dma_buf_count = 8,
                             .dma_buf_len = 64,
                             .use_apll = false};

  i2s_pin_config_t pin_config = {.bck_io_num = I2S_SCK,
                                 .ws_io_num = I2S_WS,
                                 .data_out_num = I2S_PIN_NO_CHANGE,
                                 .data_in_num = I2S_SD};

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
}

// ==================== RELAY CONTROL WITH VOICE FEEDBACK ====================
void controlRelay(int pin, bool state, const char *name,
                  bool playVoiceAlert = true) {
  bool prevState = (digitalRead(pin) == HIGH);
  if (prevState != state) {
    digitalWrite(pin, state ? HIGH : LOW);
    Serial.printf("[RELAY] %s diatur ke %s\n", name, state ? "ON" : "OFF");

    // Sesuai alur brainstorming: jika relay 1 atau 2 di-on/off, berikan
    // peringatan suara
    if (playVoiceAlert && dfPlayerReady &&
        (pin == PIN_RELAY_1 || pin == PIN_RELAY_2)) {
      // Pastikan Bluetooth Ampli (Relay 3) menyala agar speaker aktif memutar
      // suara
      digitalWrite(PIN_RELAY_3, HIGH);
      delay(400); // Jeda kecil agar amplifier menyala penuh sebelum suara
                  // berbunyi

      if (state) {
        dfPlayer.play(6); // Track 006_selamat_datang / sistem hidup
      } else {
        dfPlayer.play(7); // Track 007_sistem_mati
      }
    }
  }
}

// ==================== WI-FI & MQTT ====================

void setupWifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting Wifi");

  WiFi.begin(ssid, password);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connection failed! Starting offline mode.");
    lcd.setCursor(0, 1);
    lcd.print("Offline Mode");
  }
  delay(1500);
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.print("Message arrived on topic [");
  Serial.print(topic);
  Serial.println("]");

  // Parse JSON payload
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("JSON Deserialization failed: ");
    Serial.println(error.c_str());
    return;
  }

  // MQTT payloads are wrapped in: { source: "smartbox-web", sentAt: "...",
  // data: { ... } }
  JsonObject data = doc["data"];
  if (data.isNull()) {
    data = doc.as<JsonObject>(); // Fallback if data is at root
  }

  if (strcmp(topic, "smartbox/relay/set") == 0) {
    const char *relay = data["relay"];
    bool enabled = data["enabled"];

    if (strcmp(relay, "socket_1") == 0) {
      controlRelay(PIN_RELAY_1, enabled, "Socket 1", true);
    } else if (strcmp(relay, "socket_2") == 0) {
      controlRelay(PIN_RELAY_2, enabled, "Socket 2", true);
    } else if (strcmp(relay, "bluetooth_ampli") == 0) {
      controlRelay(PIN_RELAY_3, enabled, "Bluetooth Ampli", false);
    }
  } else if (strcmp(topic, "smartbox/buzzer/set") == 0) {
    bool enabled = data["enabled"];
    buzzerActive = enabled;
    digitalWrite(PIN_BUZZER, enabled ? HIGH : LOW);
    Serial.println(enabled ? "Buzzer manual ON" : "Buzzer manual OFF");
  } else if (strcmp(topic, "smartbox/voice/mode") == 0) {
    bool enabled = data["enabled"];
    voiceMode = enabled;
    Serial.print("Voice/Clap mode set to: ");
    Serial.println(enabled ? "ACTIVE" : "INACTIVE");
  } else if (strcmp(topic, "smartbox/alarm/set") == 0) {
    const char *alarmId = data["id"];
    const char *alarmTime = data["time"];
    int track = data["track"];
    bool enabled = data["enabled"];

    // Update matching alarm schedule
    for (int i = 0; i < 3; i++) {
      if (strcmp(alarmList[i].id, alarmId) == 0) {
        alarmList[i].track = track;
        alarmList[i].enabled = enabled;
        alarmList[i].triggeredToday = false;

        // Parse "HH:MM" format
        int h, m;
        if (sscanf(alarmTime, "%d:%d", &h, &m) == 2) {
          alarmList[i].hour = h;
          alarmList[i].minute = m;
          Serial.printf(
              "Alarm '%s' updated in hardware memory: %02d:%02d, track: %d\n",
              alarmId, h, m, track);
        }
        break;
      }
    }
  }
}

void reconnectMqtt() {
  if (WiFi.status() != WL_CONNECTED)
    return;

  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Create client ID based on device_id
    String clientId = "SmartBoxDevice-";
    clientId += String(random(0xffff), HEX);

    // Set Last Will and Testament (LWT) for offline notifications
    String willMessage =
        "{\"online\":false,\"deviceId\":\"" + String(device_id) + "\"}";

    // Connect with username, password, Will topic, Will QoS, Will Retain, Will
    // Message
    if (mqttClient.connect(clientId.c_str(), mqtt_user, mqtt_password,
                           "smartbox/status", 1, true, willMessage.c_str())) {
      Serial.println("connected");
      // Subscribe to topics
      mqttClient.subscribe("smartbox/relay/set");
      mqttClient.subscribe("smartbox/buzzer/set");
      mqttClient.subscribe("smartbox/alarm/set");
      mqttClient.subscribe("smartbox/voice/mode");

      // Publish initial connection online status
      StaticJsonDocument<128> statusDoc;
      statusDoc["online"] = true;
      statusDoc["deviceId"] = device_id;
      char buffer[128];
      serializeJson(statusDoc, buffer);
      mqttClient.publish("smartbox/status", buffer, true);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ==================== SEND DATA TO NEXT.JS & NEON DB ====================
void sendHttpTelemetry(int gasRaw, float tempC, bool gasDetected,
                       bool tempDetected, bool pirDetected, bool obstacleNear) {
  if (WiFi.status() != WL_CONNECTED)
    return;

  HTTPClient http;
  http.begin(telemetry_api_url);
  http.addHeader("Content-Type", "application/json");

  // Create JSON Payload matching Prisma columns
  StaticJsonDocument<256> doc;
  doc["deviceId"] = device_id;
  doc["gasEnabled"] = gasEnabled;
  doc["gasRaw"] = gasRaw;
  doc["gasDetected"] = gasDetected;
  doc["tempEnabled"] = tempEnabled;
  doc["temperatureC"] = tempC;
  doc["flameDetected"] = false; // logic placeholder
  doc["pirDetected"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("Sending HTTP POST telemetry to Next.js...");
  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("HTTP Success response: ");
    Serial.println(response);
  } else {
    Serial.print("Error sending HTTP POST: ");
    Serial.println(httpResponseCode);
  }
  http.end();
}

void publishMqttTelemetry(int gasRaw, float tempC, bool gasDetected,
                          bool pirDetected, bool obstacleNear) {
  if (!mqttClient.connected())
    return;

  StaticJsonDocument<512> doc;
  doc["deviceId"] = device_id;
  doc["gasEnabled"] = gasEnabled;
  doc["gasRaw"] = gasRaw;
  doc["gasDetected"] = gasDetected;
  doc["tempEnabled"] = tempEnabled;
  doc["temperatureC"] = tempC;
  doc["flameDetected"] = false;
  doc["pirDetected"] = pirDetected;
  doc["obstacleNear"] = obstacleNear;
  doc["rtcReady"] = rtcReady;
  doc["lcdReady"] = lcdReady;
  doc["dfPlayerReady"] = dfPlayerReady;

  char buffer[512];
  serializeJson(doc, buffer);
  mqttClient.publish("smartbox/telemetry", buffer);
}

// ==================== CLAP DETECTION ====================
void checkClaps() {
  if (!voiceMode)
    return;

  size_t bytesRead = 0;
  i2s_read(I2S_PORT, &sampleBuffer, sizeof(sampleBuffer), &bytesRead,
           0); // non-blocking read

  int numSamples = bytesRead / sizeof(int32_t);
  if (numSamples <= 0)
    return;

  long maxSample = 0;
  long sum = 0;
  for (int i = 0; i < numSamples; i++) {
    long sampleVal = abs(sampleBuffer[i] >>
                         14); // Adjust bit shifts depending on mic sensitivity
    sum += sampleVal;
    if (sampleVal > maxSample) {
      maxSample = sampleVal;
    }
  }

  long currentAverage = sum / numSamples;
  // Slowly adjust running average of sound level
  runningAverage = (runningAverage * 0.98) + (currentAverage * 0.02);

  unsigned long now = millis();

  // Detect sound spike
  if (maxSample > (runningAverage * CLAP_THRESHOLD_FACTOR) &&
      maxSample > MIN_CLAP_VAL && (now - lastClapTime > 150)) {
    Serial.printf("Sound Peak Detected: %ld (Average: %ld)\n", maxSample,
                  runningAverage);
    lastClapTime = now;
    clapCount++;
  }

  // Handle claps timeout (evaluate clap window 500ms after last peak)
  if (clapCount > 0 && (now - lastClapTime > 500)) {
    if (clapCount == 1) {
      // 1 Clap -> TURN OFF Sockets and LED
      Serial.println("[CLAP] Single Clap -> Turning Sockets and Lights OFF!");
      controlRelay(PIN_RELAY_1, LOW, "Socket 1", false);
      controlRelay(PIN_RELAY_2, LOW, "Socket 2", false);
      digitalWrite(PIN_LED_12V, LOW);

      // Berikan peringatan suara "Sistem Mati"
      digitalWrite(PIN_RELAY_3, HIGH);
      delay(400);
      if (dfPlayerReady) {
        dfPlayer.play(7); // Track 007_sistem_mati.mp3
      }
    } else if (clapCount >= 2) {
      // 2 Claps -> TURN ON Sockets and LED
      Serial.println("[CLAP] Double Clap -> Turning Sockets and Lights ON!");
      controlRelay(PIN_RELAY_1, HIGH, "Socket 1", false);
      controlRelay(PIN_RELAY_2, HIGH, "Socket 2", false);
      digitalWrite(PIN_LED_12V, HIGH);

      // Berikan peringatan suara "Sistem Hidup"
      digitalWrite(PIN_RELAY_3, HIGH);
      delay(400);
      if (dfPlayerReady) {
        dfPlayer.play(6); // Track 006_sistem_hidup.mp3
      }
    }
    clapCount = 0;
  }
}

// ==================== MAIN FUNCTIONS ====================
void setup() {
  Serial.begin(115200);

  // Initialize output pins
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  pinMode(PIN_RELAY_3, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_12V, OUTPUT);

  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW);
  digitalWrite(PIN_RELAY_3, LOW);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED_12V, LOW);

  // Initialize input pins
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_IR_OBSTACLE, INPUT);
  pinMode(PIN_BUTTON_1, INPUT_PULLUP);
  pinMode(PIN_BUTTON_2, INPUT_PULLUP);
  pinMode(PIN_BUTTON_3, INPUT_PULLUP);

  // Start I2C (SDA = 8, SCL = 9)
  Wire.begin(8, 9);

  // Initialize LCD 16x2
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SmartBox Initial");
  lcdReady = true;

  // Initialize RTC DS3231
  if (!rtc.begin()) {
    Serial.println("RTC DS3231 not detected!");
    rtcReady = false;
  } else {
    Serial.println("RTC DS3231 connected.");
    rtcReady = true;
    if (rtc.lostPower()) {
      rtc.adjust(
          DateTime(F(__DATE__), F(__TIME__))); // set time to compilation time
    }
  }

  // Initialize DFPlayer Mini on Serial2 (RX = 17, TX = 16)
  Serial2.begin(9600, SERIAL_8N1, 17, 16);
  if (!dfPlayer.begin(Serial2)) {
    Serial.println("DFPlayer Mini not detected!");
    dfPlayerReady = false;
  } else {
    Serial.println("DFPlayer Mini connected.");
    dfPlayerReady = true;
    dfPlayer.volume(22); // Volume range 0-30
  }

  // Initialize I2S Microphone
  setupI2S();

  // Connect Wi-Fi
  setupWifi();

  // Configure TLS connection to HiveMQ Cloud without verifying certificate
  // chains (insecure mode)
  espClient.setInsecure();

  // Initialize MQTT
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SmartBox Ready");
}

void loop() {
  // Reconnect MQTT if necessary
  if (!mqttClient.connected()) {
    reconnectMqtt();
  }
  mqttClient.loop();

  unsigned long currentMillis = millis();

  // 1. Check sound claps (microphone INMP441)
  checkClaps();

  // 2. Read Sensors
  int gasRaw = analogRead(PIN_GAS);
  float tempC = rtcReady ? rtc.getTemperature() : 28.0;
  bool gasWarning = gasEnabled && (gasRaw >= GAS_THRESHOLD);
  bool tempWarning = tempEnabled && (tempC > 37.0);
  bool pirDetected = digitalRead(PIN_PIR) == HIGH;
  bool obstacleNear =
      digitalRead(PIN_IR_OBSTACLE) == LOW; // Low = object detected

  // 3. Local warning buzzer & audio playback
  if (gasWarning || tempWarning) {
    digitalWrite(PIN_BUZZER, HIGH); // Sound local buzzer

    // Sesuai alur brainstorming: Hidupkan Bluetooth Ampli (Relay 3) agar
    // speaker aktif memutar suara
    digitalWrite(PIN_RELAY_3, HIGH);

    // Play warning audio via DFPlayer if not already playing
    static unsigned long lastVoiceWarning = 0;
    if (currentMillis - lastVoiceWarning > 10000 && dfPlayerReady) {
      delay(400); // Jeda kecil agar amplifier menyala penuh sebelum suara
                  // berbunyi
      if (gasWarning) {
        dfPlayer.play(4); // Track 004_asap_terdeteksi.mp3
      } else {
        dfPlayer.play(5); // Track 005_suhu_panas.mp3
      }
      lastVoiceWarning = currentMillis;
    }
  } else if (!buzzerActive) {
    digitalWrite(PIN_BUZZER, LOW);
  }

  // 4. Check RTC Time and Alarm schedules
  if (rtcReady) {
    DateTime now = rtc.now();

    // Reset triggered flag at midnight
    if (now.hour() == 0 && now.minute() == 0) {
      for (int i = 0; i < 3; i++) {
        alarmList[i].triggeredToday = false;
      }
    }

    // Evaluate alarm rules
    for (int i = 0; i < 3; i++) {
      if (alarmList[i].enabled && !alarmList[i].triggeredToday) {
        if (now.hour() == alarmList[i].hour &&
            now.minute() == alarmList[i].minute) {
          Serial.printf("ALARM TRIGGERED: %s, track: %d\n", alarmList[i].id,
                        alarmList[i].track);

          // Trigger outputs
          digitalWrite(PIN_LED_12V, HIGH); // turn board light ON
          digitalWrite(PIN_BUZZER, HIGH);  // buzz

          // Sesuai alur brainstorming: Hidupkan Bluetooth Ampli (Relay 3) agar
          // speaker aktif memutar suara
          digitalWrite(PIN_RELAY_3, HIGH);
          delay(400); // Jeda kecil agar amplifier menyala penuh sebelum suara
                      // berbunyi

          if (dfPlayerReady) {
            dfPlayer.play(alarmList[i].track); // Play alarm MP3
          }

          alarmList[i].triggeredToday = true;
        }
      }
    }

    // LCD display cycle: show time and temperature
    static unsigned long lastLcdUpdate = 0;
    if (currentMillis - lastLcdUpdate > 2000) {
      lcd.setCursor(0, 0);
      lcd.printf("Time: %02d:%02d:%02d  ", now.hour(), now.minute(),
                 now.second());
      lcd.setCursor(0, 1);
      lcd.printf("T:%0.1fC Gas:%d  ", tempC, gasRaw);
      lastLcdUpdate = currentMillis;
    }
  }

  // 5. Publish real-time data to MQTT
  if (currentMillis - lastTelemetryPublish > publishInterval) {
    publishMqttTelemetry(gasRaw, tempC, gasWarning, pirDetected, obstacleNear);
    lastTelemetryPublish = currentMillis;
  }

  // 6. Post historical logs to Next.js API (Neon DB) - Disabled since MQTT
  // Worker handles DB writes
  /*
  if (currentMillis - lastTelemetryPost > postInterval) {
    sendHttpTelemetry(gasRaw, tempC, gasWarning, tempWarning, pirDetected,
                      obstacleNear);
    lastTelemetryPost = currentMillis;
  }
  */

  // 7. Push button controls (manual overrides)
  if (digitalRead(PIN_BUTTON_1) == LOW) {
    // Button 1: Toggle Socket 1
    controlRelay(PIN_RELAY_1, !digitalRead(PIN_RELAY_1), "Socket 1", true);
    delay(300); // Debounce
  }
  if (digitalRead(PIN_BUTTON_2) == LOW) {
    // Button 2: Toggle Socket 2
    controlRelay(PIN_RELAY_2, !digitalRead(PIN_RELAY_2), "Socket 2", true);
    delay(300); // Debounce
  }
  if (digitalRead(PIN_BUTTON_3) == LOW) {
    // Button 3: Toggle Bluetooth speaker relay
    controlRelay(PIN_RELAY_3, !digitalRead(PIN_RELAY_3), "Bluetooth Ampli",
                 false);
    delay(300); // Debounce
  }
}
