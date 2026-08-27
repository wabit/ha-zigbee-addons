# Changelog

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
