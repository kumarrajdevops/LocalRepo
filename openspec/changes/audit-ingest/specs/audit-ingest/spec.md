## ADDED Requirements

### Requirement: Audit Log Ingestion Endpoint
The system SHALL provide a `POST /logs` HTTP endpoint that accepts JSON audit logs from client applications, validates the schema, sanitizes PII, and stores the sanitized logs securely.

#### Scenario: Valid log ingestion (Happy Path)
- **GIVEN** the audit ingest service is running
- **WHEN** a client sends a valid JSON audit log to `POST /logs` with the following structure:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "User action completed",
    "userId": "user123",
    "action": "login"
  }
  ```
- **AND** the JSON matches the required Zod schema
- **AND** the log contains no PII
- **THEN** the system validates the JSON schema successfully
- **AND** the PII scrubbing layer processes the log and finds no PII
- **AND** the log is stored in the SQLite database as-is
- **AND** a unique log ID is generated
- **AND** a `200 OK` response is returned with the log ID in the response body:
  ```json
  {
    "status": "success",
    "logId": "log-abc123",
    "message": "Log ingested successfully"
  }
  ```
- **AND** no PII detection audit event is created

#### Scenario: Log containing an Email Address (Must be redacted)
- **GIVEN** the audit ingest service is running
- **WHEN** a client sends a valid JSON audit log to `POST /logs` containing an email address:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "User login attempt for user@example.com",
    "userId": "user123",
    "action": "login"
  }
  ```
- **AND** the JSON matches the required Zod schema
- **THEN** the email 'john@doe.com' is replaced with '[REDACTED_EMAIL]'
- **AND** the PII scrubbing layer detects the email address `user@example.com` using regex pattern matching
- **AND** the email address is replaced with the placeholder `[EMAIL_REDACTED]`
- **AND** the sanitized log stored in the database contains:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "User login attempt for [EMAIL_REDACTED]",
    "userId": "user123",
    "action": "login"
  }
  ```
- **AND** the original email address `user@example.com` is never stored in the database
- **AND** a PII detection audit event is created with metadata:
  - Timestamp of detection
  - Log ID
  - PII type: "EMAIL"
  - Original field location: "message"
- **AND** a `200 OK` response is returned with the log ID
- **AND** the response does not contain any PII

#### Scenario: Log containing a Credit Card (Must be redacted)
- **GIVEN** the audit ingest service is running
- **WHEN** a client sends a valid JSON audit log to `POST /logs` containing a credit card number:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "Payment processed",
    "userId": "user123",
    "action": "payment",
    "cardNumber": "4532-1234-5678-9010"
  }
  ```
- **AND** the JSON matches the required Zod schema
- **THEN** the system validates the JSON schema successfully
- **AND** the PII scrubbing layer detects the credit card number `4532-1234-5678-9010` using regex pattern matching (supports formats: XXXX-XXXX-XXXX-XXXX, XXXXXXXXXXXXXXXX, XXXX XXXX XXXX XXXX)
- **AND** the credit card number is replaced with the placeholder `[CREDIT_CARD_REDACTED]`
- **AND** the sanitized log stored in the database contains:
  ```json
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "Payment processed",
    "userId": "user123",
    "action": "payment",
    "cardNumber": "[CREDIT_CARD_REDACTED]"
  }
  ```
- **AND** the original credit card number `4532-1234-5678-9010` is never stored in the database
- **AND** a PII detection audit event is created with metadata:
  - Timestamp of detection
  - Log ID
  - PII type: "CREDIT_CARD"
  - Original field location: "cardNumber"
- **AND** a `200 OK` response is returned with the log ID
- **AND** the response does not contain any PII

#### Scenario: Invalid JSON payload (400 Bad Request)
- **GIVEN** the audit ingest service is running
- **WHEN** a client sends a malformed JSON payload to `POST /logs`:
  ```
  {
    "timestamp": "2024-01-15T10:30:00Z",
    "level": "info",
    "message": "User action completed"
    "userId": "user123"
  ```
- **AND** the JSON is malformed (missing comma, unclosed brace, or invalid syntax)
- **THEN** the Fastify server detects the JSON parsing error immediately
- **AND** a `400 Bad Request` response is returned with status code 400
- **AND** the error response body contains a generic error message:
  ```json
  {
    "status": "error",
    "code": "INVALID_JSON",
    "message": "Invalid JSON payload. Please check your request format."
  }
  ```
- **AND** the error message does not contain any PII or sensitive information
- **AND** no data is processed or stored in the database
- **AND** no PII scrubbing is performed
- **AND** the error is logged server-side for monitoring purposes
- **AND** the detailed error (including stack trace if applicable) is only logged server-side and never returned to the client

### Requirement: PII Detection Patterns
The system SHALL detect the following PII types using regex patterns:
- Email addresses (format: `user@domain.com`)
- Credit card numbers (formats: `XXXX-XXXX-XXXX-XXXX`, `XXXXXXXXXXXXXXXX`, `XXXX XXXX XXXX XXXX`)
- Social Security Numbers (format: `XXX-XX-XXXX`)
- Phone numbers (various formats)
- Other PII types as defined in the PII scrubbing configuration

#### Scenario: Multiple PII types detection
- **GIVEN** the audit ingest service is running with configured PII detection patterns
- **WHEN** a log contains multiple types of PII (email, credit card, SSN)
- **THEN** all PII types are detected using their respective regex patterns
- **AND** each PII type is identified correctly
- **AND** all detected PII is sanitized appropriately

### Requirement: PII Sanitization
The system SHALL replace detected PII with appropriate placeholders:
- Email addresses → `[EMAIL_REDACTED]`
- Credit card numbers → `[CREDIT_CARD_REDACTED]`
- Social Security Numbers → `[SSN_REDACTED]`
- Phone numbers → `[PHONE_REDACTED]`
- Other PII types → `[PII_REDACTED]`

#### Scenario: PII placeholder replacement
- **GIVEN** PII has been detected in a log entry
- **WHEN** the PII sanitization process runs
- **THEN** each PII type is replaced with its corresponding placeholder
- **AND** email addresses become `[EMAIL_REDACTED]`
- **AND** credit card numbers become `[CREDIT_CARD_REDACTED]`
- **AND** SSNs become `[SSN_REDACTED]`
- **AND** the original PII values are never stored in the main log table

### Requirement: PII Detection Audit
The system SHALL create an audit event whenever PII is detected, including:
- Timestamp of detection
- Associated log ID
- Type of PII detected
- Field location where PII was found
- Original PII value (stored securely, not in main log table)

#### Scenario: PII audit event creation
- **GIVEN** PII has been detected during log processing
- **WHEN** the PII detection audit event is created
- **THEN** the audit event includes the timestamp of detection
- **AND** the audit event includes the associated log ID
- **AND** the audit event includes the type of PII detected
- **AND** the audit event includes the field location where PII was found
- **AND** the original PII value is stored securely in the audit table (not in main log table)
- **AND** the audit event is linked to the original log entry
