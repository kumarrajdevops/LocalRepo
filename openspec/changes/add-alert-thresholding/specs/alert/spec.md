## ADDED Requirements

### Requirement: Threshold Configurations
The system SHALL support static, dynamic, and multi-level thresholds for core metrics:
- Latency (p95/p99)
- Error rate (1m)
- RPS (traffic)
- Event loop lag (saturation)

#### Scenario: Static thresholds
- **GIVEN** configured static limits (e.g., p95_latency_ms > 200)
- **WHEN** metrics exceed the limit
- **THEN** an alert state transitions from OK → WARN/ERROR/CRITICAL according to the configured levels

#### Scenario: Dynamic thresholds
- **GIVEN** a dynamic configuration (baseline + deviation)
- **WHEN** the rolling baseline is computed over N minutes
- **AND** current value deviates by M% beyond allowance
- **THEN** the alert state changes accordingly

### Requirement: Multi-Level Severity
The system SHALL define severity levels for alerts:
- Levels: warn, error, critical
- Each level SHALL include thresholds and actions (notify, escalate)

#### Scenario: Escalation
- **GIVEN** an error-level condition persists beyond T seconds
- **WHEN** the timer elapses
- **THEN** the alert escalates to critical

### Requirement: Noise Reduction (Tuning)
The system MUST minimize alert noise via hysteresis, cooldowns, and minimum duration:
- Hysteresis between enter/exit thresholds
- Cooldown (no re-alert within a window)
- Minimum duration before raising an alert

#### Scenario: Hysteresis and cooldown
- **GIVEN** values fluctuate near the threshold
- **WHEN** oscillations occur
- **THEN** the alert does not toggle repeatedly due to hysteresis and cooldown timers

### Requirement: Configurability
The system SHALL load configuration from environment variables and/or a JSON endpoint:
- ENV example: `ALERT_LATENCY_P95_WARN=200`, `ALERT_LATENCY_P95_ERROR=400`
- JSON config endpoint: `/alerts/config` (optional future)

#### Scenario: Environment-driven configuration
- **GIVEN** env variables are set
- **WHEN** the agent initializes
- **THEN** thresholds are applied to evaluators

### Requirement: Evaluation Loop
The system SHALL evaluate thresholds periodically (≤2s) using the metrics API:
- Evaluates per metric and updates an in-memory alert state
- Exposes current states via `/alerts/state.json`

#### Scenario: State exposure
- **GIVEN** active evaluation
- **WHEN** querying `/alerts/state.json`
- **THEN** returns per-metric states: { level, since, value, threshold }

### Requirement: Notifications
The system SHALL trigger notifications for `error` and `critical` levels via Teams webhook when configured.

#### Scenario: Teams notify on critical
- **GIVEN** Teams webhook is configured
- **AND** alert level transitions to critical
- **WHEN** evaluator detects the transition
- **THEN** a Teams message is posted
- **AND** notifications respect global rate limits to avoid flooding

