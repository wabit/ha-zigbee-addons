# Changelog

## 1.3.0

- Replace `check_interval_hours` (free-typed number) with `run_interval`, a
  dropdown of `6h`, `12h`, `daily`, `weekly`, `monthly`. Default changed
  from daily to weekly, since Hue devices are added rarely.

## 1.2.0

- Simplify configuration: drop the paired `apply_*` boolean toggles.
  `hue_native_control` and `hue_power_on_behavior` are now single selects
  with an `unchanged` "do nothing" default; the brightness/color
  temperature/color fields already used blank to mean "do nothing" and are
  unchanged. Halves the number of options fields with no behavior change.

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
