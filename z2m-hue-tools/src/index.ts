import { resolve } from "node:path";
import { loadConfig, runIntervalToHours } from "./config.js";
import { HueToolsRunner } from "./hue-tools.js";
import { notifyHA } from "./notify.js";
import * as log from "./logger.js";

const configPath = process.argv[2] ?? "config.yaml";

log.info("Z2M Hue Tools");
log.info("=============\n");

const config = loadConfig(resolve(configPath));
const intervalHours = runIntervalToHours(config.run_interval);

log.setDebug(config.debug);

log.info(`MQTT broker: ${config.mqtt.host}:${config.mqtt.port}`);
log.info(`Z2M topic: ${config.zigbee2mqtt_topic}`);
log.info(`Apply to groups: ${config.apply_to_groups ? "yes" : "no"}`);
log.info(`Run interval: ${config.run_interval} (${intervalHours}h)`);
log.info(`Notifications: ${config.enable_notifications ? "enabled" : "disabled"}`);
log.info(`Dry run: ${config.dry_run ? "enabled" : "disabled"}`);

if (config.devices.length > 0) {
  log.info(`Target devices: ${config.devices.join(", ")}`);
} else {
  log.info("Target devices: ALL Hue devices (auto-discover)");
}

console.log();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runCycle(): Promise<void> {
  log.info("Starting apply cycle...");

  try {
    const runner = new HueToolsRunner(config);
    const results = await runner.run();

    if (results.length > 0 && config.enable_notifications) {
      const applied = results.filter((r) => r.success && !r.skipped);
      const skipped = results.filter((r) => r.skipped);
      const failed = results.filter((r) => !r.success);

      const lines: string[] = [];

      if (applied.length > 0) {
        lines.push("**Applied:**");
        for (const r of applied) {
          lines.push(`- ✅ ${r.kind === "group" ? "Group" : "Device"}: ${r.target}`);
        }
      }

      if (skipped.length > 0) {
        lines.push("**Dry run (not applied):**");
        for (const r of skipped) {
          lines.push(`- 🔍 ${r.kind === "group" ? "Group" : "Device"}: ${r.target}`);
        }
      }

      if (failed.length > 0) {
        lines.push("**Failed:**");
        for (const r of failed) {
          lines.push(`- ❌ ${r.kind === "group" ? "Group" : "Device"}: ${r.target}: ${r.error ?? "Unknown error"}`);
        }
      }

      await notifyHA(
        `Z2M Hue Tools: ${applied.length} applied, ${failed.length} failed`,
        lines.join("\n")
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Cycle failed: ${msg}`);

    if (config.enable_notifications) {
      await notifyHA("Z2M Hue Tools: Error", `Apply cycle failed: ${msg}`);
    }
  }
}

// Main loop
while (true) {
  await runCycle();

  const nextRun = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
  log.info(
    `Next run in ${intervalHours}h (at ${nextRun.toISOString()})`
  );
  await sleep(intervalHours * 60 * 60 * 1000);
}
