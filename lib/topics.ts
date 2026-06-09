export const telemetryTopic = (deviceId: string) => `smartbox/${deviceId}/telemetry`;
export const eventTopic = (deviceId: string) => `smartbox/${deviceId}/event`;
export const ackTopic = (deviceId: string) => `smartbox/${deviceId}/ack`;
export const commandTopic = (deviceId: string) => `smartbox/${deviceId}/cmd`;
export const statusTopic = (deviceId: string) => `smartbox/${deviceId}/status`;
