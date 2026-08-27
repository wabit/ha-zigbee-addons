import WebSocket from "ws";
import * as log from "./logger.js";

const CONNECT_TIMEOUT_MS = 10_000;

export interface HaArea {
  area_id: string;
  name: string;
}

/**
 * Fetches Home Assistant's real Area registry via the Supervisor-proxied
 * WebSocket API, so favourites can be tagged with an actual HA area
 * instead of a free-typed room name. Returns [] (not a throw) on any
 * failure - callers fall back to a free-text room input, matching this
 * add-on's existing "still usable outside a real HA/Supervisor" ethos
 * (see store.ts's /data fallback).
 */
export async function fetchAreas(): Promise<HaArea[]> {
  const token = process.env.SUPERVISOR_TOKEN;

  if (!token) {
    log.warn(
      "SUPERVISOR_TOKEN not available — falling back to free-text room input. " +
        "Make sure homeassistant_api is enabled in the add-on config."
    );
    return [];
  }

  try {
    return await requestAreaRegistry(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Could not fetch HA areas (${msg}) — falling back to free-text room input.`);
    return [];
  }
}

function requestAreaRegistry(token: string): Promise<HaArea[]> {
  const url = "ws://supervisor/core/websocket";

  return new Promise<HaArea[]>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error, areas?: HaArea[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (err) reject(err);
      else resolve(areas ?? []);
    };

    const timeout = setTimeout(() => {
      done(new Error("Connection timed out"));
    }, CONNECT_TIMEOUT_MS);

    const ws = new WebSocket(url);

    ws.on("upgrade", (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        done(new Error(`HTTP ${response.statusCode} during WebSocket upgrade`));
      }
    });

    ws.on("message", (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }

      if (msg.type === "auth_ok") {
        ws.send(JSON.stringify({ id: 1, type: "config/area_registry/list" }));
        return;
      }

      if (msg.type === "auth_invalid") {
        done(new Error(`Auth failed: ${msg.message}`));
        return;
      }

      if (msg.id === 1 && msg.type === "result") {
        if (msg.success) {
          const raw = (msg.result as Array<Record<string, unknown>>) ?? [];
          const areas: HaArea[] = raw
            .map((a) => ({ area_id: String(a.area_id ?? ""), name: String(a.name ?? "") }))
            .filter((a) => a.area_id)
            .sort((a, b) => a.name.localeCompare(b.name));
          done(undefined, areas);
        } else {
          const errMsg =
            (msg.error as Record<string, unknown>)?.message ?? "Unknown error";
          done(new Error(`area_registry/list failed: ${errMsg}`));
        }
      }
    });

    ws.on("error", (err) => {
      done(new Error(err.message));
    });

    ws.on("close", () => {
      done(new Error("Connection closed unexpectedly"));
    });
  });
}
