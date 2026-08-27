# Changelog

## 1.3.0

- Add/Edit forms now support uploading an image file directly instead of
  pasting a URL - stored on the add-on's persistent volume and served at
  `/uploads/<file>`. Replacing or deleting a favourite's uploaded image
  cleans up the old file automatically.
- The uploaded image's URL is built from your configured `ha_base_url`'s
  hostname plus this add-on's *actual* external port (looked up from
  Supervisor, not just the configured `8099` - correctly accounts for
  Supervisor remapping it to a different port if `8099` was already
  taken). Works correctly whether you're using the direct port or HA's
  ingress proxy to manage favourites - unlike deriving it from the
  request itself, which only works for direct-port access.

## 1.2.1

- Fix: all form actions/links and POST redirects were absolute paths
  (`/sync`, `/add`, etc.), which resolve against the browser's real address
  bar URL - fine when accessed via the direct port, but broken (404) when
  viewed through HA's ingress proxy, since the browser's URL there has an
  `/api/hassio_ingress/<token>/` prefix Supervisor strips before this add-on
  ever sees it. Every action/link/redirect is now a genuinely relative
  reference instead, resolving correctly under both direct and ingress
  access.

## 1.2.0

- New "Sync from HA" button: finds every automation tagged with the HA
  Label `sonos_favourite` that has a webhook trigger, and imports/refreshes
  it as a favourite (name + webhook URL only - image and room are yours to
  set and are never overwritten by a re-sync)
- New `ha_base_url` add-on option (default `http://homeassistant.local:8123`),
  used to build full webhook URLs for synced favourites
- Auto-synced favourites are marked with an "auto" badge in the list

## 1.1.0

- Favourites can now be tagged with a Room, so one add-on can serve multiple
  panels each with their own list
- `GET /favourites.json?room=<area>` filters the feed to just that room;
  omitting `?room=` still returns everything, unchanged from before
- Room field is a dropdown of your real Home Assistant Areas (via the
  Supervisor-proxied WebSocket API, `homeassistant_api: true`), falling back
  to free text with autocomplete if HA's area registry isn't reachable
  (e.g. running standalone outside a real Supervisor)
- Reordering (`move up`/`move down`) is now scoped within a favourite's room

## 1.0.0

- Initial release
- Web GUI for adding, editing, deleting, and reordering favourites
- Public, unauthenticated `GET /favourites.json` feed for the ESP32 panel firmware
- Persists to `/data/favourites.json`, with a local `./data` fallback for standalone testing
- Direct fixed port (`8099`) alongside optional ingress for the config GUI
