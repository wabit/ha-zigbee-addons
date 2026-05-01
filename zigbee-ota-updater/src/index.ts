import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { OtaUpdater } from "./updater.js";
import { notifyHA } from "./notify.js";
import * as log from "./logger.js";

const configPath = process.argv[2] ?? "config.yaml";

log.info("Zigbee OTA Sequential Updater");
log.info("==============================\n");

const config = loadConfig(resolve(configPath));

log.setDebug(config.debug);

log.info(`MQTT broker: ${config.mqtt.host}:${config.mqtt.port}`);
log.info(`Z2M topic: ${config.zigbee2mqtt_topic}`);
log.info(`Delay between updates: ${config.delay_between_updates}s`);
log.info(`Delay between checks: ${config.delay_between_checks}s`);
log.info(`Update timeout: ${config.update_timeout}s`);
log.info(`Check interval: ${config.check_interval_hours}h`);
log.info(`Notifications: ${config.enable_notifications ? "enabled" : "disabled"}`);

if (config.devices.length > 0) {
  log.info(`Target devices: ${config.devices.join(", ")}`);
} else {
  log.info("Target devices: ALL (auto-discover)");
}

console.log();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runCycle(): Promise<void> {
  log.info("Starting update check cycle...");

  try {
    const updater = new OtaUpdater(config);
    const results = await updater.run();

    if (results.length > 0 && config.enable_notifications) {
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      const lines: string[] = [];

      if (succeeded.length > 0) {
        lines.push("**Updated successfully:**");
        for (const r of succeeded) {
          lines.push(`- ✅ ${r.device}`);
        }
      }

      if (failed.length > 0) {
        lines.push("**Failed:**");
        for (const r of failed) {
          lines.push(`- ❌ ${r.device}: ${r.error ?? "Unknown error"}`);
        }
      }

      await notifyHA(
        `Zigbee OTA: ${succeeded.length} updated, ${failed.length} failed`,
        lines.join("\n")
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Cycle failed: ${msg}`);

    if (config.enable_notifications) {
      await notifyHA("Zigbee OTA: Error", `Update cycle failed: ${msg}`);
    }
  }
}

// Main loop
while (true) {
  await runCycle();

  const nextRun = new Date(
    Date.now() + config.check_interval_hours * 60 * 60 * 1000
  );
  log.info(
    `Next check in ${config.check_interval_hours}h (at ${nextRun.toISOString()})`
  );
  await sleep(config.check_interval_hours * 60 * 60 * 1000);
}
