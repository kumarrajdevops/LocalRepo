## ADDED Requirements

### Requirement: Metrics Collection (Golden Signals)
The system SHALL collect and compute Golden Signals:
- Latency: p50, p95, p99, avg in milliseconds over a sliding window
- Traffic: requests per second (RPS) over the last 60 seconds
- Errors: error RPS and error rate over the last 60 seconds
- Saturation: event loop lag in milliseconds sampled each second

#### Scenario: Request hooks drive latency and errors
- **GIVEN** request start and end hooks are active
- **WHEN** a request completes
- **THEN** duration is recorded for latency percentiles and averages
- **AND** counters are updated for RPS and error rate calculations
- **AND** 5xx responses increment error counters

### Requirement: Metrics API
The system SHALL expose a JSON API for metrics:
- Endpoint `/metrics.json` returns structured fields:
  - `latency_ms: { p50, p95, p99, avg }`
  - `traffic: { rps }`
  - `errors: { error_rps, error_rate_1m }`
  - `saturation: { event_loop_lag_ms }`

#### Scenario: Valid metrics payload
- **GIVEN** active traffic
- **WHEN** the endpoint is called
- **THEN** the JSON payload reflects the latest computed values
- **AND** values are numeric and non-negative

### Requirement: Golden Signals UI
The system SHALL provide a browser page at `/sre/golden-signals`:
- Live updates every ≤2 seconds
- Cards display latency percentiles, traffic RPS, error rate/RPS, saturation
- Demo controls to trigger bursts of 500s, 200s, and latency spikes

#### Scenario: Live refresh and demo controls
- **GIVEN** the page is open
- **WHEN** a demo button is pressed
- **THEN** the metrics change accordingly within 2 seconds
- **AND** status colors reflect thresholds (OK/WARN/BAD)

### Requirement: Test Endpoints
The system SHALL provide endpoints to generate test signals:
- `/sre/test/ok` → 200
- `/sre/test/error` → 500
- `/sre/test/latency?ms=<N>`
- `/sre/test/status/:code`

#### Scenario: Error signal generation
- **GIVEN** the error endpoint is invoked repeatedly
- **WHEN** `/sre/test/error` is called 10 times
- **THEN** error RPS and error rate increase within the 60s window

### Requirement: Jaeger Proxy (Configurable)
The system SHALL proxy Jaeger UI when enabled and upstream is reachable:
- `/jaeger`, `/static`, `/api` proxied to `http://localhost:16686`
- Removes frame-blocking headers to allow embedding in combined views
- When upstream is unavailable, the proxy SHALL return 502 with a clear message

#### Scenario: Combined observability view
- **GIVEN** Jaeger is running
- **WHEN** navigating to `/sre/observability`
- **THEN** the page shows Golden Signals and Jaeger UI side by side

### Requirement: Non-breaking and Lightweight
The implementation MUST be lightweight, not introduce external runtime dependencies, and avoid breaking existing APIs.

#### Scenario: Resource footprint
- **GIVEN** typical dev environment
- **WHEN** the dashboard runs
- **THEN** CPU overhead for metrics stays minimal (<5% on idle)
