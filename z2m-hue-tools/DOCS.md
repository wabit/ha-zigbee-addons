# Z2M Hue Tools

Applies Hue/Philips-specific device options — including `hue_native_control`
and Hue power-on-behavior settings — to Signify/Philips Hue lights in
Zigbee2MQTT, and to any groups that contain them.

## Installation

1. Add this repository to your Home Assistant add-on store if you haven't
   already: `https://github.com/wabit/wabits-ha-addons`
2. Install **Z2M Hue Tools**.
3. Set `hue_native_control` and/or the `hue_power_on_*` fields to whichever
   values you want to push — each one is left at a "do nothing" default
   (`unchanged` or blank) until you set it.
4. Start the add-on.

## Notes

- Requires Zigbee2MQTT and its MQTT broker to be reachable from the add-on.
- Groups don't inherit device-level `hue_power_on_*` options in
  Zigbee2MQTT, so this add-on applies the same values to both the devices
  and any group that contains at least one of them.
- Use `dry_run: true` first to confirm which devices/groups would be
  touched before applying for real.
