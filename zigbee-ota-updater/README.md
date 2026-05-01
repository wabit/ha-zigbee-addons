# Zigbee OTA Updater - Home Assistant Add-on

Sequentially updates Zigbee2MQTT devices over-the-air, one at a time, to avoid overwhelming your Zigbee mesh.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**

2. Click the **⋮** menu (top right) → **Repositories**

3. Paste: `https://github.com/wabit/ha-zigbee-addons`

4. Click **Add**, then find **Zigbee OTA Updater** in the store and click **Install**

## Configuration

After installing, go to the add-on's **Configuration** tab. You'll see a form with:

- **MQTT settings** — host, port, username, password
- **Zigbee2MQTT topic** — usually `zigbee2mqtt`
- **Delay between updates** — seconds to wait between devices (default: 300)
- **Update timeout** — max seconds per device update (default: 3600)
- **Devices** — optional ordered list of device friendly names

See the **Documentation** tab in the add-on for full details.

## Usage

Hit **Start** and watch the **Log** tab. The add-on will check all devices (or your specified list), update them one by one, and stop when done.
