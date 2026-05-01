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
      // Check if an OTA update is already in progress before starting
      await this.waitForInProgressUpdates();

      const devices = await this.getDevices();
      const targetDevices = this.filterDevices(devices);

      log.info(`Found ${targetDevices.length} device(s) to check for updates`);

      // Single pass: check each device and update immediately if needed
      for (let i = 0; i < targetDevices.length; i++) {
        const device = targetDevices[i];
        const hasUpdate = await this.checkForUpdate(device);

        if (hasUpdate) {
          log.info(`Updating ${device.friendly_name}...`);
          const result = await this.updateDevice(device);
          results.push(result);

          // Delay after an update to let the mesh stabilize
          if (i < targetDevices.length - 1) {
            log.info(
              `Waiting ${this.config.delay_between_updates}s to let the mesh stabilize...`
            );
            await this.sleep(this.config.delay_between_updates * 1000);
          }
        } else {
          // Shorter pause between checks when no update was needed
          if (i < targetDevices.length - 1) {
            await this.sleep(this.config.delay_between_checks * 1000);
          }
        }
      }

      if (results.length === 0) {
        log.success("All devices are up to date!");
      } else {
        const succeeded = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        log.success(
          `\nCycle complete! ${succeeded} updated, ${failed} failed out of ${results.length} device(s).`
        );
      }
    } finally {
      this.disconnect();
    }

    return results;
  }

  /**
   * Check if any device is currently mid-OTA by subscribing to all device
   * topics and looking for progress messages. If one is found, wait for
   * the update response before proceeding.
   */
  private async waitForInProgressUpdates(): Promise<void> {
    const client = this.requireClient();
    const progressWildcard = `${this.baseTopic}/+`;
    const responseTopic = `${this.baseTopic}/bridge/response/device/ota_update/update`;

    log.info("Checking for in-progress OTA updates...");

    return new Promise((resolve) => {
      let inProgressDevice: string | null = null;

      // Listen for 5 seconds to see if any device is sending OTA progress
      const scanTimeout = setTimeout(() => {
        cleanup();
        if (!inProgressDevice) {
          log.info("No in-progress OTA updates detected");
        }
        resolve();
      }, 5_000);

      const cleanup = () => {
        clearTimeout(scanTimeout);
        clearTimeout(waitTimeout);
        client.unsubscribe(progressWildcard);
        client.unsubscribe(responseTopic);
        client.removeListener("message", handler);
      };

      // If we find one in progress, wait up to the update timeout for it
      let waitTimeout: ReturnType<typeof setTimeout>;

      const handler = (t: string, payload: Buffer) => {
        // Skip bridge topics
        if (t.startsWith(`${this.baseTopic}/bridge/`)) return;

        // Check for OTA progress in device messages
        if (t.startsWith(`${this.baseTopic}/`) && !inProgressDevice) {
          try {
            const data = JSON.parse(payload.toString()) as Record<string, unknown>;
            if (typeof data.progress === "number" && data.progress > 0 && data.progress < 100) {
              const deviceName = t.replace(`${this.baseTopic}/`, "");
              inProgressDevice = deviceName;
              clearTimeout(scanTimeout);

              log.warn(
                `OTA update already in progress for "${deviceName}" (${data.progress}%). Waiting for it to finish...`
              );

              // Now wait for the update to complete
              waitTimeout = setTimeout(() => {
                log.warn(
                  `Timed out waiting for in-progress update on "${deviceName}". Proceeding anyway.`
                );
                cleanup();
                resolve();
              }, this.config.update_timeout * 1000);
            }
          } catch {
            // Not JSON, ignore
          }
        }

        // If we're waiting for an in-progress update, watch for completion
        if (inProgressDevice && t === responseTopic) {
          try {
            const response = JSON.parse(payload.toString()) as { data?: { id?: string }; status?: string };
            if (response.data?.id === inProgressDevice) {
              log.success(
                `In-progress update for "${inProgressDevice}" completed. Proceeding with cycle.`
              );
              cleanup();
              resolve();
            }
          } catch {
            // Not JSON, ignore
          }
        }
      };

      client.subscribe(progressWildcard);
      client.subscribe(responseTopic);
      client.on("message", handler);
    });
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
