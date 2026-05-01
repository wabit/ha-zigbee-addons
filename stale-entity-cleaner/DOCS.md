# Stale Entity Cleaner

Automatically finds Home Assistant entities that haven't updated in a while, warns you about them, and optionally removes them after a configurable grace period. Sends a single batched notification so you don't get spammed.

## How it works

1. Connects to Home Assistant via the WebSocket API
2. Fetches all entity states and checks their `last_updated` timestamp
3. Entities stale for longer than the **warning threshold** are flagged
4. Entities stale for longer than the **removal threshold** are removed from the entity registry
5. Sends one notification summarising all warnings, removals, and failures
6. Sleeps and repeats on the configured schedule

## Configuration

### Thresholds

| Option | Default | Description |
|--------|---------|-------------|
| `stale_warning_days` | `3` | Days without an update before an entity is flagged as a warning. |
| `stale_remove_days` | `7` | Days without an update before an entity is removed. Must be greater than `stale_warning_days`. |

### Schedule

| Option | Default | Description |
|--------|---------|-------------|
| `check_interval_hours` | `24` | Hours between checks. The add-on runs continuously. |

### Safety

| Option | Default | Description |
|--------|---------|-------------|
| `dry_run` | `true` | **Enabled by default.** When on, the add-on reports what it *would* remove but doesn't actually delete anything. Disable once you're happy with the results. |
| `enable_notifications` | `true` | Send a persistent notification to HA with the results of each check. |

### Exclusions

| Option | Default | Description |
|--------|---------|-------------|
| `exclude_domains` | _(empty)_ | Entity domains to skip entirely (e.g. `person`, `zone`, `automation`). |
| `exclude_entities` | _(empty)_ | Specific entity IDs to never touch (e.g. `sensor.my_slow_sensor`). |
| `exclude_patterns` | _(empty)_ | Regex patterns to match entity IDs to exclude (e.g. `.*_battery$`). |

## Recommended exclusions

Some entities are expected to rarely change. Consider excluding:

```yaml
exclude_domains:
  - person
  - zone
  - automation
  - script
  - scene
  - input_boolean
  - input_number
  - input_text
  - input_select
  - input_datetime
  - input_button
  - counter
  - timer
  - schedule
```

## Usage

1. Install the add-on and configure your thresholds and exclusions
2. **Leave `dry_run` enabled** for the first few cycles to review what would be removed
3. Check the HA notification to see the report
4. Once satisfied, set `dry_run` to `false` to enable actual removal

## Notification format

You'll get a single notification per cycle that looks like:

> **Stale Entity Report: 3 warning(s), 2 removed**
>
> **⚠️ Stale (3–7 days):**
> - `sensor.garden_temp` — 4d (unavailable)
> - `binary_sensor.door` — 5d (off)
>
> **🗑️ Removed (>7 days):**
> - `sensor.old_device` — 12d (unavailable)
> - `light.removed_bulb` — 30d (unavailable)

## Troubleshooting

- **"SUPERVISOR_TOKEN not available"**: Make sure `homeassistant_api: true` is set (it is by default).
- **"Failed to remove entity"**: Some entities can't be removed via the registry (e.g. entities without a unique ID). These will be reported in the notification.
- **Entities keep coming back**: The integration that owns the entity will recreate it. You may need to remove the device or integration instead.
