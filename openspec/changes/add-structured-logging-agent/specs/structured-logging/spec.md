## ADDED Requirements

### Requirement: Structured JSON Log Schema
Logs SHALL be emitted in a machine-readable JSON format with mandatory fields:
- `timestamp` (RFC3339)
- `level` (one of: trace, debug, info, warn, error, fatal)
- `message` (short text)
- `service_name`, `environment`
- `trace_id`, `span_id` (from active OpenTelemetry context)
- `request_id` (if available)
- `attributes` (object of key→value pairs; values MUST be non-PII)
- `pii_redacted` (boolean)
- `logger_name`

#### Scenario: Minimal valid log entry
- **GIVEN** a log event occurs
- **WHEN** the agent emits a log
- **THEN** the JSON includes all mandatory fields
- **AND** `timestamp` conforms to RFC3339
- **AND** `level` is one of the allowed values
- **AND** `message` is a concise text
- **AND** `trace_id` and `span_id` match the active context (if present)
- **AND** `pii_redacted` is true when scrubbing was applied

### Requirement: Correlation Fields Propagation
The agent SHALL capture correlation identifiers from OpenTelemetry context for downstream analysis.

#### Scenario: Context propagation
- **GIVEN** a trace is active during request handling
- **WHEN** the agent logs from the PII scrubbing layer
- **THEN** the `trace_id` and `span_id` correspond to the active span
- **AND** logs across layers share the same `trace_id`

### Requirement: PII Safety
Logs SHALL never include raw PII. Redacted placeholders are permitted (e.g., `[EMAIL_REDACTED]`).

#### Scenario: PII redaction enforced
- **GIVEN** a log includes content derived from user input
- **WHEN** the agent prepares the `message` or `attributes`
- **THEN** any detected PII is replaced with placeholders
- **AND** `pii_redacted` is set to true
- **AND** tests verify no raw PII appears in emitted logs

### Requirement: Sinks and Configuration
The agent SHALL support configurable sinks and levels via environment variables:
- `LOG_LEVEL` (default: info)
- `LOG_SINK` (console|file, default: console)
- `LOG_FILE_PATH` (required when sink=file)
- `LOG_INCLUDE_STACK` (boolean)
- `OTEL_SERVICE_NAME` and `NODE_ENV` used for metadata

#### Scenario: Config-driven behavior
- **GIVEN** environment variables are set
- **WHEN** the agent initializes
- **THEN** logs are written to the configured sink
- **AND** level filtering applies
- **AND** file sink writes to `LOG_FILE_PATH` when selected

### Requirement: Reliability and Performance
Logging MUST be non-blocking for request flow with bounded overhead.

#### Scenario: No-throw guarantee
- **GIVEN** an internal logging failure (e.g., file unwritable)
- **WHEN** the agent emits a log
- **THEN** the agent emits to console as a fallback
- **AND** no exception bubbles to the application handler

#### Scenario: Overhead constraint
- **GIVEN** typical request processing
- **WHEN** logging occurs at INFO level
- **THEN** per-log overhead is under 2ms on a developer workstation

### Requirement: Testability and Quality
The agent SHALL include tests verifying schema, correlation, and PII safety.

#### Scenario: Unit tests
- **GIVEN** a test suite
- **WHEN** agents logs with various inputs
- **THEN** JSON schema fields are validated
- **AND** trace/span fields match a seeded context
- **AND** no raw PII appears in `message` or `attributes`

### Requirement: Teams Notifications (Configurable)
The agent SHALL send Microsoft Teams notifications for high-severity logs when configured.
- Environment variables:
  - `TEAMS_WEBHOOK_URL` (required to enable)
  - `TEAMS_ALERT_LEVEL` (minimum level to notify; default: `error`)
  - `TEAMS_MIN_INTERVAL_MS` (rate limit; default: `30000`)

#### Scenario: Error-level notification
- **GIVEN** `TEAMS_WEBHOOK_URL` is set
- **AND** an error-level log is emitted
- **WHEN** the agent processes the log
- **THEN** a Teams MessageCard is posted to the channel
- **AND** the payload includes `service_name`, `environment`, `level`, `request_id`, `trace_id`, `span_id`, and sanitized attributes
- **AND** notifications respect `TEAMS_MIN_INTERVAL_MS` rate limiting

### Requirement: SRE Integration
The agent SHALL integrate with SRE dashboards by emitting structured logs for events: request start/end, error responses, latency spikes.

#### Scenario: SRE events coverage
- **GIVEN** the server handles requests
- **WHEN** start/end hooks run
- **THEN** the agent emits structured logs with correlation and summarizing attributes
- **AND** error responses generate `error` level logs including error code and route
