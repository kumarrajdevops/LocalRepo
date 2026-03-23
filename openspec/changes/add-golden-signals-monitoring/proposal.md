# Change: Golden Signals Monitoring UI and Metrics

## Why
SRE teams need immediate visibility into the four Golden Signals (latency, traffic, errors, saturation) to diagnose reliability issues quickly and demonstrate system health during demos. A lightweight in-app dashboard helps teams monitor without external dependencies and complements distributed tracing.

## What Changes
- Add in-app metrics collection hooks for latency, traffic, errors, saturation
- Provide `/metrics.json` API exposing computed metrics (p50/p95/p99, avg, RPS, error rate, event loop lag)
- Add `/sre/golden-signals` UI with live auto-refresh and demo controls
- Add test endpoints to produce errors, latency spikes, and varied statuses for demo
- Optional Jaeger proxy integration to co-visualize traces and signals

## Impact
- New endpoints and UI, no breaking changes to existing APIs
- Developer experience improvement: quick demos and local monitoring
- Foundation for future metrics shipping to external backends (Prometheus/OpenTelemetry Metrics)

