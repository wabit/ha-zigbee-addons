# Zigbee OTA Updater

Runs continuously and checks your Zigbee2MQTT devices for OTA firmware updates on a schedule. Updates are applied one at a time with configurable delays to avoid overwhelming your Zigbee mesh. Sends notifications to Home Assistant when devices are updated.

## How it works

1. Connects to your MQTT broker
2. Fetches the device list from Zigbee2MQTT
3. Checks each device for available OTA updates (with a pause between each check)
4. Updates devices one by one, waiting for each to complete
5. Pauses between updates to let the mesh stabilize
6. Sends a Home Assistant notification summarising what was updated
7. Sleeps for the configured interval, then repeats

## Configuration

### MQTT Settings

| Option | Default | Description |
|--------|---------|-------------|
| `mqtt_host` | `core-mosquitto` | MQTT broker hostname. Use `core-mosquitto` for the built-in HA broker. |
| `mqtt_port` | `1883` | MQTT broker port. |
| `mqtt_username` | _(empty)_ | MQTT username. Leave empty if your broker doesn't require auth. |
| `mqtt_password` | _(empty)_ | MQTT password. |

### Update Settings

| Option | Default | Description |
|--------|---------|-------------|
| `zigbee2mqtt_topic` | `zigbee2mqtt` | The base MQTT topic for your Zigbee2MQTT instance. |
| `delay_between_checks` | `10` | Seconds to wait between checking each device for updates. Keeps the mesh calm during discovery. |
| `delay_between_updates` | `300` | Seconds to wait between finishing one update and starting the next. 5 minutes is a good default. |
| `update_timeout` | `3600` | Maximum seconds to wait for a single device update. Some large firmwares can take 45+ minutes. |
| `check_interval_hours` | `24` | Hours between update check cycles. The add-on runs continuously and checks on this schedule. |

### Notifications

| Option | Default | Description |
|--------|---------|-------------|
| `enable_notifications` | `true` | Send a persistent notification to Home Assistant when devices are updated or if an error occurs. |

### Device List

| Option | Default | Description |
|--------|---------|-------------|
| `devices` | _(empty)_ | List of device friendly names to update, in order. If empty, all devices with available updates will be updated. |

**Tip:** List mains-powered router devices first so the mesh backbone gets updated before battery-powered end devices.

## Usage

1. Configure your settings in the add-on **Configuration** tab
2. Click **Start** — the add-on will run its first check immediately
3. Monitor progress in the **Log** tab
4. After each cycle, it sleeps and checks again at the configured interval
5. Updated devices appear as persistent notifications in Home Assistant

Since the add-on runs continuously, you can set `boot: auto` (the default) so it starts with Home Assistant. This also means you can safely disable automatic OTA checks in Zigbee2MQTT and let this add-on handle everything.

## Disabling Zigbee2MQTT's built-in OTA checks

Add this to your Zigbee2MQTT configuration:

```yaml
ota:
  disable_automatic_update_check: true
```

This add-on will handle all OTA checking and updating on its own schedule.

## Troubleshooting

- **"Timeout waiting for device list"**: Make sure Zigbee2MQTT is running and the MQTT topic is correct.
- **"Timeout checking OTA"**: The device may be unreachable or doesn't support OTA. The script will skip it.
- **"Update failed"**: Check the Zigbee2MQTT logs for details. The script will continue with the next device.
- **"SUPERVISOR_TOKEN not available"**: Notifications require `homeassistant_api: true` in the add-on config. This is set by default.
- **Connection refused**: Verify your MQTT host, port, username, and password.
