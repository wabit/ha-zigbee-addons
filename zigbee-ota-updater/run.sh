#!/bin/sh
# ==============================================================================
# Zigbee OTA Updater - Home Assistant Add-on
# Reads config from HA add-on options and runs the updater
# ==============================================================================

echo "[INFO] Starting Zigbee OTA Updater..."

# HA places add-on options at /data/options.json
OPTIONS_PATH="/data/options.json"

if [ ! -f "${OPTIONS_PATH}" ]; then
  echo "[ERROR] Options file not found at ${OPTIONS_PATH}"
  exit 1
fi

# Build the config JSON that our app expects from the HA options
CONFIG_PATH="/app/addon-options.json"

# Use node to transform the flat HA options into our nested config format
node -e "
const opts = require('${OPTIONS_PATH}');
const config = {
  mqtt: {
    host: opts.mqtt_host || 'core-mosquitto',
    port: opts.mqtt_port || 1883,
    username: opts.mqtt_username || '',
    password: opts.mqtt_password || ''
  },
  zigbee2mqtt_topic: opts.zigbee2mqtt_topic || 'zigbee2mqtt',
  delay_between_updates: opts.delay_between_updates || 300,
  delay_between_checks: opts.delay_between_checks || 10,
  update_timeout: opts.update_timeout || 3600,
  check_interval_hours: opts.check_interval_hours || 24,
  enable_notifications: opts.enable_notifications !== false,
  devices: opts.devices || []
};
require('fs').writeFileSync('${CONFIG_PATH}', JSON.stringify(config, null, 2));
console.log('[INFO] Configuration loaded:');
console.log('[INFO]   MQTT broker: ' + config.mqtt.host + ':' + config.mqtt.port);
console.log('[INFO]   Z2M topic: ' + config.zigbee2mqtt_topic);
console.log('[INFO]   Delay between updates: ' + config.delay_between_updates + 's');
console.log('[INFO]   Delay between checks: ' + config.delay_between_checks + 's');
console.log('[INFO]   Update timeout: ' + config.update_timeout + 's');
console.log('[INFO]   Check interval: ' + config.check_interval_hours + 'h');
console.log('[INFO]   Notifications: ' + (config.enable_notifications ? 'enabled' : 'disabled'));
console.log('[INFO]   Devices: ' + (config.devices.length ? config.devices.join(', ') : 'ALL (auto-discover)'));
"

# Run the updater
exec tsx /app/src/index.ts "${CONFIG_PATH}"
