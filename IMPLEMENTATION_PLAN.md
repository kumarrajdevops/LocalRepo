# Implementation Plan - Task #3: Email Address Redaction

## Files to Create

### Core Implementation
1. **src/types.ts** - TypeScript type definitions for audit logs and PII detection
2. **src/schema.ts** - Zod schema for JSON validation
3. **src/scrubber.ts** - PII scrubbing logic (EMAIL focus for Task #3)
4. **src/db.ts** - Mock database layer (no actual DB implementation yet)
5. **src/index.ts** - Fastify server setup with POST /logs endpoint

### Tests (TDD - Write First)
6. **tests/scrubber.test.ts** - Unit tests for PII scrubbing logic
   - Email detection tests
   - Email redaction tests
   - Multiple email detection
   - Edge cases

### Configuration
7. **.gitignore** - Git ignore patterns
8. **README.md** - Project documentation

## Implementation Order (TDD)
1. Write tests/scrubber.test.ts FIRST
2. Implement src/scrubber.ts to pass tests
3. Implement src/schema.ts for validation
4. Implement src/types.ts for type safety
5. Implement src/db.ts (mock)
6. Implement src/index.ts (basic endpoint)

## Focus: Email Address Redaction Scenario
From spec.md line 34-67:
- Detect email addresses using regex
- Replace with `[EMAIL_REDACTED]`
- Track PII detection metadata
- Ensure original email never stored

