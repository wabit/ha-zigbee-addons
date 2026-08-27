import express, { type Express, type Request } from "express";
import {
  addFavourite,
  deleteFavourite,
  editFavourite,
  loadFavourites,
  listRooms,
  moveFavourite,
  syncFromDiscovered,
  type FavouriteInput,
  type MoveDirection,
} from "./store.js";
import { fetchAreas } from "./ha.js";
import { discoverFromLabel } from "./discover.js";
import type { Config } from "./config.js";
import { renderIndex } from "./views.js";
import * as log from "./logger.js";

function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface ValidatedInput extends FavouriteInput {
  errors: string[];
}

function validate(body: Request["body"]): ValidatedInput {
  const name = String(body?.name ?? "").trim();
  const image_url = String(body?.image_url ?? "").trim();
  const webhook_url = String(body?.webhook_url ?? "").trim();
  const room = String(body?.room ?? "").trim();

  const errors: string[] = [];
  if (!name) errors.push("Name is required.");
  if (!image_url || !looksLikeUrl(image_url)) {
    errors.push("Image URL must be a valid http(s) URL.");
  }
  if (!webhook_url || !looksLikeUrl(webhook_url)) {
    errors.push("Webhook URL must be a valid http(s) URL.");
  }
  // room is intentionally optional - see store.ts's Favourite.room doc comment.

  return { name, image_url, webhook_url, room, errors };
}

export function createServer(config: Config): Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get("/", async (req, res) => {
    const areas = await fetchAreas();
    const added = Number(req.query.added ?? 0);
    const updated = Number(req.query.updated ?? 0);
    const syncNotice =
      added > 0 || updated > 0
        ? `Synced from Home Assistant: ${added} added, ${updated} updated.`
        : req.query.synced === "1"
          ? "Synced from Home Assistant: nothing new found."
          : undefined;
    res.type("html").send(renderIndex(loadFavourites(), [], areas, listRooms(), syncNotice));
  });

  // Public, unauthenticated JSON feed for the panel firmware. ?room=<area_id>
  // filters to that room/area only; omit it to get everything (used by the
  // admin GUI, and as a reasonable default for a single-panel setup).
  app.get("/favourites.json", (req, res) => {
    const room = typeof req.query.room === "string" ? req.query.room : undefined;
    res.json(loadFavourites(room));
  });

  app.post("/add", async (req, res) => {
    const { errors, ...input } = validate(req.body);
    if (errors.length > 0) {
      const areas = await fetchAreas();
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), errors, areas, listRooms()));
      return;
    }

    const favourite = await addFavourite(input);
    log.info(`Added favourite "${favourite.name}" (${favourite.id})`);
    res.redirect("/");
  });

  app.post("/edit/:id", async (req, res) => {
    const { errors, ...input } = validate(req.body);
    if (errors.length > 0) {
      const areas = await fetchAreas();
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), errors, areas, listRooms()));
      return;
    }

    const found = await editFavourite(req.params.id, input);
    if (!found) {
      res.status(404).type("text").send("Favourite not found");
      return;
    }
    log.info(`Updated favourite "${input.name}" (${req.params.id})`);
    res.redirect("/");
  });

  app.post("/delete/:id", async (req, res) => {
    await deleteFavourite(req.params.id);
    log.info(`Deleted favourite ${req.params.id}`);
    res.redirect("/");
  });

  app.post("/sync", async (_req, res) => {
    const discovered = await discoverFromLabel(config.haBaseUrl);
    const { added, updated } = await syncFromDiscovered(discovered);
    log.info(`Sync from HA: ${added} added, ${updated} updated`);
    res.redirect(`/?added=${added}&updated=${updated}&synced=1`);
  });

  app.post("/move/:id/:direction", async (req, res) => {
    const direction = req.params.direction;
    if (direction !== "up" && direction !== "down") {
      res.status(400).type("text").send("Invalid direction");
      return;
    }

    const found = await moveFavourite(req.params.id, direction as MoveDirection);
    if (!found) {
      res.status(404).type("text").send("Favourite not found");
      return;
    }
    res.redirect("/");
  });

  return app;
}
