import WebSocket from "ws";
import * as log from "./logger.js";

/**
 * Home Assistant WebSocket API client.
 *
 * Inside an add-on, the Supervisor exposes the HA WebSocket at
 * ws://supervisor/core/websocket and authenticates via SUPERVISOR_TOKEN.
 *
 * We use the WebSocket API (not REST) because entity registry removal
 * is only available through the WebSocket command `config/entity_registry/remove`.
 */
export class HAClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (err: Error) => void }
  >();

  async connect(): Promise<void> {
    const token = process.env.SUPERVISOR_TOKEN;
    if (!token) {
      throw new Error(
        "SUPERVISOR_TOKEN not available. Make sure homeassistant_api is enabled."
      );
    }

    const url = "ws://supervisor/core/websocket";
    log.info(`Connecting to Home Assistant WebSocket at ${url}...`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());

        // Step 1: HA sends auth_required
        if (msg.type === "auth_required") {
          this.ws!.send(
            JSON.stringify({ type: "auth", access_token: token })
          );
          return;
        }

        // Step 2: HA confirms auth
        if (msg.type === "auth_ok") {
          log.success("Connected to Home Assistant");
          resolve();
          return;
        }

        if (msg.type === "auth_invalid") {
          reject(new Error(`HA auth failed: ${msg.message}`));
          return;
        }

        // Handle responses to our commands
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);

          if (msg.success === false) {
            pending.reject(
              new Error(msg.error?.message ?? "Unknown HA error")
            );
          } else {
            pending.resolve(msg.result);
          }
        }
      });

      this.ws.on("error", (err) => {
        log.error(`WebSocket error: ${err.message}`);
        reject(err);
      });

      this.ws.on("close", () => {
        log.info("WebSocket connection closed");
        this.ws = null;
      });
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private send(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws) throw new Error("Not connected to HA");

    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for response to ${type}`));
      }, 30_000);

      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify({ id, type, ...payload }));
    });
  }

  /** Get all entity states */
  async getStates(): Promise<EntityState[]> {
    const result = await this.send("get_states");
    return result as EntityState[];
  }

  /** Get all entity registry entries */
  async getEntityRegistry(): Promise<EntityRegistryEntry[]> {
    const result = await this.send("config/entity_registry/list");
    return result as EntityRegistryEntry[];
  }

  /** Remove an entity from the registry */
  async removeEntity(entityId: string): Promise<void> {
    await this.send("config/entity_registry/remove", {
      entity_id: entityId,
    });
  }

  /** Send a persistent notification */
  async notify(title: string, message: string): Promise<void> {
    await this.send("call_service", {
      domain: "persistent_notification",
      service: "create",
      service_data: {
        title,
        message,
        notification_id: `stale_entity_cleaner_${Date.now()}`,
      },
    });
  }
}

export interface EntityState {
  entity_id: string;
  state: string;
  last_changed: string;
  last_updated: string;
  attributes: Record<string, unknown>;
}

export interface EntityRegistryEntry {
  entity_id: string;
  unique_id: string;
  platform: string;
  disabled_by: string | null;
}
