## Metrics & Hooks
- [ ] Add request hooks to capture start/end timestamps
- [ ] Maintain rolling buckets for 60s traffic/error calculations
- [ ] Compute latency percentiles and average from sliding window
- [ ] Sample event loop lag each second

## API & UI
- [ ] Implement `/metrics.json` returning structured metrics
- [ ] Create `/sre/golden-signals` with auto-refresh ≤2s
- [ ] Add demo controls to produce 500/200 and latency spikes
- [ ] Provide `/sre/test/*` endpoints (ok, error, latency, status)
- [ ] Optional combined view `/sre/observability` with Jaeger proxy

## Validation & Demo
- [ ] Manual verification: endpoints and UI reflect metrics
- [ ] Load generation scripts for errors/traffic
- [ ] Document operational tips (ports, env)

