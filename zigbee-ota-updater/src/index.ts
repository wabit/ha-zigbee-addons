import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { OtaUpdater } from "./updater.js";
import * as log from "./logger.js";

const configPath = process.argv[2] ?? "config.yaml";

log.info("Zigbee OTA Sequential Updater");
log.info("==============================\n");

try {
  const config = loadConfig(resolve(configPath));

  log.info(`MQTT broker: ${config.mqtt.host}:${config.mqtt.port}`);
  log.info(`Z2M topic: ${config.zigbee2mqtt_topic}`);
  log.info(`Delay between updates: ${config.delay_between_updates}s`);
  log.info(`Update timeout: ${config.update_timeout}s`);

  if (config.devices.length > 0) {
    log.info(`Target devices: ${config.devices.join(", ")}`);
  } else {
    log.info("Target devices: ALL (auto-discover)");
  }

  console.log();

  const updater = new OtaUpdater(config);
  await updater.run();
} catch (err) {
  log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
