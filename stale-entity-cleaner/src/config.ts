import { readFileSync } from "node:fs";

export interface Config {
  stale_warning_days: number;
  stale_remove_days: number;
  check_interval_hours: number;
  enable_notifications: boolean;
  dry_run: boolean;
  exclude_domains: string[];
  exclude_entities: string[];
  exclude_patterns: string[];
}

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  return {
    stale_warning_days: Number(parsed.stale_warning_days ?? 3),
    stale_remove_days: Number(parsed.stale_remove_days ?? 7),
    check_interval_hours: Number(parsed.check_interval_hours ?? 24),
    enable_notifications: parsed.enable_notifications !== false,
    dry_run: parsed.dry_run !== false,
    exclude_domains: Array.isArray(parsed.exclude_domains)
      ? parsed.exclude_domains.map(String)
      : [],
    exclude_entities: Array.isArray(parsed.exclude_entities)
      ? parsed.exclude_entities.map(String)
      : [],
    exclude_patterns: Array.isArray(parsed.exclude_patterns)
      ? parsed.exclude_patterns.map(String)
      : [],
  };
}
