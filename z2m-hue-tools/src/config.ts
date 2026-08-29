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
  apply_hue_native_control: boolean;
  hue_native_control: boolean;
  apply_power_on_behavior: boolean;
  hue_power_on_behavior: string;
  apply_power_on_brightness: boolean;
  hue_power_on_brightness: string;
  apply_power_on_color_temperature: boolean;
  hue_power_on_color_temperature: string;
  apply_power_on_color: boolean;
  hue_power_on_color: string;
  apply_to_groups: boolean;
  devices: string[];
  check_interval_hours: number;
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
    apply_hue_native_control: parsed.apply_hue_native_control === true,
    hue_native_control: parsed.hue_native_control !== false,
    apply_power_on_behavior: parsed.apply_power_on_behavior === true,
    hue_power_on_behavior: String(parsed.hue_power_on_behavior ?? "previous"),
    apply_power_on_brightness: parsed.apply_power_on_brightness === true,
    hue_power_on_brightness: String(
      parsed.hue_power_on_brightness ?? "previous"
    ),
    apply_power_on_color_temperature:
      parsed.apply_power_on_color_temperature === true,
    hue_power_on_color_temperature: String(
      parsed.hue_power_on_color_temperature ?? "previous"
    ),
    apply_power_on_color: parsed.apply_power_on_color === true,
    hue_power_on_color: String(parsed.hue_power_on_color ?? ""),
    apply_to_groups: parsed.apply_to_groups !== false,
    devices: Array.isArray(parsed.devices) ? parsed.devices.map(String) : [],
    check_interval_hours: Number(parsed.check_interval_hours ?? 24),
    enable_notifications: parsed.enable_notifications !== false,
    dry_run: parsed.dry_run === true,
    debug: parsed.debug === true,
  };
}
