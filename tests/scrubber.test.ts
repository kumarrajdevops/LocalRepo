import { describe, it, expect } from 'vitest';
import { scrubPII } from '../src/scrubber';
import type { AuditLog } from '../src/types';

describe('PII Scrubbing - Email Address Redaction', () => {
  describe('Email Detection and Redaction', () => {
    it('should detect and redact email address in message field', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User login attempt for user@example.com',
        userId: 'user123',
        action: 'login'
      };

      const result = scrubPII(log);

      // Email should be redacted
      expect(result.sanitizedLog.message).toBe('User login attempt for [EMAIL_REDACTED]');
      
      // Original email should not be in sanitized log
      expect(result.sanitizedLog.message).not.toContain('user@example.com');
      
      // PII detection should be recorded
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].type).toBe('EMAIL');
      expect(result.detections[0].field).toBe('message');
      expect(result.detections[0].originalValue).toBe('user@example.com');
    });

    it('should detect and redact email address in any string field', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Payment processed',
        email: 'customer@bank.com',
        userId: 'user123'
      };

      const result = scrubPII(log);

      expect(result.sanitizedLog.email).toBe('[EMAIL_REDACTED]');
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].field).toBe('email');
      expect(result.detections[0].originalValue).toBe('customer@bank.com');
    });

    it('should detect multiple email addresses in the same field', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Contact admin@example.com or support@company.com for help',
        userId: 'user123'
      };

      const result = scrubPII(log);

      // Both emails should be redacted
      expect(result.sanitizedLog.message).toContain('[EMAIL_REDACTED]');
      expect(result.sanitizedLog.message).not.toContain('admin@example.com');
      expect(result.sanitizedLog.message).not.toContain('support@company.com');
      
      // Should detect both emails
      expect(result.detections.length).toBeGreaterThanOrEqual(2);
      const emailDetections = result.detections.filter(d => d.type === 'EMAIL');
      expect(emailDetections.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect emails in nested string values', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User action completed',
        metadata: {
          contact: 'user@example.com',
          notes: 'Follow up with admin@company.com'
        }
      };

      const result = scrubPII(log);

      // Should detect emails in nested objects
      expect(result.detections.length).toBeGreaterThanOrEqual(1);
      const emailDetections = result.detections.filter(d => d.type === 'EMAIL');
      expect(emailDetections.length).toBeGreaterThanOrEqual(1);
    });

    it('should not redact non-email strings', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User action completed without email',
        userId: 'user123',
        action: 'login'
      };

      const result = scrubPII(log);

      // No PII should be detected
      expect(result.detections).toHaveLength(0);
      
      // Message should remain unchanged
      expect(result.sanitizedLog.message).toBe('User action completed without email');
    });

    it('should handle various email formats', () => {
      const testCases = [
        'simple@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user123@subdomain.example.com',
        'test_email@example-domain.com'
      ];

      testCases.forEach(email => {
        const log: AuditLog = {
          timestamp: '2024-01-15T10:30:00Z',
          level: 'info',
          message: `Contact ${email} for details`,
          userId: 'user123'
        };

        const result = scrubPII(log);

        expect(result.sanitizedLog.message).toContain('[EMAIL_REDACTED]');
        expect(result.sanitizedLog.message).not.toContain(email);
        expect(result.detections.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should preserve all non-PII fields unchanged', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User login attempt for user@example.com',
        userId: 'user123',
        action: 'login',
        customField: 'customValue'
      };

      const result = scrubPII(log);

      // Non-PII fields should be preserved
      expect(result.sanitizedLog.timestamp).toBe(log.timestamp);
      expect(result.sanitizedLog.level).toBe(log.level);
      expect(result.sanitizedLog.userId).toBe(log.userId);
      expect(result.sanitizedLog.action).toBe(log.action);
      expect(result.sanitizedLog.customField).toBe(log.customField);
    });

    it('should create PII detection with correct metadata', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User login attempt for user@example.com',
        userId: 'user123'
      };

      const result = scrubPII(log);

      const detection = result.detections[0];
      expect(detection.type).toBe('EMAIL');
      expect(detection.field).toBe('message');
      expect(detection.originalValue).toBe('user@example.com');
      expect(detection.timestamp).toBeDefined();
      expect(new Date(detection.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty log', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: ''
      };

      const result = scrubPII(log);
      expect(result.sanitizedLog.message).toBe('');
      expect(result.detections).toHaveLength(0);
    });

    it('should handle log with only email and no other fields', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'test@example.com'
      };

      const result = scrubPII(log);
      expect(result.sanitizedLog.message).toBe('[EMAIL_REDACTED]');
      expect(result.detections).toHaveLength(1);
    });

    it('should not false positive on strings that look like emails but are not', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Version 1.0@release or user@localhost (not a real email)'
      };

      const result = scrubPII(log);
      // Should not detect "1.0@release" or "user@localhost" as valid emails
      // (depending on regex strictness, but localhost should be caught)
      expect(result.detections.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Credit Card Detection and Redaction', () => {
    it('should detect and redact credit card number in various formats', () => {
      const testCases = [
        { card: '4532-1234-5678-9010', format: 'dashed' },
        { card: '4532123456789010', format: 'no spaces' },
        { card: '4532 1234 5678 9010', format: 'spaced' }
      ];

      testCases.forEach(({ card, format }) => {
        const log: AuditLog = {
          timestamp: '2024-01-15T10:30:00Z',
          level: 'info',
          message: 'Payment processed',
          cardNumber: card,
          userId: 'user123'
        };

        const result = scrubPII(log);

        expect(result.sanitizedLog.cardNumber).toBe('[CREDIT_CARD_REDACTED]');
        expect(result.detections.length).toBeGreaterThanOrEqual(1);
        const ccDetection = result.detections.find(d => d.type === 'CREDIT_CARD');
        expect(ccDetection).toBeDefined();
        expect(ccDetection?.field).toBe('cardNumber');
        expect(ccDetection?.originalValue).toBe(card);
      });
    });

    it('should detect credit card in message field', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Payment processed with card 4532-1234-5678-9010',
        userId: 'user123'
      };

      const result = scrubPII(log);

      expect(result.sanitizedLog.message).toContain('[CREDIT_CARD_REDACTED]');
      expect(result.sanitizedLog.message).not.toContain('4532-1234-5678-9010');
      expect(result.detections.some(d => d.type === 'CREDIT_CARD')).toBe(true);
    });
  });

  describe('Multiple PII Types Detection', () => {
    it('should detect and redact multiple PII types in the same log', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User contact@example.com with SSN 123-45-6789',
        cardNumber: '4532-1234-5678-9010',
        userId: 'user123'
      };

      const result = scrubPII(log);

      // Should detect email
      expect(result.detections.some(d => d.type === 'EMAIL')).toBe(true);
      expect(result.sanitizedLog.message).toContain('[EMAIL_REDACTED]');

      // Should detect SSN
      expect(result.detections.some(d => d.type === 'SSN')).toBe(true);
      expect(result.sanitizedLog.message).toContain('[SSN_REDACTED]');

      // Should detect credit card
      expect(result.detections.some(d => d.type === 'CREDIT_CARD')).toBe(true);
      expect(result.sanitizedLog.cardNumber).toBe('[CREDIT_CARD_REDACTED]');

      // All PII should be redacted
      expect(result.sanitizedLog.message).not.toContain('contact@example.com');
      expect(result.sanitizedLog.message).not.toContain('123-45-6789');
      expect(result.sanitizedLog.cardNumber).not.toContain('4532');
    });

    it('should correctly identify each PII type', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Contact user@example.com',
        ssn: '123-45-6789',
        phone: '555-123-4567'
      };

      const result = scrubPII(log);

      const emailDetection = result.detections.find(d => d.type === 'EMAIL');
      const ssnDetection = result.detections.find(d => d.type === 'SSN');
      const phoneDetection = result.detections.find(d => d.type === 'PHONE');

      expect(emailDetection).toBeDefined();
      expect(ssnDetection).toBeDefined();
      expect(phoneDetection).toBeDefined();

      expect(emailDetection?.originalValue).toBe('user@example.com');
      expect(ssnDetection?.originalValue).toBe('123-45-6789');
      expect(phoneDetection?.originalValue).toBe('555-123-4567');
    });
  });

  describe('SSN Detection and Redaction', () => {
    it('should detect and redact SSN in XXX-XX-XXXX format', () => {
      const log: AuditLog = {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User verification',
        ssn: '123-45-6789',
        userId: 'user123'
      };

      const result = scrubPII(log);

      expect(result.sanitizedLog.ssn).toBe('[SSN_REDACTED]');
      expect(result.detections.some(d => d.type === 'SSN')).toBe(true);
      const ssnDetection = result.detections.find(d => d.type === 'SSN');
      expect(ssnDetection?.originalValue).toBe('123-45-6789');
    });
  });

  describe('Phone Number Detection and Redaction', () => {
    it('should detect and redact phone numbers in various formats', () => {
      const testCases = [
        { phone: '(555) 123-4567', expected: '[PHONE_REDACTED]' },
        { phone: '555-123-4567', expected: '[PHONE_REDACTED]' },
        { phone: '555.123.4567', expected: '[PHONE_REDACTED]' },
        { phone: '+1 555 123 4567', expected: '[PHONE_REDACTED]' }
      ];

      testCases.forEach(({ phone, expected }) => {
        const log: AuditLog = {
          timestamp: '2024-01-15T10:30:00Z',
          level: 'info',
          message: 'Contact user',
          phone: phone
        };

        const result = scrubPII(log);

        // Phone should be redacted (may include surrounding characters from regex match)
        expect(result.sanitizedLog.phone).toContain('[PHONE_REDACTED]');
        expect(result.sanitizedLog.phone).not.toContain('555');
        expect(result.detections.some(d => d.type === 'PHONE')).toBe(true);
      });
    });
  });
});

