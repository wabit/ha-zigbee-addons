# Changelog

## 1.0.1

- Fix: Use `with-contenv` shebang in run.sh to get SUPERVISOR_TOKEN injected by s6

## 1.0.0

- Initial release
- Stale entity detection with configurable warning and removal thresholds
- Dry run mode enabled by default for safety
- Domain, entity, and regex pattern exclusions
- Single batched HA notification per cycle — no spam
- Continuous operation with configurable check interval
- Entity removal via HA WebSocket API
