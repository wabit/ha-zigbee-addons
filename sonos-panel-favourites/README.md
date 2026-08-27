# Sonos Panel Favourites - Home Assistant Add-on

A small web app for managing the list of "favourites" (Sonos playlists/radio
stations) shown on a custom ESP32-based Sonos touch panel. Serves the list as
plain, unauthenticated JSON that the panel firmware polls directly over the
local network.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Paste: `https://github.com/wabit/wabits-ha-addons`
4. Click **Add**, then find **Sonos Panel Favourites** in the store and click **Install**

## Configuration

There's nothing to configure — start the add-on and open its Web UI (or
`http://<your-ha-ip>:8099/`) to manage favourites. Each favourite has a
**name**, **image URL**, and **webhook URL**.

See the **Documentation** tab in the add-on for the full JSON contract and
panel integration details.

## Usage

Hit **Start**, then open the Web UI to add favourites. Point your panel
firmware at `http://<your-ha-ip>:8099/favourites.json`.
