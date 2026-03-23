## 1. Configuration & Models
- [ ] Define ENV variables for static thresholds (latency, error rate, RPS, lag)
- [ ] Design dynamic thresholds (baseline window, deviation percent)
- [ ] Implement multi-level model (warn/error/critical)

## 2. Evaluators & Loop
- [ ] Implement evaluators per metric
- [ ] Add evaluation loop (≤2s) reading metrics
- [ ] Maintain in-memory alert state with timestamp and last change
- [ ] Apply hysteresis/cooldown/min duration

## 3. APIs & Notifications
- [ ] Implement `/alerts/state.json`
- [ ] Integrate Teams notifications for error/critical transitions
- [ ] Respect global rate limits

## 4. UI (Optional)
- [ ] Add thresholds visualization to Golden Signals page
- [ ] Badges or color overlays indicating current alert levels

## 5. Validation
- [ ] Unit tests for evaluators (static/dynamic)
- [ ] Scenario tests for escalation and noise reduction
- [ ] Documentation updates for ENV and operations

