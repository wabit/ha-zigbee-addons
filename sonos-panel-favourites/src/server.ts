import express, { type Express, type Request, type Response } from "express";
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
import { UPLOADS_DIR, uploadMiddleware, buildUploadUrl, deleteUploadedFileIfOwned } from "./uploads.js";
import type { Config } from "./config.js";
import { renderIndex } from "./views.js";
import * as log from "./logger.js";

/** Wraps multer's callback-style middleware in a promise so an upload
 * error (bad file type, too large) is just another catchable failure in
 * the route handler below, alongside the rest of this file's validation
 * errors - rather than needing a separate 4-arg Express error-handling
 * middleware for this one case. */
function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    uploadMiddleware(req, res, (err: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    });
  });
}

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

function validate(body: Request["body"], hasFile: boolean): ValidatedInput {
  const name = String(body?.name ?? "").trim();
  const image_url = String(body?.image_url ?? "").trim();
  const webhook_url = String(body?.webhook_url ?? "").trim();
  const room = String(body?.room ?? "").trim();

  const errors: string[] = [];
  if (!name) errors.push("Name is required.");
  // An uploaded file (checked separately, before validate() is even called
  // - see runUpload()) satisfies the image requirement on its own, so the
  // text field only needs to be a valid URL when no file was uploaded.
  if (!hasFile && (!image_url || !looksLikeUrl(image_url))) {
    errors.push("Image URL must be a valid http(s) URL, or upload an image file instead.");
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

  // Every res.redirect() below deliberately uses a RELATIVE reference
  // (".", "..", or "../..", optionally with a query string appended)
  // instead of an absolute "/" - when this add-on is viewed through HA's
  // ingress proxy, the browser's real address bar URL has an
  // /api/hassio_ingress/<token>/ prefix that Supervisor strips before the
  // request reaches this Express app, so this app never sees it and has no
  // way to reconstruct it. An absolute "/" redirect (or an absolute-path
  // <form action="/x">, see views.ts) resolves against the browser's real
  // URL and lands on HA's own root instead of back in this add-on - a 404,
  // since HA has no route there. A relative reference lets the browser
  // resolve it against whatever URL it's actually looking at (ingress-
  // prefixed or not), landing back here either way.
  //
  // IMPORTANT: "." means "the current URL's directory", which depends on
  // how many path segments the REQUEST had, not on anything about the
  // route definition. POST /add (one segment) → "." correctly resolves to
  // "/". POST /edit/<id> (two segments) → "." resolves to "/edit/" (the
  // id's own "directory"), NOT "/" - this shipped as a real bug once
  // already (redirected to "/edit/" with no id, a 404) precisely because
  // "." was copy-pasted onto a route one directory deeper than /add
  // without re-deriving it. Each route below uses however many "../" its
  // own path segment count actually requires - work it out per-route
  // rather than assuming "." is always correct.

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

  // Uploaded tile images (see uploads.ts). Public/unauthenticated, same
  // reasoning as /favourites.json - the panel has no way to hold an auth
  // token, and these images are exactly what it needs to fetch directly.
  app.use("/uploads", express.static(UPLOADS_DIR));

  app.post("/add", async (req, res) => {
    try {
      await runUpload(req, res);
    } catch (err) {
      const areas = await fetchAreas();
      const message = err instanceof Error ? err.message : "Upload failed.";
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), [message], areas, listRooms()));
      return;
    }

    const { errors, ...input } = validate(req.body, Boolean(req.file));
    if (errors.length > 0) {
      const areas = await fetchAreas();
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), errors, areas, listRooms()));
      return;
    }
    if (req.file) {
      input.image_url = await buildUploadUrl(config.haBaseUrl, req.file.filename);
    }

    const favourite = await addFavourite(input);
    log.info(`Added favourite "${favourite.name}" (${favourite.id})`);
    res.redirect(".");
  });

  app.post("/edit/:id", async (req, res) => {
    try {
      await runUpload(req, res);
    } catch (err) {
      const areas = await fetchAreas();
      const message = err instanceof Error ? err.message : "Upload failed.";
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), [message], areas, listRooms()));
      return;
    }

    const { errors, ...input } = validate(req.body, Boolean(req.file));
    if (errors.length > 0) {
      const areas = await fetchAreas();
      res
        .status(400)
        .type("html")
        .send(renderIndex(loadFavourites(), errors, areas, listRooms()));
      return;
    }

    const previous = loadFavourites().find((f) => f.id === req.params.id);
    if (req.file) {
      input.image_url = await buildUploadUrl(config.haBaseUrl, req.file.filename);
      // Replacing an uploaded image with a new one - clean up the old file
      // rather than leaving it orphaned on the persistent volume forever.
      if (previous && previous.image_url && previous.image_url !== input.image_url) {
        deleteUploadedFileIfOwned(previous.image_url);
      }
    }

    const found = await editFavourite(req.params.id, input);
    if (!found) {
      res.status(404).type("text").send("Favourite not found");
      return;
    }
    log.info(`Updated favourite "${input.name}" (${req.params.id})`);
    // ".." not "." - the request path here is "/edit/<id>", two segments
    // deep, so "." (current directory) resolves to "/edit/" (the id's own
    // "directory"), not the site root. See the comment above createServer()
    // for the ingress reasoning; this route just needs one more "../" to
    // actually reach root given its extra path segment.
    res.redirect("..");
  });

  app.post("/delete/:id", async (req, res) => {
    const existing = loadFavourites().find((f) => f.id === req.params.id);
    if (existing) deleteUploadedFileIfOwned(existing.image_url);
    await deleteFavourite(req.params.id);
    log.info(`Deleted favourite ${req.params.id}`);
    res.redirect(".."); // same reasoning as /edit/:id above
  });

  app.post("/sync", async (_req, res) => {
    const discovered = await discoverFromLabel(config.haBaseUrl);
    const { added, updated } = await syncFromDiscovered(discovered);
    log.info(`Sync from HA: ${added} added, ${updated} updated`);
    res.redirect(`.?added=${added}&updated=${updated}&synced=1`);
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
    // "../.." - request path is "/move/<id>/<direction>", three segments
    // deep, needs two levels up to reach root. Same reasoning as
    // /edit/:id's comment above.
    res.redirect("../..");
  });

  return app;
}
