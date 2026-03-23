import { describe, it, expect, beforeEach } from 'vitest';
import { scrubPII } from '../src/scrubber';
import type { AuditLog } from '../src/types';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';

let exporter: InMemorySpanExporter;

function setupTracing() {
  const provider = new BasicTracerProvider();
  exporter = new InMemorySpanExporter();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
}

describe('OpenTelemetry - PII Scrubber Spans', () => {
  beforeEach(() => {
    setupTracing();
    exporter.reset();
  });

  it('creates pii.scrub span with attributes and no PII values', () => {
    const log: AuditLog = {
      timestamp: '2024-01-15T10:30:00Z',
      level: 'info',
      message: 'User email user@example.com and card 4532-1234-5678-9010',
    };

    const result = scrubPII(log);
    expect(result.detections.length).toBeGreaterThan(0);

    const spans: ReadableSpan[] = exporter.getFinishedSpans();
    const scrubSpan = spans.find((s: ReadableSpan) => s.name === 'pii.scrub');
    expect(scrubSpan).toBeDefined();
    if (!scrubSpan) return;

    const attrs = scrubSpan.attributes;
    expect(attrs['pii.detections_count']).toBeGreaterThan(0);

    const fields = attrs['pii.fields_scrubbed'] as string[] | undefined;
    expect(Array.isArray(fields)).toBe(true);
    expect(fields!.length).toBeGreaterThan(0);

    const types = attrs['pii.types_detected'] as string[] | undefined;
    expect(Array.isArray(types)).toBe(true);
    expect(types!.length).toBeGreaterThan(0);

    // Ensure no raw PII present in attributes
    const attrValues = Object.values(attrs).flatMap(v => Array.isArray(v) ? v : [v]);
    expect(attrValues.some(v => typeof v === 'string' && v.includes('user@example.com'))).toBe(false);
    expect(attrValues.some(v => typeof v === 'string' && v.includes('4532-1234-5678-9010'))).toBe(false);
  });
});
