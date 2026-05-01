import type { Config } from "./config.js";
import { HAClient, type EntityState } from "./ha-client.js";
import * as log from "./logger.js";

interface StaleEntity {
  entity_id: string;
  last_updated: string;
  days_stale: number;
  state: string;
}

export interface CycleResult {
  warned: StaleEntity[];
  removed: StaleEntity[];
  removeFailed: { entity_id: string; error: string }[];
  totalChecked: number;
  totalExcluded: number;
}

export class StaleCleaner {
  private excludePatterns: RegExp[];

  constructor(private config: Config) {
    this.excludePatterns = config.exclude_patterns.map(
      (p) => new RegExp(p, "i")
    );
  }

  async run(): Promise<CycleResult> {
    const client = new HAClient();
    await client.connect();

    try {
      return await this.checkAndClean(client);
    } finally {
      client.disconnect();
    }
  }

  private async checkAndClean(client: HAClient): Promise<CycleResult> {
    const states = await client.getStates();
    const now = Date.now();

    const warned: StaleEntity[] = [];
    const toRemove: StaleEntity[] = [];
    let totalExcluded = 0;

    for (const entity of states) {
      // Skip excluded entities
      if (this.isExcluded(entity.entity_id)) {
        totalExcluded++;
        continue;
      }

      // Skip entities that are "unavailable" or "unknown" — these are
      // already flagged by HA and may come back
      const lastUpdated = new Date(entity.last_updated).getTime();
      if (isNaN(lastUpdated)) continue;

      const daysStale = (now - lastUpdated) / (1000 * 60 * 60 * 24);

      if (daysStale >= this.config.stale_remove_days) {
        toRemove.push({
          entity_id: entity.entity_id,
          last_updated: entity.last_updated,
          days_stale: Math.floor(daysStale),
          state: entity.state,
        });
      } else if (daysStale >= this.config.stale_warning_days) {
        warned.push({
          entity_id: entity.entity_id,
          last_updated: entity.last_updated,
          days_stale: Math.floor(daysStale),
          state: entity.state,
        });
      }
    }

    // Log warnings
    if (warned.length > 0) {
      log.warn(`${warned.length} entity(ies) are going stale:`);
      for (const e of warned) {
        log.warn(
          `  ${e.entity_id} — ${e.days_stale}d stale (state: ${e.state})`
        );
      }
    }

    // Remove stale entities
    const removed: StaleEntity[] = [];
    const removeFailed: { entity_id: string; error: string }[] = [];

    if (toRemove.length > 0) {
      log.info(
        `${toRemove.length} entity(ies) exceeded ${this.config.stale_remove_days}d threshold:`
      );

      for (const entity of toRemove) {
        if (this.config.dry_run) {
          log.info(
            `  [DRY RUN] Would remove: ${entity.entity_id} (${entity.days_stale}d stale)`
          );
          removed.push(entity);
        } else {
          try {
            await client.removeEntity(entity.entity_id);
            log.success(
              `  Removed: ${entity.entity_id} (${entity.days_stale}d stale)`
            );
            removed.push(entity);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error(`  Failed to remove ${entity.entity_id}: ${msg}`);
            removeFailed.push({ entity_id: entity.entity_id, error: msg });
          }
        }
      }
    }

    if (warned.length === 0 && toRemove.length === 0) {
      log.success("No stale entities found!");
    }

    // Send a single batched notification
    if (
      this.config.enable_notifications &&
      (warned.length > 0 || removed.length > 0 || removeFailed.length > 0)
    ) {
      await this.sendBatchNotification(
        client,
        warned,
        removed,
        removeFailed
      );
    }

    return {
      warned,
      removed,
      removeFailed,
      totalChecked: states.length,
      totalExcluded,
    };
  }

  private async sendBatchNotification(
    client: HAClient,
    warned: StaleEntity[],
    removed: StaleEntity[],
    removeFailed: { entity_id: string; error: string }[]
  ): Promise<void> {
    const lines: string[] = [];
    const dryLabel = this.config.dry_run ? " (dry run)" : "";

    // Summary line
    const parts: string[] = [];
    if (warned.length > 0) parts.push(`${warned.length} warning(s)`);
    if (removed.length > 0) parts.push(`${removed.length} removed${dryLabel}`);
    if (removeFailed.length > 0)
      parts.push(`${removeFailed.length} failed`);
    const title = `Stale Entity Report: ${parts.join(", ")}`;

    // Warning section
    if (warned.length > 0) {
      lines.push(
        `**⚠️ Stale (${this.config.stale_warning_days}–${this.config.stale_remove_days} days):**`
      );
      for (const e of warned) {
        lines.push(
          `- \`${e.entity_id}\` — ${e.days_stale}d (${e.state})`
        );
      }
      lines.push("");
    }

    // Removed section
    if (removed.length > 0) {
      const label = this.config.dry_run
        ? `**🗑️ Would remove (>${this.config.stale_remove_days} days, dry run):**`
        : `**🗑️ Removed (>${this.config.stale_remove_days} days):**`;
      lines.push(label);
      for (const e of removed) {
        lines.push(
          `- \`${e.entity_id}\` — ${e.days_stale}d (${e.state})`
        );
      }
      lines.push("");
    }

    // Failed section
    if (removeFailed.length > 0) {
      lines.push("**❌ Failed to remove:**");
      for (const e of removeFailed) {
        lines.push(`- \`${e.entity_id}\`: ${e.error}`);
      }
      lines.push("");
    }

    if (this.config.dry_run) {
      lines.push(
        "_Dry run mode is enabled. No entities were actually removed. Disable dry_run in the add-on config to enable removal._"
      );
    }

    try {
      await client.notify(title, lines.join("\n"));
      log.info("Notification sent to Home Assistant");
    } catch (err) {
      log.warn(
        `Failed to send notification: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private isExcluded(entityId: string): boolean {
    // Check exact entity exclusion
    if (this.config.exclude_entities.includes(entityId)) return true;

    // Check domain exclusion
    const domain = entityId.split(".")[0];
    if (this.config.exclude_domains.includes(domain)) return true;

    // Check pattern exclusion
    for (const pattern of this.excludePatterns) {
      if (pattern.test(entityId)) return true;
    }

    return false;
  }
}
