# Sonos Panel Favourites

A small web app for managing the list of "favourites" (Sonos playlists/radio
stations) shown on the Playlists/Radio grid screen of a custom ESP32-based
Sonos control panel.

Each favourite has:

- a **name** (e.g. "Dinner Party Playlist")
- an **image URL** — album art/icon the panel tile displays. The panel
  fetches this image itself; this add-on just stores the URL. You can paste
  an existing URL, or upload an image file directly from the Add/Edit form
  instead - it's stored on this add-on's own persistent storage and served
  back out as a URL automatically (jpg/png/gif/webp, 8MB max).
- a **webhook URL** — a Home Assistant webhook (e.g.
  `http://homeassistant.local:8123/api/webhook/abc123`) that the panel calls
  when the tile is tapped. The add-on doesn't know or care what the
  automation behind the webhook does.
- an optional **room** — tags the favourite to one of your real Home
  Assistant Areas (or leave it "Unassigned"). Only matters if you have more
  than one panel; see "Multiple panels / rooms" below.
- a display **order** used to sort tiles in the grid, scoped per room

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
fixed: `id`, `name`, `image_url`, `webhook_url`, `room`, `order` — the panel
firmware is written against this exact shape, so it will not change.

## Multiple panels / rooms

Got more than one panel (e.g. one in the kitchen, one in an office)? Tag
each favourite with a Room in the web GUI (a dropdown of your real Home
Assistant Areas), then point each panel at its own filtered feed instead of
the plain URL above:

```
http://<your-ha-ip>:8099/favourites.json?room=office
```

Only favourites tagged with that exact Area are returned. Favourites left
"Unassigned" never show up on a room-filtered feed — only on the unfiltered
one. If you only have one panel, you can ignore rooms entirely and just use
the plain `/favourites.json` URL as before.

The Room field is a real dropdown of your HA Areas whenever the add-on can
reach Home Assistant's area registry (needs `homeassistant_api: true`,
already enabled by default in this add-on's `config.yaml`). If that's ever
unreachable, the field falls back to free text with autocomplete instead of
breaking - useful for running this add-on standalone outside a real HA
Supervisor too (see the main README for local dev instructions).

## Auto-importing favourites from automations

Instead of manually copying webhook URLs into this add-on's form, you can
tag any Home Assistant automation and let it be discovered automatically:

1. In HA, go to **Settings → Automations & Scenes**, open an automation
   that has (or add) a **Webhook** trigger
2. On the automation's settings, add a Label called exactly `sonos_favourite`
   (create it first under **Settings → Areas, labels & zones → Labels** if
   it doesn't exist yet)
3. In this add-on's Web UI, click **Sync from HA**

Every labelled automation with a webhook trigger gets imported as a
favourite (marked with an <code>auto</code> badge), using the automation's
name and a full webhook URL built from `ha_base_url` + the trigger's
webhook ID. Automations with the label but *no* webhook trigger are
silently skipped - there's nothing sensible to do with them here.

Re-clicking **Sync from HA** later refreshes name/webhook URL for anything
already imported (e.g. if you renamed the automation) without touching the
image or room you've since set in the GUI, and picks up any newly-labelled
automations.

## Configuration

| Option | Default | Description |
|---|---|---|
| `ha_base_url` | `http://homeassistant.local:8123` | Base URL used to build full webhook URLs for automations imported via **Sync from HA**. Set this to whatever address the panel(s) can actually reach your HA instance at. |

The port is fixed at `8099` via the add-on's `ports` mapping, not an add-on
option - though Home Assistant Supervisor will silently remap it to a
different host port if `8099` is already taken by something else on your
system (check the add-on's **Info** tab, under "Network", for the actual
port it ended up on if the fixed URLs above don't respond).

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
