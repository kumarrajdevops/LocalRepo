/**
 * PII Scrubbing Module
 * Detects and sanitizes Personally Identifiable Information (PII) in audit logs
 */

import type { AuditLog, PIIDetection, PIIScrubberResult } from './types';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// Email regex pattern - matches standard email formats
// Matches: user@domain.com, user.name@domain.co.uk, user+tag@subdomain.example.com
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Credit card regex patterns - supports multiple formats
// Format: XXXX-XXXX-XXXX-XXXX, XXXXXXXXXXXXXXXX, XXXX XXXX XXXX XXXX
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

// SSN regex pattern - format: XXX-XX-XXXX
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Phone number regex patterns - various formats
// Matches: (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX, +1 XXX XXX XXXX
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/**
 * Scrub PII from an audit log
 * @param log - The audit log to scrub
 * @returns Scrubbed log with PII detections
 */
export function scrubPII(log: AuditLog): PIIScrubberResult {
  const tracer = trace.getTracer('secure-audit-service');
  const span = tracer.startSpan('pii.scrub', undefined, context.active());
  const detections: PIIDetection[] = [];
  try {
    const sanitizedLog = scrubObject(log, '', detections) as AuditLog;
    const fieldsScrubbed = Array.from(new Set(detections.map(d => d.field)));
    const typesDetected = Array.from(new Set(detections.map(d => d.type)));
    span.setAttribute('pii.detections_count', detections.length);
    span.setAttribute('pii.fields_scrubbed', fieldsScrubbed);
    span.setAttribute('pii.types_detected', typesDetected);
    span.setStatus({ code: SpanStatusCode.OK });
    return {
      sanitizedLog,
      detections
    };
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Recursively scrub an object, detecting PII in all string fields
 */
function scrubObject(obj: unknown, fieldPath: string, detections: PIIDetection[]): unknown {
  if (typeof obj === 'string') {
    return scrubString(obj, fieldPath, detections);
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      scrubObject(item, `${fieldPath}[${index}]`, detections)
    );
  }

  if (obj !== null && typeof obj === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
      scrubbed[key] = scrubObject(value, currentPath, detections);
    }
    return scrubbed;
  }

  return obj;
}

/**
 * Scrub a string value, detecting and replacing all PII types
 * @param value - The string value to scrub
 * @param fieldPath - The path to the field (e.g., "message", "metadata.contact")
 * @param detections - Array to collect PII detections
 * @returns The scrubbed string
 */
function scrubString(value: string, fieldPath: string, detections: PIIDetection[]): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  let scrubbed = value;
  const foundPII = new Map<string, { type: PIIDetection['type']; placeholder: string }>();

  // Detect and collect all PII types
  detectAndRecordPII(value, fieldPath, detections, foundPII, EMAIL_REGEX, 'EMAIL', '[EMAIL_REDACTED]');
  detectAndRecordPII(value, fieldPath, detections, foundPII, CREDIT_CARD_REGEX, 'CREDIT_CARD', '[CREDIT_CARD_REDACTED]');
  detectAndRecordPII(value, fieldPath, detections, foundPII, SSN_REGEX, 'SSN', '[SSN_REDACTED]');
  detectAndRecordPII(value, fieldPath, detections, foundPII, PHONE_REGEX, 'PHONE', '[PHONE_REDACTED]');

  // Replace all detected PII with appropriate placeholders
  for (const [piiValue, { placeholder }] of foundPII) {
    // Escape special regex characters and replace all occurrences
    const escapedPII = piiValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const piiRegex = new RegExp(escapedPII, 'g');
    scrubbed = scrubbed.replace(piiRegex, placeholder);
  }

  return scrubbed;
}

/**
 * Detect PII in a string and record detections
 */
function detectAndRecordPII(
  value: string,
  fieldPath: string,
  detections: PIIDetection[],
  foundPII: Map<string, { type: PIIDetection['type']; placeholder: string }>,
  regex: RegExp,
  piiType: PIIDetection['type'],
  placeholder: string
): void {
  const matches = Array.from(value.matchAll(regex));
  
  for (const match of matches) {
    const piiValue = match[0];
    
    // Avoid duplicate detections for the same PII in the same field
    if (!foundPII.has(piiValue)) {
      foundPII.set(piiValue, { type: piiType, placeholder });
      
      // Record PII detection
      detections.push({
        type: piiType,
        field: fieldPath,
        originalValue: piiValue,
        timestamp: new Date().toISOString()
      });
    }
  }
}

