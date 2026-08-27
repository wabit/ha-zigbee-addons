import WebSocket from "ws";
import * as log from "./logger.js";

const LABEL_NAME = "sonos_favourite";
const CONNECT_TIMEOUT_MS = 10_000;

export interface DiscoveredFavourite {
  automation_id: string;
  name: string;
  webhook_url: string;
  /** HA area_id, if the automation (or its device) has one assigned - used
   * to pre-fill room on first import only, see store.ts's syncFromDiscovered. */
  area_id: string;
}

/**
 * Finds every automation tagged with the "sonos_favourite" HA Label that
 * also has a webhook trigger, and returns them ready to import as
 * favourites. Automations with the label but no webhook trigger are
 * silently skipped (nothing sensible to do with them here) rather than
 * treated as an error. Returns [] on any failure - same "never breaks the
 * add-on, just skips the feature" philosophy as ha.ts's fetchAreas().
 */
export async function discoverFromLabel(haBaseUrl: string): Promise<DiscoveredFavourite[]> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    log.warn(
      "SUPERVISOR_TOKEN not available — can't sync from HA. " +
        "Make sure homeassistant_api is enabled in the add-on config."
    );
    return [];
  }

  try {
    const ws = await connectAndAuth(token);
    try {
      const labelId = await findLabelId(ws, LABEL_NAME);
      if (!labelId) {
        log.warn(`No HA Label named "${LABEL_NAME}" found — nothing to sync. Create it and tag an automation first.`);
        return [];
      }

      const candidates = await listAutomationsWithLabel(ws, labelId);
      if (candidates.length === 0) {
        log.info(`No automations tagged with the "${LABEL_NAME}" label.`);
        return [];
      }

      const discovered: DiscoveredFavourite[] = [];
      for (const candidate of candidates) {
        const webhookId = await fetchWebhookId(token, candidate.automationId);
        if (!webhookId) {
          log.info(
            `Automation "${candidate.name}" has the "${LABEL_NAME}" label but no webhook trigger — skipping.`
          );
          continue;
        }
        discovered.push({
          automation_id: candidate.automationId,
          name: candidate.name,
          webhook_url: `${haBaseUrl}/api/webhook/${webhookId}`,
          area_id: candidate.areaId,
        });
      }
      return discovered;
    } finally {
      ws.close();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`HA sync failed: ${msg}`);
    return [];
  }
}

function connectAndAuth(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://supervisor/core/websocket");
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(err);
      } else {
        resolve(ws);
      }
    };

    const timeout = setTimeout(() => done(new Error("Connection timed out")), CONNECT_TIMEOUT_MS);

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
      } else if (msg.type === "auth_ok") {
        done();
      } else if (msg.type === "auth_invalid") {
        done(new Error(`Auth failed: ${msg.message}`));
      }
    });

    ws.on("error", (err) => done(new Error(err.message)));
    ws.on("close", () => done(new Error("Connection closed before auth completed")));
  });
}

let nextMsgId = 2; // 1 is reserved for the auth exchange elsewhere

function wsCommand<T>(ws: WebSocket, type: string, extra: Record<string, unknown> = {}): Promise<T> {
  const id = nextMsgId++;
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id !== id || msg.type !== "result") return;
      ws.off("message", onMessage);
      if (msg.success) {
        resolve(msg.result as T);
      } else {
        const errMsg = (msg.error as Record<string, unknown>)?.message ?? "Unknown error";
        reject(new Error(`${type} failed: ${errMsg}`));
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ id, type, ...extra }));
  });
}

async function findLabelId(ws: WebSocket, labelName: string): Promise<string | null> {
  const labels = await wsCommand<Array<Record<string, unknown>>>(ws, "config/label_registry/list");
  const match = labels.find(
    (l) => String(l.name ?? "").toLowerCase() === labelName.toLowerCase() || l.label_id === labelName
  );
  return match ? String(match.label_id) : null;
}

interface AutomationCandidate {
  automationId: string;
  name: string;
  areaId: string;
}

async function listAutomationsWithLabel(ws: WebSocket, labelId: string): Promise<AutomationCandidate[]> {
  const entities = await wsCommand<Array<Record<string, unknown>>>(ws, "config/entity_registry/list");
  const matches = entities.filter((e) => {
    const entityId = String(e.entity_id ?? "");
    const labels = Array.isArray(e.labels) ? (e.labels as string[]) : [];
    return entityId.startsWith("automation.") && labels.includes(labelId);
  });

  return matches.map((e) => ({
    // UI-created automations' entity_registry unique_id IS the automation
    // config's `id` field used by the /api/config/automation/config/<id>
    // REST endpoint - this is the same id the automation editor itself uses.
    automationId: String(e.unique_id ?? ""),
    name: String(e.name ?? e.original_name ?? e.entity_id ?? "Unnamed automation"),
    areaId: String(e.area_id ?? ""),
  })).filter((c) => c.automationId);
}

/** Reads one automation's raw config via HA's REST API (the same one the
 * UI automation editor uses) and returns its webhook trigger's id, if any.
 * Handles both the pre- and post-2024.10 trigger/triggers key rename. */
async function fetchWebhookId(token: string, automationId: string): Promise<string | null> {
  const res = await fetch(
    `http://supervisor/core/api/config/automation/config/${encodeURIComponent(automationId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`GET automation config ${automationId} -> HTTP ${res.status}`);
  }
  const config = (await res.json()) as Record<string, unknown>;
  const triggers = (config.triggers ?? config.trigger ?? []) as Array<Record<string, unknown>>;
  const list = Array.isArray(triggers) ? triggers : [triggers];
  const webhookTrigger = list.find((t) => t?.platform === "webhook" || t?.trigger === "webhook");
  const webhookId = webhookTrigger?.webhook_id;
  return typeof webhookId === "string" && webhookId ? webhookId : null;
}
