# Z2M Hue Tools

A Home Assistant add-on that applies Hue/Philips-specific device options —
including `hue_native_control` and Hue power-on-behavior settings — to
Signify/Philips Hue lights in Zigbee2MQTT, and to any groups that contain
them, since z2m groups don't inherit these options from their members.

## What it does

On each run:

1. Connects to your Zigbee2MQTT MQTT broker.
2. Reads the device list (`zigbee2mqtt/bridge/devices`) and filters to
   devices whose manufacturer/vendor matches Philips/Signify.
3. Applies the configured `hue_native_control`, `hue_power_on_behavior`,
   `hue_power_on_brightness`, `hue_power_on_color_temperature`, and
   `hue_power_on_color` device options to each Hue device via
   `zigbee2mqtt/bridge/request/device/options`.
4. If `apply_to_groups` is enabled, reads the group list
   (`zigbee2mqtt/bridge/groups`), finds any group with at least one Hue
   member, and applies the same options to the group via
   `zigbee2mqtt/bridge/request/group/options`.
5. Repeats on a schedule (`check_interval_hours`) so newly paired Hue
   devices/groups pick up the settings automatically.

## Configuration

| Option | Description |
| --- | --- |
| `mqtt_host` / `mqtt_port` / `mqtt_username` / `mqtt_password` | MQTT broker connection, defaults to the Mosquitto add-on |
| `zigbee2mqtt_topic` | Base MQTT topic Zigbee2MQTT publishes on |
| `apply_hue_native_control` | Whether to apply `hue_native_control` at all |
| `hue_native_control` | `true`/`false` — controls the light using Philips' native protocol (atomic on/off + brightness + color + color temperature commands) instead of standard Zigbee commands; required for the Effect color update mode |
| `apply_power_on_behavior` | Whether to apply `hue_power_on_behavior` at all |
| `hue_power_on_behavior` | `default`, `on`, `off`, `toggle`, or `previous` |
| `apply_power_on_brightness` | Whether to apply `hue_power_on_brightness` at all |
| `hue_power_on_brightness` | `previous` or a value 1-254 |
| `apply_power_on_color_temperature` | Whether to apply `hue_power_on_color_temperature` at all |
| `hue_power_on_color_temperature` | `previous` or a mireds value (e.g. 153-500) |
| `apply_power_on_color` | Whether to apply `hue_power_on_color` at all |
| `hue_power_on_color` | Hex color (e.g. `#ffffff`) |
| `apply_to_groups` | Also apply the same options to groups containing Hue devices |

Each `hue_power_on_*` setting only gets sent to your devices/groups if its
matching `apply_power_on_*` toggle is enabled — turn on only the ones you
actually want to change. If none are enabled, the add-on logs a warning and
does nothing.
| `devices` | Restrict to specific friendly names; empty = all Hue devices |
| `check_interval_hours` | How often to re-apply (picks up newly added devices/groups) |
| `enable_notifications` | Send a Home Assistant persistent notification with the results |
| `dry_run` | Log what would be applied without publishing changes |
| `debug` | Verbose logging |

See [DOCS.md](./DOCS.md) for the add-on store description.
