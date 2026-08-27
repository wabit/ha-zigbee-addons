# Changelog

## 1.0.0

- Initial release
- Web GUI for adding, editing, deleting, and reordering favourites
- Public, unauthenticated `GET /favourites.json` feed for the ESP32 panel firmware
- Persists to `/data/favourites.json`, with a local `./data` fallback for standalone testing
- Direct fixed port (`8099`) alongside optional ingress for the config GUI
