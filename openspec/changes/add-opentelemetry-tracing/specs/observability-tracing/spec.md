## ADDED Requirements

### Requirement: OpenTelemetry Distributed Tracing
The system SHALL instrument the Secure Audit Service with OpenTelemetry distributed tracing to enable end-to-end visibility of request flows, latency diagnosis, and operation tracing across components.

#### Scenario: Request traced end-to-end (Happy Path)
- **GIVEN** the Secure Audit Service is running with tracing enabled
- **WHEN** a client sends a valid request to `POST /logs` with a JSON audit log
- **THEN** a root span is created for the HTTP request with operation name `POST /logs`
- **AND** child spans are created for validation (`validation.schema`), PII scrubbing (`pii.scrub`), and database write (`db.write`)
- **AND** all spans share the same trace ID
- **AND** spans are exported to the configured OTLP backend (e.g., Jaeger, Zipkin)
- **AND** span attributes follow OpenTelemetry semantic conventions (e.g., `http.method`, `http.url`, `http.status_code`)
- **AND** no PII appears in any span attributes

#### Scenario: PII scrubbing span attributes
- **GIVEN** the PII scrubbing layer processes a log containing PII (e.g., email, credit card)
- **WHEN** a span is created for the PII scrubbing operation
- **THEN** the span has operation name `pii.scrub`
- **AND** span attributes include `pii.types_detected` (count of PII types found)
- **AND** span attributes include `pii.fields_scrubbed` (array of field names only, e.g., `["message", "cardNumber"]`)
- **AND** the span duration reflects scrubbing processing time
- **AND** no PII values (emails, SSNs, credit cards, etc.) are recorded in any span attribute
- **AND** the span is a child of the HTTP request root span

#### Scenario: Trace export failure does not impact request processing
- **GIVEN** the OTLP exporter cannot reach the configured backend (e.g., Jaeger down, network unreachable)
- **WHEN** a client sends a valid request to `POST /logs`
- **THEN** the request is processed normally
- **AND** a `200 OK` response is returned with the log ID
- **AND** the application continues processing requests
- **AND** traces are buffered or dropped per configuration (no blocking)
- **AND** an error is logged for monitoring
- **AND** no request fails due to tracing or exporter errors

#### Scenario: Quality - Accuracy and completeness
- **GIVEN** instrumentation is complete and deployed
- **WHEN** a full request flows through the system (HTTP → validation → PII scrub → DB)
- **THEN** all critical paths have corresponding spans
- **AND** span names follow OpenTelemetry semantic conventions
- **AND** trace context propagates correctly across async boundaries
- **AND** unit tests verify span creation and attribute correctness
- **AND** integration tests verify end-to-end trace structure
- **AND** no PII appears in span attributes (verified by tests)

### Requirement: Instrumentation Code/Libraries
The system SHALL provide instrumentation code and libraries that:
- Initialize the OpenTelemetry SDK before application bootstrap
- Configure OTLP HTTP exporter for trace export
- Enable HTTP auto-instrumentation for Fastify
- Create custom spans for PII scrubbing, validation, and database operations
- Support configurable OTLP endpoint, service name, and sampling rate via environment variables

#### Scenario: Instrumentation bootstrap
- **GIVEN** the application starts
- **WHEN** the tracing bootstrap module is loaded (first, before server)
- **THEN** the NodeTracerProvider is registered
- **AND** the OTLP HTTP exporter is configured with endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT` (default: `http://localhost:4318/v1/traces`)
- **AND** the service name is set from `OTEL_SERVICE_NAME` (default: `secure-audit-service`)
- **AND** HTTP instrumentation is registered for automatic span creation
- **AND** the tracer provider is ready before the Fastify server accepts requests

#### Scenario: Custom span creation
- **GIVEN** the PII scrubbing layer is invoked
- **WHEN** the scrubber processes a log entry
- **THEN** a span is started with operation name `pii.scrub`
- **AND** the span is linked to the active trace context (parent span)
- **AND** the span is ended when scrubbing completes (success or failure)
- **AND** span attributes are set per the PII scrubbing span attributes scenario
- **AND** exceptions during scrubbing are recorded on the span

### Requirement: Input - Requirements/Specifications
The instrumentation SHALL be driven by requirements and specifications defined in this OpenSpec change (proposal.md, design.md, and this spec).

#### Scenario: Spec-driven implementation
- **GIVEN** this spec defines requirements for distributed tracing
- **WHEN** implementation is performed
- **THEN** each requirement maps to verifiable implementation (code or configuration)
- **AND** each scenario maps to at least one test (unit or integration)
- **AND** design decisions in design.md are followed
- **AND** tasks in tasks.md are completed in order

### Requirement: Output - Instrumentation Code/Libraries
The system SHALL deliver instrumentation code and libraries as the primary output of this change.

#### Scenario: Deliverables
- **GIVEN** this change is implemented
- **THEN** the following artifacts are delivered:
  - Tracing bootstrap module (`src/tracing.ts` or equivalent)
  - Custom span instrumentation in PII scrubbing layer
  - Custom span instrumentation in validation layer
  - Custom span instrumentation in database layer
  - Configuration for OTLP exporter and sampling
  - Unit tests for span creation and attributes
  - Integration tests for end-to-end trace structure
  - Documentation for setup and configuration

### Requirement: Quality - Accuracy and Completeness Standards
The instrumentation SHALL meet accuracy and completeness standards.

#### Scenario: Accuracy - Correct span data
- **GIVEN** spans are created during request processing
- **WHEN** traces are exported and viewed in a trace backend
- **THEN** span names accurately reflect the operation (e.g., `pii.scrub`, `validation.schema`)
- **AND** span durations accurately reflect operation duration
- **AND** span hierarchy correctly reflects parent-child relationships
- **AND** trace ID is consistent across all spans in a request
- **AND** no PII or sensitive data appears in span attributes

#### Scenario: Completeness - All critical paths instrumented
- **GIVEN** a request flows through the system
- **WHEN** the request completes (success or failure)
- **THEN** a root span exists for the HTTP request
- **AND** a span exists for schema validation (if validation runs)
- **AND** a span exists for PII scrubbing (if scrubbing runs)
- **AND** a span exists for database write (if DB write runs)
- **AND** error paths (e.g., validation failure) are also traced with appropriate span status
