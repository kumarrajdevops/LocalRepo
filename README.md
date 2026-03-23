# Secure Audit Service

A secure HTTP endpoint service for ingesting application audit logs with PII (Personally Identifiable Information) scrubbing capabilities.

## Tech Stack

- **Node.js 20** - Runtime environment
- **TypeScript** - Type-safe development
- **Fastify** - High-performance HTTP server
- **Zod** - Schema validation
- **Vitest** - Testing framework

## Project Structure

```
secure-audit-service/
├── src/
│   ├── scrubber.ts      # PII scrubbing logic
│   ├── types.ts         # TypeScript type definitions
│   └── schema.ts        # Zod validation schemas (TODO)
├── tests/
│   └── scrubber.test.ts # Unit tests for PII scrubbing
├── package.json
└── tsconfig.json
```

## Features

### PII Scrubbing (Task #3 - Email Address Redaction)

- Detects email addresses in audit logs using regex patterns
- Replaces detected emails with `[EMAIL_REDACTED]` placeholder
- Tracks PII detection metadata (type, field, original value, timestamp)
- Preserves all non-PII fields unchanged
- Handles nested objects and arrays

## Installation

```bash
npm install
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

## Testing

The project follows Test-Driven Development (TDD) principles. Tests are written first, then implementation follows.

### Running Tests

```bash
npm test
```

### Test Coverage

Target: 100% pass rate for scenarios in `openspec/changes/audit-ingest/spec.md`

## Implementation Status

- ✅ PII Scrubbing Logic (Email Address)
- ✅ Unit Tests (TDD)
- ⏳ Zod Schema Validation
- ⏳ Fastify HTTP Endpoint
- ⏳ Database Layer (Mocked)

## OpenSpec

This project follows OpenSpec-driven development. See `openspec/` directory for:
- Change proposals
- Specifications
- Requirements and scenarios

## License

ISC

