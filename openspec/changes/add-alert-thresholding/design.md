# Design: Alert Thresholding

## Overview
Implement limit-based alerting with static/dynamic/multi-level thresholds for SRE monitoring and Teams notifications.

## Components
- Evaluators per metric (latency p95/p99, error rate, RPS, event loop lag)
- Configuration loader (ENV now; JSON endpoint later)
- Evaluation loop (≤2s) updates in-memory alert state
- Notifications via Teams for error/critical with rate limiting
- UI hooks (future): badges in Golden Signals dashboard

## Threshold Models
- Static: fixed WARN/ERROR/CRITICAL limits
- Dynamic: rolling baseline + allowed deviation percentage
- Multi-level: escalate on duration and severity
- Noise reduction: hysteresis, cooldown, minimum duration

## Interfaces
- `/alerts/state.json` returns per-metric states: { level, since, value, threshold }
- ENV variables for static thresholds, e.g.:
  - ALERT_LATENCY_P95_WARN, ALERT_LATENCY_P95_ERROR, ALERT_LATENCY_P95_CRITICAL
  - ALERT_ERROR_RATE_WARN, ALERT_ERROR_RATE_ERROR, ALERT_ERROR_RATE_CRITICAL
  - Similar for p99 latency, RPS high, event loop lag

