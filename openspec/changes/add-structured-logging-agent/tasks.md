## 1. Agent Implementation
- [ ] 1.1 Create `src/logging/agent.ts` (singleton) and initialization
- [ ] 1.2 Implement JSON schema fields and level filtering
- [ ] 1.3 Integrate OpenTelemetry context (trace_id/span_id)
- [ ] 1.4 Ensure PII safety in message/attributes
- [ ] 1.5 Add console and file sinks with fallback
- [ ] 1.6 Add environment configuration (LOG_LEVEL, LOG_SINK, LOG_FILE_PATH)
- [ ] 1.7 Add Teams notifier with webhook config (`TEAMS_WEBHOOK_URL`, `TEAMS_ALERT_LEVEL`, `TEAMS_MIN_INTERVAL_MS`)

## 2. Server Integration
- [ ] 2.1 Emit structured logs at request start/end
- [ ] 2.2 Emit error logs for 5xx responses with route and status
- [ ] 2.3 Emit logs for latency spikes

## 3. Testing & Quality
- [ ] 3.1 Unit tests for schema validation
- [ ] 3.2 Unit tests for correlation (trace/span)
- [ ] 3.3 Unit tests ensuring no raw PII in output
- [ ] 3.4 Integration tests with server hooks
- [ ] 3.5 Manual test: verify Teams notification triggers on error burst

## 4. Documentation
- [ ] 4.1 Document environment variables and usage
- [ ] 4.2 Document schema fields and examples
- [ ] 4.3 Update README with SRE usage guidance
- [ ] 4.4 Add Teams configuration steps and security notes (do not commit secrets)
