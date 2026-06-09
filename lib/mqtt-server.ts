import mqtt from "mqtt";

const brokerUrl = process.env.MQTT_URL || process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const username = process.env.MQTT_USERNAME || process.env.NEXT_PUBLIC_MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD || process.env.NEXT_PUBLIC_MQTT_PASSWORD;

/**
 * Publishes a single message to a given MQTT topic and closes the connection.
 * Used for server-side Next.js API actions (e.g. sending a command to ESP32).
 */
export function publishMessage(topic: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const clientId = `smartbox-server-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 0, // Disable automatic reconnect since it is a one-shot publish
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT Publish Timeout"));
    }, 5000);

    client.on("connect", () => {
      const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
      client.publish(topic, payloadString, { qos: 1, retain: false }, (err) => {
        clearTimeout(timeout);
        client.end(true);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      client.end(true);
      reject(err);
    });
  });
}
