# Design: Structured Logging Agent

## Overview
Introduce a Structured Logging Agent that emits JSON logs with standardized schema, correlation identifiers, and PII safety. The agent integrates with existing tracing and the SRE Golden Signals dashboard.

## Architecture
- `src/logging/agent.ts`: Logging agent singleton with initialization and emit functions.
- Context integration: Pull `trace_id`/`span_id` from OpenTelemetry context when available.
- PII safety: Run content through scrubbing helpers before emitting.
- Sinks: Console (default), File (configurable).
- Configuration via environment variables.

## JSON Schema (Core Fields)
- `timestamp`, `level`, `message`, `service_name`, `environment`
- `trace_id`, `span_id`, `request_id`
- `attributes` (object), `pii_redacted` (boolean), `logger_name`

## Initialization
- Read `LOG_LEVEL`, `LOG_SINK`, `LOG_FILE_PATH`, `LOG_INCLUDE_STACK`
- Default `LOG_LEVEL=info`, `LOG_SINK=console`
- Fallback to console if file sink fails
- Teams alerts configuration:
  - `TEAMS_WEBHOOK_URL` (enable alerts when present)
  - `TEAMS_ALERT_LEVEL` (default: `error`)
  - `TEAMS_MIN_INTERVAL_MS` (default: `30000`)

## Emission
- Non-throwing: Errors are caught, fallback sink used
- Minimal overhead (target <2ms per log on dev)
- Structured output via `JSON.stringify`
- When level meets or exceeds `TEAMS_ALERT_LEVEL` and webhook is set, emit a MessageCard to Teams with correlation fields and sanitized attributes.

## Test Strategy
- Unit tests: schema validation, context correlation, PII safety
- Integration tests: server hooks emitting start/end/error logs
