import { readFileSync } from "node:fs";

export interface Config {
  port: number;
  /** Base URL used to build full webhook URLs for auto-discovered
   * favourites (e.g. "http://homeassistant.local:8123") - the add-on
   * itself only ever learns a webhook_id from HA's automation config, not
   * a full externally-reachable URL, so this has to be user-configured. */
  haBaseUrl: string;
}

/**
 * Loads the HA add-on options file. Lets `PORT`/`HA_BASE_URL` be
 * overridden via env vars for local development.
 */
export function loadConfig(path: string): Config {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = readFileSync(path, "utf-8");
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // No options file (e.g. running standalone outside the add-on) — fall
    // back to defaults below.
  }

  const port = Number(process.env.PORT ?? parsed.port ?? 8099);
  const haBaseUrl = String(
    process.env.HA_BASE_URL ?? parsed.ha_base_url ?? "http://homeassistant.local:8123"
  ).replace(/\/+$/, "");

  return { port, haBaseUrl };
}
