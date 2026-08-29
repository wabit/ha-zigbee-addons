# Changelog

## 1.1.0

- Add `hue_native_control` support (`apply_hue_native_control` /
  `hue_native_control`) — the actual "Hue native control" toggle found on
  the device's "Settings (specific)" tab in the Zigbee2MQTT frontend, which
  switches the light to Philips' atomic protocol instead of standard Zigbee
  commands. This was the originally requested feature; the 1.0.0 release
  only covered the separate `hue_power_on_*` restore-on-power-loss options.

## 1.0.0

- Initial release. Applies `hue_power_on_behavior`, `hue_power_on_brightness`,
  `hue_power_on_color_temperature`, and `hue_power_on_color` to Signify/Philips
  Hue devices and any groups containing them, on a configurable schedule.
