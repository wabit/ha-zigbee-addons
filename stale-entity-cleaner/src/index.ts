import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { StaleCleaner } from "./cleaner.js";
import * as log from "./logger.js";

const configPath = process.argv[2] ?? "config.json";

log.info("Stale Entity Cleaner");
log.info("====================\n");

const config = loadConfig(resolve(configPath));

log.info(`Warning threshold: ${config.stale_warning_days} days`);
log.info(`Removal threshold: ${config.stale_remove_days} days`);
log.info(`Check interval: ${config.check_interval_hours}h`);
log.info(`Dry run: ${config.dry_run ? "YES — no entities will be removed" : "NO — stale entities will be removed"}`);
log.info(`Notifications: ${config.enable_notifications ? "enabled" : "disabled"}`);

if (config.exclude_domains.length > 0) {
  log.info(`Excluded domains: ${config.exclude_domains.join(", ")}`);
}
if (config.exclude_entities.length > 0) {
  log.info(`Excluded entities: ${config.exclude_entities.join(", ")}`);
}
if (config.exclude_patterns.length > 0) {
  log.info(`Excluded patterns: ${config.exclude_patterns.join(", ")}`);
}

console.log();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runCycle(): Promise<void> {
  log.info("Starting stale entity check...");

  try {
    const cleaner = new StaleCleaner(config);
    const result = await cleaner.run();

    log.info(
      `Checked ${result.totalChecked} entities (${result.totalExcluded} excluded)`
    );
    log.info(
      `Warned: ${result.warned.length}, Removed: ${result.removed.length}, Failed: ${result.removeFailed.length}`
    );
  } catch (err) {
    log.error(
      `Cycle failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// Main loop
while (true) {
  await runCycle();

  const nextRun = new Date(
    Date.now() + config.check_interval_hours * 60 * 60 * 1000
  );
  log.info(
    `Next check in ${config.check_interval_hours}h (at ${nextRun.toISOString()})\n`
  );
  await sleep(config.check_interval_hours * 60 * 60 * 1000);
}
