import WebSocket from "ws";
import * as log from "./logger.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Send a persistent notification to Home Assistant via the WebSocket API.
 * Retries on failure since the Supervisor proxy can be slow during heavy load.
 */
export async function notifyHA(
  title: string,
  message: string
): Promise<void> {
  const token = process.env.SUPERVISOR_TOKEN;

  if (!token) {
    log.warn(
      "SUPERVISOR_TOKEN not available — skipping HA notification. " +
        "Make sure homeassistant_api is enabled in the add-on config."
    );
    return;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sendNotification(token, title, message);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        log.warn(
          `Notification attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${RETRY_DELAY_MS / 1000}s...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        log.warn(
          `Notification failed after ${MAX_RETRIES} attempts: ${msg}. Skipping.`
        );
      }
    }
  }
}

function sendNotification(
  token: string,
  title: string,
  message: string
): Promise<void> {
  const url = "ws://supervisor/core/websocket";

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (err) reject(err);
      else resolve();
    };

    const timeout = setTimeout(() => {
      done(new Error("Connection timed out"));
    }, CONNECT_TIMEOUT_MS);

    const ws = new WebSocket(url);

    ws.on("upgrade", (response) => {
      // Check for HTTP errors during upgrade
      if (response.statusCode && response.statusCode >= 400) {
        done(new Error(`HTTP ${response.statusCode} during WebSocket upgrade`));
      }
    });

    ws.on("open", () => {
      // Connection established, wait for auth_required
    });

    ws.on("message", (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        // Got non-JSON (like HTML error page), ignore
        return;
      }

      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }

      if (msg.type === "auth_ok") {
        ws.send(
          JSON.stringify({
            id: 1,
            type: "call_service",
            domain: "persistent_notification",
            service: "create",
            service_data: {
              title,
              message,
              notification_id: `z2m_hue_tools_${Date.now()}`,
            },
          })
        );
        return;
      }

      if (msg.type === "auth_invalid") {
        done(new Error(`Auth failed: ${msg.message}`));
        return;
      }

      if (msg.id === 1) {
        if (msg.success) {
          log.info(`Notification sent to Home Assistant: ${title}`);
          done();
        } else {
          const errMsg =
            (msg.error as Record<string, unknown>)?.message ?? "Unknown error";
          done(new Error(`Service call failed: ${errMsg}`));
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
