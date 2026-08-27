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

export interface Favourite {
  id: string;
  name: string;
  image_url: string;
  webhook_url: string;
  order: number;
}

export interface FavouriteInput {
  name: string;
  image_url: string;
  webhook_url: string;
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

function nextOrder(favourites: Favourite[]): number {
  if (favourites.length === 0) return 0;
  return Math.max(...favourites.map((f) => f.order)) + 1;
}

/** Returns all favourites, sorted by `order` ascending. */
export function loadFavourites(): Favourite[] {
  return readAll().sort((a, b) => a.order - b.order);
}

export function addFavourite(input: FavouriteInput): Promise<Favourite> {
  return withLock(() => {
    const favourites = loadFavourites();
    const favourite: Favourite = {
      id: randomBytes(4).toString("hex"),
      ...input,
      order: nextOrder(favourites),
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

    favourite.name = input.name;
    favourite.image_url = input.image_url;
    favourite.webhook_url = input.webhook_url;
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
    const index = favourites.findIndex((f) => f.id === id);
    if (index === -1) return false;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= favourites.length) return true;

    const a = favourites[index];
    const b = favourites[swapIndex];
    const order = a.order;
    a.order = b.order;
    b.order = order;
    writeAll(favourites);
    return true;
  });
}
