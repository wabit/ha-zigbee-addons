import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import multer from "multer";
import { getOwnExternalPort } from "./selfinfo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same /data-with-local-fallback pattern as store.ts's DATA_DIR, so
// uploaded images live on the same persistent volume as favourites.json.
const HA_DATA_DIR = "/data";
const DATA_DIR = existsSync(HA_DATA_DIR) ? HA_DATA_DIR : join(__dirname, "..", "data");
export const UPLOADS_DIR = join(DATA_DIR, "uploads");

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // generous for a single tile thumbnail

function ensureUploadsDir(): void {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Express middleware (apply per-route, only to /add and /edit/:id) that
 * accepts one optional "image_file" multipart field, alongside the
 * existing text fields multer also parses into req.body for a multipart
 * request. Rejects anything that isn't a recognized image extension or
 * exceeds MAX_UPLOAD_BYTES - errors surface via Express's standard error
 * handling (multer calls next(err)), caught by server.ts's route handler. */
export const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadsDir();
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomBytes(8).toString("hex")}${ALLOWED_EXT.has(ext) ? ext : ""}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      cb(new Error("Unsupported image type - use jpg, png, gif, or webp."));
      return;
    }
    cb(null, true);
  },
}).single("image_file");

/** Builds the full, externally-reachable URL for an uploaded file. Uses
 * the configured ha_base_url's hostname (already known to be reachable by
 * the panel - it's the same host the panel's own webhook calls go to)
 * combined with this add-on's own actual external port, fetched from
 * Supervisor via selfinfo.ts. This is correct regardless of whether the
 * admin uploading the image is going through the direct port or HA's
 * ingress proxy - unlike deriving it from the request's Host header,
 * which is only meaningful for the direct-port case. Falls back to
 * config.yaml's configured port (8099) if Supervisor's actual mapping
 * can't be looked up (e.g. running standalone outside a real Supervisor). */
export async function buildUploadUrl(haBaseUrl: string, filename: string): Promise<string> {
  const hostname = new URL(haBaseUrl).hostname;
  const port = (await getOwnExternalPort()) ?? 8099;
  return `http://${hostname}:${port}/uploads/${filename}`;
}

/** Deletes a previously-uploaded file, given the image_url it was served
 * at, so replacing/deleting a favourite's uploaded image doesn't leave an
 * orphaned file behind. Deliberately never throws - called opportunistically
 * as cleanup, not something that should fail the actual request if the
 * file's already gone or the URL doesn't point into our own uploads dir
 * (e.g. it was a plain pasted image_url, not something we ever wrote). */
export function deleteUploadedFileIfOwned(imageUrl: string): void {
  try {
    const url = new URL(imageUrl);
    const marker = "/uploads/";
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return;
    const filename = url.pathname.slice(idx + marker.length);
    if (!filename || filename.includes("/") || filename.includes("..")) return;
    const filePath = join(UPLOADS_DIR, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Not a well-formed absolute URL - nothing we could have written.
  }
}
