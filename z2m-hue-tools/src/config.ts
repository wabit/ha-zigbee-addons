import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const RUN_INTERVAL_HOURS: Record<string, number> = {
  "6h": 6,
  "12h": 12,
  daily: 24,
  weekly: 24 * 7,
  monthly: 24 * 30,
};

export function runIntervalToHours(runInterval: string): number {
  return RUN_INTERVAL_HOURS[runInterval] ?? RUN_INTERVAL_HOURS.weekly;
}

export interface Config {
  mqtt: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  zigbee2mqtt_topic: string;
  hue_native_control: string;
  hue_power_on_behavior: string;
  hue_power_on_brightness: string;
  hue_power_on_color_temperature: string;
  hue_power_on_color: string;
  apply_to_groups: boolean;
  devices: string[];
  run_interval: string;
  enable_notifications: boolean;
  dry_run: boolean;
  debug: boolean;
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
    hue_native_control: String(parsed.hue_native_control ?? "unchanged"),
    hue_power_on_behavior: String(
      parsed.hue_power_on_behavior ?? "unchanged"
    ),
    hue_power_on_brightness: String(parsed.hue_power_on_brightness ?? ""),
    hue_power_on_color_temperature: String(
      parsed.hue_power_on_color_temperature ?? ""
    ),
    hue_power_on_color: String(parsed.hue_power_on_color ?? ""),
    apply_to_groups: parsed.apply_to_groups !== false,
    devices: Array.isArray(parsed.devices) ? parsed.devices.map(String) : [],
    run_interval: String(parsed.run_interval ?? "weekly"),
    enable_notifications: parsed.enable_notifications !== false,
    dry_run: parsed.dry_run === true,
    debug: parsed.debug === true,
  };
}
