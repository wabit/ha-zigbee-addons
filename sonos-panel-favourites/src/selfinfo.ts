import * as log from "./logger.js";

const CONTAINER_PORT_KEY = "8099/tcp"; // matches config.yaml's ports mapping key exactly

let cachedExternalPort: number | null = null;

/**
 * Asks Supervisor what host port it actually mapped this add-on's 8099 to
 * (config.yaml requests 8099, but Supervisor silently remaps it if that
 * port is already taken by something else on the host - this project hit
 * exactly that in testing, ending up on 8089 instead). Used to build a
 * correct externally-reachable URL for uploaded images regardless of
 * whether the admin GUI itself was reached via the direct port or HA's
 * ingress proxy - unlike deriving it from the request's Host header, this
 * is correct either way. Cached for the process lifetime once found;
 * returns null (never throws) if SUPERVISOR_TOKEN is unavailable or the
 * Supervisor API call fails, so callers can fall back gracefully.
 */
export async function getOwnExternalPort(): Promise<number | null> {
  if (cachedExternalPort !== null) return cachedExternalPort;

  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch("http://supervisor/addons/self/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      log.warn(`Supervisor self-info request failed: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { data?: { network?: Record<string, number> } };
    const port = body.data?.network?.[CONTAINER_PORT_KEY];
    if (typeof port !== "number") {
      log.warn(`Supervisor self-info response missing ${CONTAINER_PORT_KEY} mapping`);
      return null;
    }
    cachedExternalPort = port;
    return port;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Could not reach Supervisor for self-info: ${msg}`);
    return null;
  }
}
