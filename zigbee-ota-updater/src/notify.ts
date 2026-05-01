import WebSocket from "ws";
import * as log from "./logger.js";

/**
 * Send a persistent notification to Home Assistant via the WebSocket API.
 *
 * Uses the same approach as the stale entity cleaner — connects to the
 * Supervisor's WebSocket proxy, authenticates with SUPERVISOR_TOKEN,
 * sends the notification, and disconnects.
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

  const url = "ws://supervisor/core/websocket";

  return new Promise<void>((resolve) => {
    const ws = new WebSocket(url);
    let authenticated = false;

    const timeout = setTimeout(() => {
      log.warn("Notification timed out");
      ws.close();
      resolve();
    }, 15_000);

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }

      if (msg.type === "auth_ok") {
        authenticated = true;
        ws.send(
          JSON.stringify({
            id: 1,
            type: "call_service",
            domain: "persistent_notification",
            service: "create",
            service_data: {
              title,
              message,
              notification_id: `zigbee_ota_${Date.now()}`,
            },
          })
        );
        return;
      }

      if (msg.type === "auth_invalid") {
        log.warn(`HA auth failed: ${msg.message}`);
        clearTimeout(timeout);
        ws.close();
        resolve();
        return;
      }

      // Response to our service call
      if (authenticated && msg.id === 1) {
        clearTimeout(timeout);
        if (msg.success) {
          log.info(`Notification sent to Home Assistant: ${title}`);
        } else {
          log.warn(
            `HA notification failed: ${msg.error?.message ?? "Unknown error"}`
          );
        }
        ws.close();
        resolve();
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      log.warn(`WebSocket error sending notification: ${err.message}`);
      resolve();
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
