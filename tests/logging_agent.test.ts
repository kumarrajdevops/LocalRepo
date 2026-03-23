import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
import fs from 'node:fs';
import path from 'node:path';
import { initLogger, getLogger, __resetLoggerForTest } from '../src/logging/agent';

const tmpFile = path.join(process.cwd(), 'tests', 'tmp-logs.jsonl');
let exporter: InMemorySpanExporter;

function setupTracing() {
  const provider = new BasicTracerProvider();
  exporter = new InMemorySpanExporter();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
}

describe('Structured Logging Agent', () => {
  beforeEach(() => {
    process.env.LOG_SINK = 'file';
    process.env.LOG_FILE_PATH = 'tests/tmp-logs.jsonl';
    process.env.LOG_LEVEL = 'info';
    process.env.OTEL_SERVICE_NAME = 'secure-audit-service';
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    setupTracing();
    initLogger();
    exporter.reset();
  });

  afterEach(() => {
    delete process.env.LOG_SINK;
    delete process.env.LOG_FILE_PATH;
    delete process.env.LOG_LEVEL;
    delete process.env.OTEL_SERVICE_NAME;
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('emits JSON with schema and PII redaction', async () => {
    const tracer = trace.getTracer('test');
    await context.with(trace.setSpan(context.active(), tracer.startSpan('test-span')), async () => {
      getLogger().info('user action', { email: 'user@example.com' });
    });
    await new Promise(r => setTimeout(r, 50));
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const obj = JSON.parse(lines[0]);
    expect(obj.level).toBe('info');
    expect(obj.service_name).toBe('secure-audit-service');
    expect(typeof obj.timestamp).toBe('string');
    expect(obj.pii_redacted).toBe(true);
    expect(obj.attributes.email).toBe('[EMAIL_REDACTED]');
  });

  it('respects log level filtering', async () => {
    __resetLoggerForTest();
    process.env.LOG_LEVEL = 'error';
    initLogger();
    getLogger().info('info should not log', { a: 1 });
    getLogger().error('error should log', { b: 2 });
    await new Promise(r => setTimeout(r, 50));
    const lines = fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile, 'utf-8').trim().split('\n') : [];
    expect(lines.length).toBe(1);
    const obj = JSON.parse(lines[0]);
    expect(obj.level).toBe('error');
  });
});
