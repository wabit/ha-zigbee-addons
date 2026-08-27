import express, { type Express, type Request } from "express";
import {
  addFavourite,
  deleteFavourite,
  editFavourite,
  loadFavourites,
  moveFavourite,
  type FavouriteInput,
  type MoveDirection,
} from "./store.js";
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

  const errors: string[] = [];
  if (!name) errors.push("Name is required.");
  if (!image_url || !looksLikeUrl(image_url)) {
    errors.push("Image URL must be a valid http(s) URL.");
  }
  if (!webhook_url || !looksLikeUrl(webhook_url)) {
    errors.push("Webhook URL must be a valid http(s) URL.");
  }

  return { name, image_url, webhook_url, errors };
}

export function createServer(): Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (_req, res) => {
    res.type("html").send(renderIndex(loadFavourites()));
  });

  // Public, unauthenticated JSON feed for the panel firmware.
  app.get("/favourites.json", (_req, res) => {
    res.json(loadFavourites());
  });

  app.post("/add", async (req, res) => {
    const { errors, ...input } = validate(req.body);
    if (errors.length > 0) {
      res.status(400).type("html").send(renderIndex(loadFavourites(), errors));
      return;
    }

    const favourite = await addFavourite(input);
    log.info(`Added favourite "${favourite.name}" (${favourite.id})`);
    res.redirect("/");
  });

  app.post("/edit/:id", async (req, res) => {
    const { errors, ...input } = validate(req.body);
    if (errors.length > 0) {
      res.status(400).type("html").send(renderIndex(loadFavourites(), errors));
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
