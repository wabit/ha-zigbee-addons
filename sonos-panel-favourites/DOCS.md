# Sonos Panel Favourites

A small web app for managing the list of "favourites" (Sonos playlists/radio
stations) shown on the Playlists/Radio grid screen of a custom ESP32-based
Sonos control panel.

Each favourite has:

- a **name** (e.g. "Dinner Party Playlist")
- an **image URL** — album art/icon the panel tile displays. The panel
  fetches this image itself; this add-on just stores the URL.
- a **webhook URL** — a Home Assistant webhook (e.g.
  `http://homeassistant.local:8123/api/webhook/abc123`) that the panel calls
  when the tile is tapped. The add-on doesn't know or care what the
  automation behind the webhook does.
- a display **order** used to sort tiles in the grid

You manage the list through a small web GUI. The add-on serves the current
list as JSON at a fixed, unauthenticated HTTP endpoint that the panel
firmware polls directly.

## How it works

1. Start the add-on and open its Web UI (directly on port `8099`, or via
   ingress from the HA sidebar)
2. Add, edit, delete, and reorder favourites through the form
3. The panel firmware fetches `GET /favourites.json` directly over plain
   HTTP — no authentication, since the panel has no way to hold an HA auth
   token
4. When a tile is tapped, the panel issues a request to that favourite's
   `webhook_url` to trigger the corresponding HA automation

## Why a direct port, not just ingress

Home Assistant's ingress proxy requires an authenticated browser session, so
the ESP32 panel (which has no way to hold that session/token) can't use it.
This add-on binds port `8099` directly on the host, so the panel can
plain-HTTP `GET` the JSON with no auth at all. Ingress is *additionally*
enabled so you can also reach the config GUI from the Home Assistant
sidebar, but the direct port is what actually matters for the panel and is
always available regardless of ingress.

## Configuring the panel firmware

Point the ESP32 panel firmware's favourites fetch at:

```
http://<your-ha-ip>:8099/favourites.json
```

Replace `<your-ha-ip>` with your Home Assistant host's IP or hostname (e.g.
`http://192.168.1.50:8099/favourites.json` or
`http://homeassistant.local:8099/favourites.json`). This is a plain,
unauthenticated `GET` — no token or header required.

### Response shape

```json
[
  {
    "id": "a1b2c3d4",
    "name": "Dinner Party Playlist",
    "image_url": "http://homeassistant.local:8123/local/dinner.png",
    "webhook_url": "http://homeassistant.local:8123/api/webhook/abc123",
    "order": 0
  },
  {
    "id": "e5f6a7b8",
    "name": "Kids' Music",
    "image_url": "http://homeassistant.local:8123/local/kids.png",
    "webhook_url": "http://homeassistant.local:8123/api/webhook/def456",
    "order": 1
  }
]
```

The array is always returned sorted by `order` ascending. Field names are
fixed: `id`, `name`, `image_url`, `webhook_url`, `order` — the panel
firmware is written against this exact shape, so it will not change.

## Configuration

This add-on has no configurable options. The port is fixed at `8099` via
the add-on's `ports` mapping, not an add-on option.

## Data storage

Favourites are persisted to `/data/favourites.json` on the add-on's
persistent volume, so they survive add-on restarts and updates.

## Troubleshooting

- **Panel can't reach the feed**: Confirm `http://<your-ha-ip>:8099/favourites.json`
  is reachable from the panel's network — it must be a plain HTTP request to
  the fixed port, not through HA's ingress proxy.
- **"Name is required." / URL validation errors**: The form requires a
  non-empty name and valid `http(s)` URLs for both the image and webhook
  fields. Nothing is saved until all three are valid.
- **Favourites reset after an update**: Data lives on the persistent `/data`
  volume and is not affected by add-on updates. If it was lost, check that
  the add-on's storage wasn't reset/reinstalled.
