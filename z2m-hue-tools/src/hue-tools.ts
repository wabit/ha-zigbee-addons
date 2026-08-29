import mqtt from "mqtt";
import type { Config } from "./config.js";
import * as log from "./logger.js";

interface Z2MDevice {
  friendly_name: string;
  ieee_address: string;
  type: string;
  manufacturer?: string;
  definition?: {
    model: string;
    vendor: string;
  } | null;
}

interface Z2MGroupMember {
  ieee_address: string;
  endpoint: number;
}

interface Z2MGroup {
  id: number;
  friendly_name: string;
  members: Z2MGroupMember[];
}

interface OptionsResponse {
  data: { id: string; restart_required?: boolean };
  status: string;
  error?: string;
}

export interface ApplyResult {
  target: string;
  kind: "device" | "group";
  success: boolean;
  skipped?: boolean;
  error?: string;
}

const HUE_MANUFACTURER_PATTERN = /philips|signify/i;

type MqttHandler = (topic: string, payload: Buffer) => void;

export class HueToolsRunner {
  private client: mqtt.MqttClient | null = null;
  private baseTopic: string;
  private activeHandler: MqttHandler | null = null;

  constructor(private config: Config) {
    this.baseTopic = config.zigbee2mqtt_topic;
  }

  async connect(): Promise<void> {
    const { host, port, username, password } = this.config.mqtt;
    const url = `mqtt://${host}:${port}`;

    log.info(`Connecting to MQTT broker at ${url}...`);

    this.client = await mqtt.connectAsync(url, {
      username: username || undefined,
      password: password || undefined,
      clientId: `z2m-hue-tools-${Date.now()}`,
    });

    log.success("Connected to MQTT broker");
  }

  disconnect(): void {
    this.clearHandler();
    this.client?.end();
    this.client = null;
    log.info("Disconnected from MQTT broker");
  }

  private setHandler(handler: MqttHandler): void {
    this.clearHandler();
    this.activeHandler = handler;
    this.requireClient().on("message", handler);
  }

  private clearHandler(): void {
    if (this.activeHandler && this.client) {
      this.client.removeListener("message", this.activeHandler);
      this.activeHandler = null;
    }
  }

  async run(): Promise<ApplyResult[]> {
    await this.connect();
    const results: ApplyResult[] = [];

    try {
      const hueOptions = this.buildHueOptions();

      if (Object.keys(hueOptions).length === 0) {
        log.warn("No hue_power_on_* options configured, nothing to apply");
        return results;
      }

      log.info(`Options to apply: ${JSON.stringify(hueOptions)}`);

      const devices = await this.getDevices();
      const hueDevices = this.filterHueDevices(devices);

      log.info(
        `Found ${hueDevices.length} Hue device(s) out of ${devices.length} total`
      );

      for (const device of hueDevices) {
        const result = await this.applyDeviceOptions(device, hueOptions);
        results.push(result);
      }

      if (this.config.apply_to_groups) {
        const hueIeeeAddresses = new Set(
          hueDevices.map((d) => d.ieee_address)
        );
        const groups = await this.getGroups();
        const hueGroups = groups.filter((g) =>
          g.members.some((m) => hueIeeeAddresses.has(m.ieee_address))
        );

        log.info(
          `Found ${hueGroups.length} group(s) containing Hue devices out of ${groups.length} total`
        );

        for (const group of hueGroups) {
          const result = await this.applyGroupOptions(group, hueOptions);
          results.push(result);
        }
      }

      const succeeded = results.filter((r) => r.success && !r.skipped).length;
      const failed = results.filter((r) => !r.success).length;
      const skipped = results.filter((r) => r.skipped).length;
      log.success(
        `Run complete! ${succeeded} applied, ${failed} failed, ${skipped} skipped (dry run) out of ${results.length} target(s).`
      );
    } finally {
      this.disconnect();
    }

    return results;
  }

  private buildHueOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    const c = this.config;

    if (c.hue_native_control !== "unchanged") {
      options.hue_native_control = c.hue_native_control === "true";
    }

    if (c.hue_power_on_behavior !== "unchanged") {
      options.hue_power_on_behavior = c.hue_power_on_behavior;
    }

    if (c.hue_power_on_brightness) {
      options.hue_power_on_brightness =
        c.hue_power_on_brightness === "previous"
          ? "previous"
          : Number(c.hue_power_on_brightness);
    }

    if (c.hue_power_on_color_temperature) {
      options.hue_power_on_color_temperature =
        c.hue_power_on_color_temperature === "previous"
          ? "previous"
          : Number(c.hue_power_on_color_temperature);
    }

    if (c.hue_power_on_color) {
      options.hue_power_on_color = c.hue_power_on_color;
    }

    return options;
  }

  private isHueDevice(device: Z2MDevice): boolean {
    return (
      HUE_MANUFACTURER_PATTERN.test(device.manufacturer ?? "") ||
      HUE_MANUFACTURER_PATTERN.test(device.definition?.vendor ?? "")
    );
  }

  private filterHueDevices(devices: Z2MDevice[]): Z2MDevice[] {
    let hueDevices = devices.filter((d) => this.isHueDevice(d));

    if (this.config.devices.length > 0) {
      const requested = new Set(this.config.devices);
      const filtered = hueDevices.filter((d) => requested.has(d.friendly_name));

      const found = new Set(filtered.map((d) => d.friendly_name));
      for (const name of requested) {
        if (!found.has(name)) {
          log.warn(
            `Device "${name}" from config not found among Hue devices in Zigbee2MQTT`
          );
        }
      }

      hueDevices = filtered;
    }

    return hueDevices;
  }

  private async getDevices(): Promise<Z2MDevice[]> {
    const client = this.requireClient();
    const topic = `${this.baseTopic}/bridge/devices`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for device list")),
        15_000
      );

      const cleanup = () => {
        clearTimeout(timeout);
        this.clearHandler();
        client.unsubscribe(topic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        if (t === topic) {
          cleanup();
          const devices = JSON.parse(payload.toString()) as Z2MDevice[];
          resolve(devices.filter((d) => d.type !== "Coordinator"));
        }
      });

      client.subscribe(topic, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  }

  private async getGroups(): Promise<Z2MGroup[]> {
    const client = this.requireClient();
    const topic = `${this.baseTopic}/bridge/groups`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for group list")),
        15_000
      );

      const cleanup = () => {
        clearTimeout(timeout);
        this.clearHandler();
        client.unsubscribe(topic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        if (t === topic) {
          cleanup();
          const groups = JSON.parse(payload.toString()) as Z2MGroup[];
          resolve(groups);
        }
      });

      client.subscribe(topic, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  }

  private async applyDeviceOptions(
    device: Z2MDevice,
    options: Record<string, unknown>
  ): Promise<ApplyResult> {
    if (this.config.dry_run) {
      log.info(`[dry run] Would apply options to device: ${device.friendly_name}`);
      return { target: device.friendly_name, kind: "device", success: true, skipped: true };
    }

    return this.applyOptions(device.friendly_name, "device", options);
  }

  private async applyGroupOptions(
    group: Z2MGroup,
    options: Record<string, unknown>
  ): Promise<ApplyResult> {
    if (this.config.dry_run) {
      log.info(`[dry run] Would apply options to group: ${group.friendly_name}`);
      return { target: group.friendly_name, kind: "group", success: true, skipped: true };
    }

    return this.applyOptions(group.friendly_name, "group", options);
  }

  private async applyOptions(
    id: string,
    kind: "device" | "group",
    options: Record<string, unknown>
  ): Promise<ApplyResult> {
    const client = this.requireClient();
    const requestTopic = `${this.baseTopic}/bridge/request/${kind}/options`;
    const responseTopic = `${this.baseTopic}/bridge/response/${kind}/options`;

    log.info(`Applying options to ${kind}: ${id}...`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log.warn(`Timeout applying options to ${kind} ${id}, skipping`);
        cleanup();
        resolve({ target: id, kind, success: false, error: "Timeout" });
      }, 30_000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.clearHandler();
        client.unsubscribe(responseTopic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        if (t !== responseTopic) return;

        const response = JSON.parse(payload.toString()) as OptionsResponse;
        if (response.data?.id !== id) return;

        cleanup();

        if (response.status === "error") {
          log.error(`Failed to apply options to ${kind} ${id}: ${response.error}`);
          resolve({ target: id, kind, success: false, error: response.error });
          return;
        }

        log.success(`Applied options to ${kind}: ${id}`);
        resolve({ target: id, kind, success: true });
      });

      client.subscribe(responseTopic, (err) => {
        if (err) {
          cleanup();
          log.error(`Subscribe error: ${err.message}`);
          resolve({ target: id, kind, success: false, error: err.message });
        }
      });

      client.publish(requestTopic, JSON.stringify({ id, options }));
    });
  }

  private requireClient(): mqtt.MqttClient {
    if (!this.client) {
      throw new Error("MQTT client not connected");
    }
    return this.client;
  }
}
