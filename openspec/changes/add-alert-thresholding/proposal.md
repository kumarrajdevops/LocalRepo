# Change: Alert Thresholding for SRE Agents

## Why
SRE agents require a limit-based alerting system to monitor system health and respond proactively. Thresholding enables static/dynamic/multi-level limits to trigger alerts with minimal noise, improves signal quality, and accelerates incident response.

## What Changes
- Introduce alert thresholding in the application:
  - Static thresholds (configured limits)
  - Dynamic thresholds (baseline + deviation via rolling windows)
  - Multi-level severity (warn/error/critical)
- Add configuration model and APIs to manage thresholds per metric (latency, error rate, RPS, saturation)
- Integrate alert evaluation with existing metrics and Teams notifications
- Provide UI controls to visualize thresholds and status

## Impact
- Adds new alerting capability; non-breaking to existing endpoints
- Enables proactive SRE monitoring and demo scenarios
- Paves the way for advanced tuning and adaptive thresholds

