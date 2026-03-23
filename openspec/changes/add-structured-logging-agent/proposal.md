# Change: Structured Logging Agent for SRE Analysis

## Why
SRE workflows benefit from machine-readable logs for faster debugging, search/filtering, cross-service correlation, automated alerting, and root cause analysis. The current application lacks a structured logging agent that enforces JSON schema, correlation fields (trace_id/span_id), and PII-safe content suitable for compliance.

## What Changes
- Add a Structured Logging Agent that outputs JSON logs with a standard schema
- Include correlation fields (trace_id, span_id, request_id) from OpenTelemetry context
- Enforce severity levels and environment/service metadata
- Ensure PII is never logged (only redacted placeholders)
- Provide multiple sinks (console, file) and configuration via environment variables
- Add configurable Microsoft Teams notifications for error/fatal logs via webhook
- Add tests to verify schema, correlation, and PII safety
- Document usage and operational controls for SRE analysis

## Impact
- Affected specs: New `structured-logging` capability
- Affected code: New logging agent module and integration points in server and scrubbing layers
- Non-breaking: Adds logging instrumentation without changing external API
