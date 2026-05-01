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

type MqttHandler = (topic: string, payload: Buffer) => void;

export class OtaUpdater {
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
      clientId: `zigbee-ota-updater-${Date.now()}`,
    });

    log.success("Connected to MQTT broker");
  }

  disconnect(): void {
    this.clearHandler();
    this.client?.end();
    this.client = null;
    log.info("Disconnected from MQTT broker");
  }

  /** Set the active message handler, removing any previous one first */
  private setHandler(handler: MqttHandler): void {
    this.clearHandler();
    this.activeHandler = handler;
    this.requireClient().on("message", handler);
  }

  /** Remove the current message handler */
  private clearHandler(): void {
    if (this.activeHandler && this.client) {
      this.client.removeListener("message", this.activeHandler);
      this.activeHandler = null;
    }
  }

  async run(): Promise<UpdateResult[]> {
    await this.connect();
    const results: UpdateResult[] = [];

    try {
      const devices = await this.getDevices();
      const targetDevices = this.filterDevices(devices);

      await this.waitForInProgressUpdates(targetDevices);

      log.info(`Found ${targetDevices.length} device(s) to check for updates`);

      // Phase 1: Check all devices and build the update queue
      const updateQueue: Z2MDevice[] = [];

      for (let i = 0; i < targetDevices.length; i++) {
        const device = targetDevices[i];
        const hasUpdate = await this.checkForUpdate(device);

        if (hasUpdate) {
          updateQueue.push(device);
        }

        if (i < targetDevices.length - 1) {
          await this.sleep(this.config.delay_between_checks * 1000);
        }
      }

      if (updateQueue.length === 0) {
        log.success("All devices are up to date!");
        return results;
      }

      log.info(`\n${updateQueue.length} device(s) queued for update:`);
      for (const d of updateQueue) {
        log.info(`  - ${d.friendly_name}`);
      }

      // Phase 2: Update sequentially from the queue
      for (let i = 0; i < updateQueue.length; i++) {
        const device = updateQueue[i];
        log.info(
          `\nUpdating ${i + 1}/${updateQueue.length}: ${device.friendly_name}...`
        );

        const result = await this.updateDevice(device);
        results.push(result);

        if (i < updateQueue.length - 1) {
          log.info(
            `Waiting ${this.config.delay_between_updates}s to let the mesh stabilize...`
          );
          await this.sleep(this.config.delay_between_updates * 1000);
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

  private async waitForInProgressUpdates(
    devices: Z2MDevice[]
  ): Promise<void> {
    const client = this.requireClient();
    const responseTopic = `${this.baseTopic}/bridge/response/device/ota_update/update`;

    log.info("Checking for in-progress OTA updates...");

    // Build a set of device names for fast lookup
    const deviceNames = new Set(devices.map((d) => d.friendly_name));

    if (deviceNames.size === 0) {
      log.info("No devices to check");
      return;
    }

    // Use a single wildcard subscription — much more reliable than 62
    // individual subscribes. The broker sends all retained messages at once.
    const wildcardTopic = `${this.baseTopic}/+`;

    log.debug(
      `Subscribing to ${wildcardTopic} to check ${deviceNames.size} devices...`
    );

    // Phase 1: Read retained state messages to find any updating device
    const updatingDevice = await new Promise<string | null>((resolve) => {
      const received = new Set<string>();
      let found: string | null = null;

      const scanTimeout = setTimeout(() => {
        log.debug(
          `Received state from ${received.size}/${deviceNames.size} devices`
        );
        cleanup();
        resolve(found);
      }, 5_000);

      const cleanup = () => {
        clearTimeout(scanTimeout);
        this.clearHandler();
        client.unsubscribe(wildcardTopic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        // Only process device state topics, skip bridge subtopics
        if (!t.startsWith(`${this.baseTopic}/`)) return;
        if (t.startsWith(`${this.baseTopic}/bridge`)) return;

        const deviceName = t.slice(this.baseTopic.length + 1);
        if (!deviceNames.has(deviceName)) return;

        received.add(deviceName);

        try {
          const data = JSON.parse(payload.toString()) as {
            update?: { state?: string; progress?: number };
          };

          log.debug(
            `State for "${deviceName}": update.state=${data.update?.state ?? "none"}`
          );

          if (data.update?.state === "updating") {
            found = deviceName;
            log.warn(
              `OTA update in progress for "${deviceName}" (${data.update.progress ?? 0}%)`
            );
          }
        } catch {
          // Not JSON, ignore
        }

        if (received.size >= deviceNames.size) {
          cleanup();
          resolve(found);
        }
      });

      client.subscribe(wildcardTopic);
    });

    if (!updatingDevice) {
      log.info("No in-progress OTA updates detected");
      return;
    }

    // Phase 2: Wait for the in-progress update to complete
    log.info(`Waiting for "${updatingDevice}" to finish updating...`);

    await new Promise<void>((resolve) => {
      const deviceTopic = `${this.baseTopic}/${updatingDevice}`;

      const timeout = setTimeout(() => {
        log.warn(
          `Timed out waiting for "${updatingDevice}" to finish. Proceeding anyway.`
        );
        cleanup();
        resolve();
      }, this.config.update_timeout * 1000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.clearHandler();
        client.unsubscribe(deviceTopic);
        client.unsubscribe(responseTopic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        if (t === deviceTopic) {
          try {
            const data = JSON.parse(payload.toString()) as {
              update?: { state?: string };
            };
            if (data.update?.state && data.update.state !== "updating") {
              log.success(
                `"${updatingDevice}" finished updating (state: ${data.update.state}). Proceeding.`
              );
              cleanup();
              resolve();
            }
          } catch {
            // ignore
          }
        }

        if (t === responseTopic) {
          try {
            const response = JSON.parse(payload.toString()) as {
              data?: { id?: string };
            };
            if (response.data?.id === updatingDevice) {
              log.success(
                `"${updatingDevice}" update response received. Proceeding.`
              );
              cleanup();
              resolve();
            }
          } catch {
            // ignore
          }
        }
      });

      client.subscribe(deviceTopic);
      client.subscribe(responseTopic);
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

  private filterDevices(devices: Z2MDevice[]): Z2MDevice[] {
    if (this.config.devices.length === 0) {
      return devices;
    }

    const requested = new Set(this.config.devices);
    const filtered = devices.filter((d) => requested.has(d.friendly_name));

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
        cleanup();
        resolve(false);
      }, 30_000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.clearHandler();
        client.unsubscribe(responseTopic);
      };

      this.setHandler((t: string, payload: Buffer) => {
        if (t !== responseTopic) return;

        const response = JSON.parse(payload.toString()) as OtaCheckResponse;
        if (response.data?.id !== device.friendly_name) return;

        cleanup();

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
      });

      client.subscribe(responseTopic, (err) => {
        if (err) {
          cleanup();
          log.error(`Subscribe error: ${err.message}`);
          resolve(false);
        }
      });

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
        this.clearHandler();
        client.unsubscribe(responseTopic);
        client.unsubscribe(progressTopic);
      };

      this.setHandler((t: string, payload: Buffer) => {
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
      });

      client.subscribe(responseTopic);
      client.subscribe(progressTopic);

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
