import { readFileSync } from "node:fs";

export interface Config {
  port: number;
}

/**
 * Loads the HA add-on options file. This add-on has no meaningful options
 * (the port is fixed via config.yaml's `ports` map, not an option), so this
 * mostly just validates the file is readable and lets `PORT` be overridden
 * for local development.
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

  return { port };
}
