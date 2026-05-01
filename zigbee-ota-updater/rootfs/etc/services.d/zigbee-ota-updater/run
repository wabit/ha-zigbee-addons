#!/usr/bin/with-contenv bashio
# ==============================================================================
# Zigbee OTA Updater - Home Assistant Add-on
# Reads config from the HA add-on options and runs the updater
# ==============================================================================

bashio::log.info "Starting Zigbee OTA Updater..."

# Read add-on options and write them to a JSON file the app can read
CONFIG_PATH="/app/addon-options.json"

MQTT_HOST=$(bashio::config 'mqtt_host')
MQTT_PORT=$(bashio::config 'mqtt_port')
MQTT_USERNAME=$(bashio::config 'mqtt_username')
MQTT_PASSWORD=$(bashio::config 'mqtt_password')
Z2M_TOPIC=$(bashio::config 'zigbee2mqtt_topic')
DELAY=$(bashio::config 'delay_between_updates')
TIMEOUT=$(bashio::config 'update_timeout')
DEVICES=$(bashio::config 'devices')

# Build JSON config for the app
cat > "${CONFIG_PATH}" <<EOF
{
  "mqtt": {
    "host": "${MQTT_HOST}",
    "port": ${MQTT_PORT},
    "username": "${MQTT_USERNAME}",
    "password": "${MQTT_PASSWORD}"
  },
  "zigbee2mqtt_topic": "${Z2M_TOPIC}",
  "delay_between_updates": ${DELAY},
  "update_timeout": ${TIMEOUT},
  "devices": ${DEVICES}
}
EOF

bashio::log.info "Configuration loaded:"
bashio::log.info "  MQTT broker: ${MQTT_HOST}:${MQTT_PORT}"
bashio::log.info "  Z2M topic: ${Z2M_TOPIC}"
bashio::log.info "  Delay between updates: ${DELAY}s"
bashio::log.info "  Update timeout: ${TIMEOUT}s"

# Run the updater
exec tsx /app/src/index.ts "${CONFIG_PATH}"
