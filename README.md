# Home Assistant Add-ons

Custom Home Assistant add-on repository for home automation tools.

## Add-ons

### [Zigbee OTA Updater](./zigbee-ota-updater)

Sequentially updates Zigbee2MQTT devices over-the-air, one at a time, to avoid overwhelming your Zigbee mesh. Runs on a schedule with HA notifications.

### [Stale Entity Cleaner](./stale-entity-cleaner)

Finds and removes Home Assistant entities that haven't updated in a configurable period. Warns you first, then cleans up after a grace period. Dry run mode enabled by default.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Paste: `https://github.com/wabit/ha-zigbee-addons`
4. Click **Add**

Both add-ons will appear in the store under this repository.
