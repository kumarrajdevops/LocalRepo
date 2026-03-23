# Design: Golden Signals Monitoring

## Overview
Add in-app Golden Signals monitoring backed by request hooks and a lightweight UI. Exposes a metrics JSON API and provides demo endpoints for SRE drills.

## Metrics Computation
- Latency: collect durations per request; compute p50/p95/p99 via sorted window; avg computed over window
- Traffic: 60-second rolling buckets to compute RPS
- Errors: 60-second rolling buckets for error RPS; error_rate_1m = errors/requests
- Saturation: sample event loop lag using setImmediate delta (ms)

## APIs
- `/metrics.json` returns structured metrics
- `/sre/golden-signals` renders HTML/JS with auto-refresh and demo buttons
- `/sre/test/*` routes simulate errors/latency/status codes
- Optional `/sre/observability` embeds Jaeger

## Implementation Notes
- Hooks: `onRequest` store start time, `onResponse` compute duration and update buckets
- Thresholds for color states: latency OK<50ms, WARN<200ms, BAD≥200ms
- No external metric backend required; future shipping can integrate OTEL Metrics/Prometheus

