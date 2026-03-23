## ADDED Requirements

### Requirement: DR/HA Objective Definitions
The system SHALL support explicit DR/HA objectives per application or service:
- RTO (Recovery Time Objective)
- RPO (Recovery Point Objective)
- Availability target (e.g., 99.9%)
- Allowed error budget and maximum failover time.

#### Scenario: DR/HA profile configuration
- **GIVEN** an application is registered with the DR/HA Validation Application
- **WHEN** a user configures RTO, RPO, availability target, and failover constraints
- **THEN** the system persists this DR/HA profile
- **AND** subsequent validation runs use this profile as the acceptance criteria.

---

### Requirement: Litmus Chaos Experiment Suites
The system SHALL use Litmus Chaos to execute predefined experiment suites against the target application/web server infrastructure:
- Compute failures (node/VM/pod)
- Network failures (latency, packet loss, partition)
- Storage/database failures
- Zone/region‑level disruption (where supported).

#### Scenario: Node/pod failure suite
- **GIVEN** a DR/HA profile for an application with a running Litmus Chaos control plane
- **WHEN** the "node/pod failure" experiment suite is executed
- **THEN** the system applies the corresponding Litmus Chaos experiments to the target workloads
- **AND** records the start, end, and outcome of each experiment.

#### Scenario: Network partition suite
- **GIVEN** an application deployed across multiple zones/regions
- **WHEN** the "network partition" experiment suite is executed
- **THEN** the system introduces simulated network partitions according to the suite definition
- **AND** observes application behavior and connectivity during the partition window.

---

### Requirement: DR/HA Compliance Evaluation
The system SHALL evaluate DR/HA compliance by comparing observed behavior during chaos experiments against configured DR/HA objectives:
- Calculate downtime and degraded period per run
- Measure failover time
- Estimate RPO based on data replication/lag signals where available.

#### Scenario: RTO compliance evaluation
- **GIVEN** an application with RTO=5 minutes
- **AND** a node failure chaos experiment that causes an outage
- **WHEN** the application fully recovers and traffic is healthy
- **THEN** the system computes the actual recovery time
- **AND** marks the experiment as:
  - PASS if recovery_time ≤ 5 minutes
  - FAIL if recovery_time > 5 minutes.

#### Scenario: RPO compliance evaluation
- **GIVEN** an application with RPO=60 seconds
- **AND** a database failover chaos experiment
- **WHEN** the system inspects replication lag or last‑committed timestamps
- **THEN** it computes the effective data loss window
- **AND** marks the scenario as PASS if data_loss_window ≤ 60s, otherwise FAIL.

---

### Requirement: Availability and Error Budget Tracking
The system SHALL derive availability and error budget consumption during chaos runs:
- Use existing metrics (e.g., HTTP 5xx rate, latency, success rate) and uptime probes
- Attribute SLO burn to each experiment run.

#### Scenario: Availability impact during experiment
- **GIVEN** an availability target of 99.9%
- **WHEN** a chaos experiment runs for N minutes
- **AND** during that period the service is unreachable for D minutes
- **THEN** the system attributes D minutes of downtime to the corresponding DR/HA validation run
- **AND** updates the error budget usage accordingly.

---

### Requirement: Execution Modes (On‑Demand and Scheduled)
The system SHALL support:
- On‑demand runs via API/CLI/UI triggers
- Scheduled runs (e.g., nightly, weekly) configured per application.

#### Scenario: On‑demand validation
- **GIVEN** a configured application DR/HA profile
- **WHEN** a user triggers a DR/HA validation run on demand
- **THEN** the system selects the appropriate Litmus Chaos suite
- **AND** executes it immediately
- **AND** produces a result artifact upon completion.

#### Scenario: Scheduled validation
- **GIVEN** a weekly scheduled DR/HA validation for an application
- **WHEN** the scheduled time is reached
- **THEN** the system automatically runs the corresponding chaos experiment suite
- **AND** stores the results without user intervention.

---

### Requirement: Observability Integration
The system SHALL integrate with existing observability tools (metrics, logs, traces) to collect evidence during experiments:
- Correlate experiments with traces/logs via unique experiment IDs
- Retrieve metrics from the configured monitoring backend.

#### Scenario: Correlated experiment traces
- **GIVEN** a running DR/HA validation experiment with ID `exp-123`
- **WHEN** the application emits logs and traces during the chaos window
- **THEN** the system tags or filters observability data with `exp-123`
- **AND** includes relevant log/trace snippets or links in the final report.

---

### Requirement: Reporting and Evidence
The system SHALL generate structured, auditable output for each DR/HA validation run:
- Machine‑readable JSON document
- Human‑readable summary (markdown/HTML or UI view).

#### Scenario: Run result document
- **GIVEN** a completed DR/HA validation run
- **WHEN** a client requests the run result by ID
- **THEN** the system returns a JSON object containing:
  - Application identifier and DR/HA profile at run time
  - List of experiments executed with status (pass/fail/skip)
  - Metrics used (downtime, failover time, data loss window)
  - Overall DR/HA compliance verdict (pass/fail)
  - Timestamps and environment details.

---

### Requirement: API Surface
The system SHALL expose REST/JSON APIs to:
- Register/update DR/HA profiles
- Trigger validation runs
- Retrieve run status and results
- List historical runs per application.

#### Scenario: Trigger run API
- **GIVEN** a valid DR/HA profile for application `app-1`
- **WHEN** a client calls `POST /drha/validations` with `app_id=app-1`
- **THEN** the system creates a new validation run
- **AND** returns a run identifier and initial status (`pending` or `running`).

#### Scenario: Get run status API
- **GIVEN** an existing validation run with ID `run-789`
- **WHEN** a client calls `GET /drha/validations/run-789`
- **THEN** the system returns:
  - Current status (`pending`, `running`, `completed`, `failed`)
  - Progress (percentage or phase)
  - Final verdict and report link when completed.

---

### Requirement: Safety and Guardrails
The system MUST provide guardrails to avoid unintended impact:
- Dry‑run mode to show which experiments would run and against which targets
- Scoped blast radius (namespaces, clusters, services) per application
- Approval gates for high‑risk experiments (e.g., region‑level failures in production).

#### Scenario: Dry‑run planning
- **GIVEN** dry‑run mode is enabled
- **WHEN** a user triggers a DR/HA validation run
- **THEN** the system does NOT execute Litmus Chaos experiments
- **AND** instead returns a plan containing the list of experiments, targets, and estimated impact.

#### Scenario: Approval gate for production
- **GIVEN** a production application with region‑level chaos experiments enabled
- **WHEN** a user attempts to run the full DR/HA suite
- **THEN** the system requires an explicit approval step (e.g., additional API call or UI confirmation)
- **AND** logs the approver identity and timestamp in the run record.

