# Changelog

## 1.2.6

- Fix: Notification retry logic with 3 attempts and 5s delay between retries
- Fix: Suppress HTML error pages (504 gateway timeouts) from polluting logs
- Fix: Shorter notification timeout (10s) for faster retry

## 1.2.5

- Fix: Use single wildcard MQTT subscription for in-progress OTA detection instead of individual subscribes per device, which was unreliable

## 1.2.4

- Fix: Stop using `removeAllListeners` which broke mqtt.js internal message routing, use tracked handler pattern instead
- Feat: Add debug mode toggle for verbose logging

## 1.2.2

- Refactor: Check all devices upfront then update from a queue — no wasted time re-checking between updates

## 1.2.1

- Fix: Detect in-progress OTA updates via retained device state (`update.state: "updating"`) instead of trying to catch live progress messages

## 1.2.0

- Fix: Switch HA notifications from REST API to WebSocket API for reliable delivery
- Feat: Detect in-progress OTA updates on startup and wait for them to finish before starting a new cycle

## 1.1.1

- Refactor: Single-pass check-and-update flow — update each device immediately after finding it needs one

## 1.1.0

- Feat: Continuous mode — runs on a configurable schedule (default 24h) instead of one-shot
- Feat: Home Assistant persistent notifications when devices are updated
- Feat: Configurable delay between OTA checks to avoid flooding the mesh
- Changed: Boot mode set to `auto` so the add-on starts with Home Assistant

## 1.0.3

- Fix: Add `init: false` to bypass s6-overlay, use simple CMD entrypoint

## 1.0.2

- Fix: Use s6-overlay service directory structure (later replaced by init: false)

## 1.0.1

- Fix: Use official HA base images, remove pre-built image field

## 1.0.0

- Initial release
- Sequential OTA updates for Zigbee2MQTT devices
- Configurable delay between updates
- Per-device timeout protection
- Real-time progress logging
- Support for targeted device lists or auto-discovery
