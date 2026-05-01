# Zigbee OTA Updater

Sequentially updates your Zigbee2MQTT devices over-the-air, one at a time, with configurable delays between updates. This prevents overwhelming your Zigbee mesh during firmware updates.

## How it works

1. Connects to your MQTT broker
2. Fetches the device list from Zigbee2MQTT
3. Checks each device for available OTA firmware updates
4. Updates devices one by one, waiting for each to complete
5. Pauses between updates to let the mesh stabilize
6. Exits when all updates are complete (or no updates are available)

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
| `delay_between_updates` | `300` | Seconds to wait between finishing one update and starting the next. 5 minutes is a good default. |
| `update_timeout` | `3600` | Maximum seconds to wait for a single device update. Some large firmwares can take 45+ minutes. |

### Device List

| Option | Default | Description |
|--------|---------|-------------|
| `devices` | _(empty)_ | List of device friendly names to update, in order. If empty, all devices with available updates will be updated. |

**Tip:** List mains-powered router devices first so the mesh backbone gets updated before battery-powered end devices.

## Usage

1. Configure your MQTT settings and device list in the add-on Configuration tab
2. Click **Start** to run the updater
3. Monitor progress in the **Log** tab
4. The add-on stops automatically when all updates are complete

The add-on has `boot: manual` so it won't start on its own after a reboot. Start it manually when you want to run updates.

## Scheduling

You can trigger the add-on from a Home Assistant automation using the `hassio.addon_start` service:

```yaml
automation:
  - alias: "Weekly Zigbee OTA Updates"
    trigger:
      - platform: time
        at: "03:00:00"
    condition:
      - condition: time
        weekday:
          - sun
    action:
      - service: hassio.addon_start
        data:
          addon: local_zigbee_ota_updater
```

## Troubleshooting

- **"Timeout waiting for device list"**: Make sure Zigbee2MQTT is running and the MQTT topic is correct.
- **"Timeout checking OTA"**: The device may be unreachable or doesn't support OTA. The script will skip it.
- **"Update failed"**: Check the Zigbee2MQTT logs for details. The script will continue with the next device.
- **Connection refused**: Verify your MQTT host, port, username, and password.
