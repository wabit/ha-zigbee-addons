#!/usr/bin/with-contenv sh

echo "[INFO] Starting Sonos Panel Favourites..."

OPTIONS_PATH="/data/options.json"

if [ ! -f "${OPTIONS_PATH}" ]; then
  echo "[ERROR] Options file not found at ${OPTIONS_PATH}"
  exit 1
fi

# Pass the HA options directly — our config loader reads JSON natively
exec tsx /app/src/index.ts "${OPTIONS_PATH}"
