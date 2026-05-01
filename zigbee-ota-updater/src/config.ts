import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface Config {
  mqtt: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  zigbee2mqtt_topic: string;
  delay_between_updates: number;
  update_timeout: number;
  devices: string[];
}

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, "utf-8");

  // Support both JSON (from add-on) and YAML (standalone)
  let parsed: Record<string, unknown>;
  if (path.endsWith(".json")) {
    parsed = JSON.parse(raw);
  } else {
    parsed = parseYaml(raw);
  }

  const mqtt = (parsed.mqtt ?? {}) as Record<string, unknown>;

  return {
    mqtt: {
      host: String(mqtt.host ?? "localhost"),
      port: Number(mqtt.port ?? 1883),
      username: String(mqtt.username ?? ""),
      password: String(mqtt.password ?? ""),
    },
    zigbee2mqtt_topic: String(parsed.zigbee2mqtt_topic ?? "zigbee2mqtt"),
    delay_between_updates: Number(parsed.delay_between_updates ?? 300),
    update_timeout: Number(parsed.update_timeout ?? 3600),
    devices: Array.isArray(parsed.devices) ? parsed.devices.map(String) : [],
  };
}
