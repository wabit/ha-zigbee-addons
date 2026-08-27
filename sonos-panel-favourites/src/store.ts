import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveredFavourite } from "./discover.js";

export interface Favourite {
  id: string;
  name: string;
  image_url: string;
  webhook_url: string;
  /** Free-text room/panel tag (e.g. "office", "kitchen"). Empty string means
   * unassigned - only returned by loadFavourites() when NO room filter is
   * requested, so it won't show up on any panel that filters by room until
   * tagged. Lets one add-on serve multiple panels, each fetching its own
   * ?room=<name> filtered feed. */
  room: string;
  order: number;
  /** Set only for favourites imported via "Sync from HA" (discover.ts) -
   * the HA automation config id they came from. Lets re-sync find and
   * refresh them (name/webhook only) instead of creating duplicates, and
   * lets the GUI show which favourites are HA-managed vs hand-entered.
   * Absent/undefined for manually-created favourites. */
  source_automation_id?: string;
}

export interface FavouriteInput {
  name: string;
  image_url: string;
  webhook_url: string;
  room: string;
}

export type MoveDirection = "up" | "down";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer the HA add-on persistent volume; fall back to a local ./data dir so
// this can be run and tested outside of a container / outside HA entirely.
const HA_DATA_DIR = "/data";
const DATA_DIR = existsSync(HA_DATA_DIR)
  ? HA_DATA_DIR
  : join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "favourites.json");

// Serializes read-modify-write access to the JSON file across concurrent
// requests (Express can handle requests concurrently).
let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => T): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.catch(() => undefined);
  return result;
}

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): Favourite[] {
  ensureDataDir();
  if (!existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Favourite[]) : [];
  } catch {
    return [];
  }
}

function writeAll(favourites: Favourite[]): void {
  ensureDataDir();
  const tmpPath = `${DATA_FILE}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(favourites, null, 2));
  renameSync(tmpPath, DATA_FILE);
}

function nextOrder(favourites: Favourite[], room: string): number {
  const sameRoom = favourites.filter((f) => f.room === room);
  if (sameRoom.length === 0) return 0;
  return Math.max(...sameRoom.map((f) => f.order)) + 1;
}

/** Returns favourites sorted by room then `order` ascending. Pass `room` to
 * filter to exactly that room's favourites (used by the panel's JSON feed);
 * omit it to get everything, room-unassigned included (used by the admin
 * GUI, which needs to show/manage the whole list). */
export function loadFavourites(room?: string): Favourite[] {
  let favourites = readAll();
  if (room !== undefined) {
    favourites = favourites.filter((f) => f.room === room);
  }
  return favourites.sort((a, b) => {
    if (a.room !== b.room) return a.room.localeCompare(b.room);
    return a.order - b.order;
  });
}

/** Distinct room tags currently in use, for the admin GUI's room picker. */
export function listRooms(): string[] {
  const rooms = new Set(readAll().map((f) => f.room).filter((r) => r));
  return Array.from(rooms).sort();
}

export function addFavourite(input: FavouriteInput): Promise<Favourite> {
  return withLock(() => {
    const favourites = loadFavourites();
    const favourite: Favourite = {
      id: randomBytes(4).toString("hex"),
      ...input,
      order: nextOrder(favourites, input.room),
    };
    favourites.push(favourite);
    writeAll(favourites);
    return favourite;
  });
}

export function editFavourite(
  id: string,
  input: FavouriteInput
): Promise<boolean> {
  return withLock(() => {
    const favourites = loadFavourites();
    const favourite = favourites.find((f) => f.id === id);
    if (!favourite) return false;

    const roomChanged = favourite.room !== input.room;
    favourite.name = input.name;
    favourite.image_url = input.image_url;
    favourite.webhook_url = input.webhook_url;
    favourite.room = input.room;
    if (roomChanged) {
      favourite.order = nextOrder(
        favourites.filter((f) => f.id !== id),
        input.room
      );
    }
    writeAll(favourites);
    return true;
  });
}

export function deleteFavourite(id: string): Promise<void> {
  return withLock(() => {
    const favourites = loadFavourites().filter((f) => f.id !== id);
    writeAll(favourites);
  });
}

/** Swaps `order` with the neighbouring favourite to reorder. */
export function moveFavourite(
  id: string,
  direction: MoveDirection
): Promise<boolean> {
  return withLock(() => {
    const favourites = loadFavourites();
    const favourite = favourites.find((f) => f.id === id);
    if (!favourite) return false;

    // Swap within the same room only - `order` is scoped per-room, so
    // swapping across rooms would produce a meaningless number.
    const sameRoom = favourites
      .filter((f) => f.room === favourite.room)
      .sort((a, b) => a.order - b.order);
    const index = sameRoom.findIndex((f) => f.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sameRoom.length) return true;

    const a = sameRoom[index];
    const b = sameRoom[swapIndex];
    const order = a.order;
    a.order = b.order;
    b.order = order;
    writeAll(favourites);
    return true;
  });
}

export interface SyncResult {
  added: number;
  updated: number;
}

/** Merges discover.ts's findings into the stored list. An already-imported
 * favourite (matched by source_automation_id) has its name/webhook_url
 * refreshed in place - image_url/room/order are left exactly as the user
 * set them in the GUI, never overwritten by a re-sync. A newly-discovered
 * automation becomes a brand new favourite, pre-filled with its HA area (if
 * any) as room and an empty image_url (nothing sensible to default that to
 * - the GUI's own empty-thumbnail styling already handles a blank one). */
export function syncFromDiscovered(discovered: DiscoveredFavourite[]): Promise<SyncResult> {
  return withLock(() => {
    const favourites = loadFavourites();
    let added = 0;
    let updated = 0;

    for (const d of discovered) {
      const existing = favourites.find((f) => f.source_automation_id === d.automation_id);
      if (existing) {
        if (existing.name !== d.name || existing.webhook_url !== d.webhook_url) {
          existing.name = d.name;
          existing.webhook_url = d.webhook_url;
          updated++;
        }
      } else {
        favourites.push({
          id: randomBytes(4).toString("hex"),
          name: d.name,
          image_url: "",
          webhook_url: d.webhook_url,
          room: d.area_id,
          order: nextOrder(favourites, d.area_id),
          source_automation_id: d.automation_id,
        });
        added++;
      }
    }

    if (added > 0 || updated > 0) writeAll(favourites);
    return { added, updated };
  });
}
