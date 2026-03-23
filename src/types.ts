/**
 * Type definitions for audit log ingestion and PII scrubbing
 */

export interface AuditLog {
  timestamp: string;
  level: string;
  message: string;
  userId?: string;
  action?: string;
  [key: string]: unknown; // Allow additional fields
}

export interface PIIDetection {
  type: 'EMAIL' | 'CREDIT_CARD' | 'SSN' | 'PHONE' | 'PII';
  field: string;
  originalValue: string;
  timestamp: string;
}

export interface ScrubbedLog {
  log: AuditLog;
  piiDetections: PIIDetection[];
}

export interface PIIScrubberResult {
  sanitizedLog: AuditLog;
  detections: PIIDetection[];
}

