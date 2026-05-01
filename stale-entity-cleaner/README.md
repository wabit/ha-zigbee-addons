# Stale Entity Cleaner - Home Assistant Add-on

Finds and removes Home Assistant entities that haven't updated in a configurable period. Sends a single batched notification with warnings and removals.

## Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click **⋮** (top right) → **Repositories**
3. Paste: `https://github.com/wabit/ha-zigbee-addons`
4. Click **Add**, then find **Stale Entity Cleaner** and click **Install**

## Configuration

- **`stale_warning_days`** (default: 3) — days before an entity is flagged
- **`stale_remove_days`** (default: 7) — days before an entity is removed
- **`dry_run`** (default: true) — reports what would be removed without actually deleting
- **`exclude_domains`** — domains to skip (e.g. `person`, `automation`)
- **`exclude_entities`** — specific entity IDs to protect
- **`exclude_patterns`** — regex patterns to exclude

See the **Documentation** tab in the add-on for full details.
