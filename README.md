# Wabit's Home Assistant Add-ons

Custom Home Assistant add-on repository for home automation tools.

## Add-ons

### [Zigbee OTA Updater](./zigbee-ota-updater)

Sequentially updates Zigbee2MQTT devices over-the-air, one at a time, to avoid overwhelming your Zigbee mesh. Runs on a schedule with HA notifications.

### [Stale Entity Cleaner](./stale-entity-cleaner)

Finds and removes Home Assistant entities that haven't updated in a configurable period. Warns you first, then cleans up after a grace period. Dry run mode enabled by default.

### [Sonos Panel Favourites](./sonos-panel-favourites)

Web GUI for managing Sonos playlist/radio favourites, served as unauthenticated JSON at `http://<your-ha-ip>:8099/favourites.json` for a custom ESP32 touch panel to consume directly.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Paste: `https://github.com/wabit/wabits-ha-addons`
4. Click **Add**

All three add-ons will appear in the store under this repository.
