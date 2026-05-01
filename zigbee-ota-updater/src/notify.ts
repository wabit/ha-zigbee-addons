import * as log from "./logger.js";

const SUPERVISOR_API = "http://supervisor/core/api";

/**
 * Send a persistent notification to Home Assistant.
 *
 * When running as an add-on with `homeassistant_api: true`, the
 * SUPERVISOR_TOKEN env var is injected automatically by the Supervisor.
 * This gives us access to the HA REST API without any extra config.
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

  try {
    const response = await fetch(
      `${SUPERVISOR_API}/services/persistent_notification/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          message,
          notification_id: `zigbee_ota_${Date.now()}`,
        }),
      }
    );

    if (!response.ok) {
      log.warn(
        `HA notification failed (${response.status}): ${await response.text()}`
      );
    } else {
      log.info(`Notification sent to Home Assistant: ${title}`);
    }
  } catch (err) {
    log.warn(
      `Failed to send HA notification: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
