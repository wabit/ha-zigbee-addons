import mqtt from "mqtt";
import type { Config } from "./config.js";
import * as log from "./logger.js";

interface Z2MDevice {
  friendly_name: string;
  ieee_address: string;
  type: string;
  definition?: {
    model: string;
    vendor: string;
  };
}

interface OtaCheckResponse {
  data: {
    id: string;
    update_available: boolean;
  };
  status: string;
  error?: string;
}

interface OtaUpdateResponse {
  data: {
    id: string;
    from: { software_build_id: string } | null;
    to: { software_build_id: string } | null;
  };
  status: string;
  error?: string;
}

interface OtaProgressPayload {
  progress: number;
  remaining: number;
}

export interface UpdateResult {
  device: string;
  success: boolean;
  error?: string;
}

export class OtaUpdater {
  private client: mqtt.MqttClient | null = null;
  private baseTopic: string;

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
      clientId: `zigbee-ota-updater-${Date.now()}`,
    });

    log.success("Connected to MQTT broker");
  }

  disconnect(): void {
    this.client?.end();
    this.client = null;
    log.info("Disconnected from MQTT broker");
  }

  /**
   * Run a single check-and-update cycle.
   * Returns a list of devices that were updated (or failed).
   */
  async run(): Promise<UpdateResult[]> {
    await this.connect();
    const results: UpdateResult[] = [];

    try {
      const devices = await this.getDevices();
      const targetDevices = this.filterDevices(devices);

      log.info(`Found ${targetDevices.length} device(s) to check for updates`);

      const devicesWithUpdates: Z2MDevice[] = [];

      // Phase 1: Check which devices have updates available
      for (const device of targetDevices) {
        const hasUpdate = await this.checkForUpdate(device);
        if (hasUpdate) {
          devicesWithUpdates.push(device);
        }
        // Pause between checks to avoid flooding the mesh
        await this.sleep(this.config.delay_between_checks * 1000);
      }

      if (devicesWithUpdates.length === 0) {
        log.success("All devices are up to date!");
        return results;
      }

      log.info(
        `${devicesWithUpdates.length} device(s) have updates available:`
      );
      for (const d of devicesWithUpdates) {
        log.info(`  - ${d.friendly_name}`);
      }

      // Phase 2: Update sequentially
      for (let i = 0; i < devicesWithUpdates.length; i++) {
        const device = devicesWithUpdates[i];
        log.info(
          `\nUpdating device ${i + 1}/${devicesWithUpdates.length}: ${device.friendly_name}`
        );

        const result = await this.updateDevice(device);
        results.push(result);

        // Delay between updates (skip after the last one)
        if (i < devicesWithUpdates.length - 1) {
          const delaySec = this.config.delay_between_updates;
          log.info(
            `Waiting ${delaySec}s before next update to let the mesh stabilize...`
          );
          await this.sleep(delaySec * 1000);
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      log.success(
        `\nCycle complete! ${succeeded} updated, ${failed} failed out of ${results.length} device(s).`
      );
    } finally {
      this.disconnect();
    }

    return results;
  }

  private async getDevices(): Promise<Z2MDevice[]> {
    const client = this.requireClient();
    const topic = `${this.baseTopic}/bridge/devices`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for device list")),
        15_000
      );

      client.subscribe(topic, (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      client.on("message", (t, payload) => {
        if (t === topic) {
          clearTimeout(timeout);
          client.unsubscribe(topic);
          const devices = JSON.parse(payload.toString()) as Z2MDevice[];
          // Filter out the coordinator
          resolve(devices.filter((d) => d.type !== "Coordinator"));
        }
      });
    });
  }

  private filterDevices(devices: Z2MDevice[]): Z2MDevice[] {
    if (this.config.devices.length === 0) {
      return devices;
    }

    const requested = new Set(this.config.devices);
    const filtered = devices.filter((d) => requested.has(d.friendly_name));

    // Preserve the order from config
    filtered.sort(
      (a, b) =>
        this.config.devices.indexOf(a.friendly_name) -
        this.config.devices.indexOf(b.friendly_name)
    );

    const found = new Set(filtered.map((d) => d.friendly_name));
    for (const name of requested) {
      if (!found.has(name)) {
        log.warn(`Device "${name}" from config not found in Zigbee2MQTT`);
      }
    }

    return filtered;
  }

  private async checkForUpdate(device: Z2MDevice): Promise<boolean> {
    const client = this.requireClient();
    const requestTopic = `${this.baseTopic}/bridge/request/device/ota_update/check`;
    const responseTopic = `${this.baseTopic}/bridge/response/device/ota_update/check`;

    log.info(`Checking OTA for: ${device.friendly_name}...`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log.warn(`Timeout checking OTA for ${device.friendly_name}, skipping`);
        client.unsubscribe(responseTopic);
        resolve(false);
      }, 30_000);

      client.subscribe(responseTopic, (err) => {
        if (err) {
          clearTimeout(timeout);
          log.error(`Subscribe error: ${err.message}`);
          resolve(false);
        }
      });

      const handler = (t: string, payload: Buffer) => {
        if (t !== responseTopic) return;

        const response = JSON.parse(payload.toString()) as OtaCheckResponse;
        if (response.data?.id !== device.friendly_name) return;

        clearTimeout(timeout);
        client.unsubscribe(responseTopic);
        client.removeListener("message", handler);

        if (response.status === "error") {
          log.warn(
            `OTA check failed for ${device.friendly_name}: ${response.error}`
          );
          resolve(false);
          return;
        }

        if (response.data.update_available) {
          log.info(`Update available for ${device.friendly_name}`);
          resolve(true);
        } else {
          log.info(`${device.friendly_name} is up to date`);
          resolve(false);
        }
      };

      client.on("message", handler);

      client.publish(
        requestTopic,
        JSON.stringify({ id: device.friendly_name })
      );
    });
  }

  private async updateDevice(device: Z2MDevice): Promise<UpdateResult> {
    const client = this.requireClient();
    const requestTopic = `${this.baseTopic}/bridge/request/device/ota_update/update`;
    const responseTopic = `${this.baseTopic}/bridge/response/device/ota_update/update`;
    const progressTopic = `${this.baseTopic}/${device.friendly_name}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        log.error(
          `Timeout updating ${device.friendly_name} after ${this.config.update_timeout}s`
        );
        resolve({
          device: device.friendly_name,
          success: false,
          error: `Timeout after ${this.config.update_timeout}s`,
        });
      }, this.config.update_timeout * 1000);

      const cleanup = () => {
        clearTimeout(timeout);
        client.unsubscribe(responseTopic);
        client.unsubscribe(progressTopic);
        client.removeListener("message", handler);
      };

      const handler = (t: string, payload: Buffer) => {
        // Handle progress updates
        if (t === progressTopic) {
          try {
            const data = JSON.parse(
              payload.toString()
            ) as Partial<OtaProgressPayload>;
            if (data.progress !== undefined) {
              log.progress(device.friendly_name, data.progress);
            }
          } catch {
            // Not a JSON payload or not a progress message, ignore
          }
          return;
        }

        // Handle completion
        if (t === responseTopic) {
          const response = JSON.parse(
            payload.toString()
          ) as OtaUpdateResponse;
          if (response.data?.id !== device.friendly_name) return;

          cleanup();
          console.log(); // newline after progress

          if (response.status === "error") {
            log.error(
              `Update failed for ${device.friendly_name}: ${response.error}`
            );
            resolve({
              device: device.friendly_name,
              success: false,
              error: response.error,
            });
            return;
          }

          log.success(`${device.friendly_name} updated successfully`);
          resolve({ device: device.friendly_name, success: true });
        }
      };

      client.subscribe(responseTopic);
      client.subscribe(progressTopic);
      client.on("message", handler);

      client.publish(
        requestTopic,
        JSON.stringify({ id: device.friendly_name })
      );
    });
  }

  private requireClient(): mqtt.MqttClient {
    if (!this.client) {
      throw new Error("MQTT client not connected");
    }
    return this.client;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
