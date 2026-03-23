import { trace } from '@opentelemetry/api';
import fs from 'node:fs';
import path from 'node:path';
import { scrubPII } from '../scrubber';
import { getLogsStore } from './store';
import { notifyTeams } from './teams';

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const levelOrder: Record<Level, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

class Logger {
  private level: Level;
  private sink: 'console' | 'file';
  private filePath: string | null;
  private includeStack: boolean;
  private serviceName: string;
  private environment: string;
  private stream: fs.WriteStream | null;
  private loggerName: string;

  constructor() {
    this.level = (process.env.LOG_LEVEL as Level) || 'info';
    this.sink = (process.env.LOG_SINK as 'console' | 'file') || 'console';
    this.filePath = process.env.LOG_FILE_PATH || null;
    this.includeStack = process.env.LOG_INCLUDE_STACK === 'true';
    this.serviceName = process.env.OTEL_SERVICE_NAME || 'secure-audit-service';
    this.environment = process.env.NODE_ENV || 'development';
    this.stream = null;
    this.loggerName = 'structured-logging-agent';
    if (this.sink === 'file' && this.filePath) {
      const abs = path.isAbsolute(this.filePath) ? this.filePath : path.join(process.cwd(), this.filePath);
      try {
        this.stream = fs.createWriteStream(abs, { flags: 'a' });
      } catch {
        this.sink = 'console';
        this.stream = null;
      }
    }
  }

  private shouldLog(level: Level) {
    return levelOrder[level] >= levelOrder[this.level];
  }

  private emit(obj: Record<string, unknown>) {
    try { getLogsStore().append(obj); } catch {}
    const line = JSON.stringify(obj);
    if (this.sink === 'file' && this.stream) {
      try {
        this.stream.write(line + '\n');
        return;
      } catch {}
    }
    console.log(line);
    const lvl = String(obj.level || '');
    if (lvl === 'error' || lvl === 'fatal' || (process.env.TEAMS_ALERT_LEVEL && lvl.toLowerCase() >= String(process.env.TEAMS_ALERT_LEVEL).toLowerCase())) {
      // Fire-and-forget Teams notification
      void notifyTeams(obj);
    }
  }

  log(level: Level, message: string, attributes?: Record<string, unknown>, requestId?: string, err?: unknown) {
    if (!this.shouldLog(level)) return;
    const activeSpan = trace.getActiveSpan();
    const spanCtx = activeSpan?.spanContext();
    const base: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message: message || '',
      service_name: this.serviceName,
      environment: this.environment,
      logger_name: this.loggerName
    };
    if (spanCtx) {
      base.trace_id = spanCtx.traceId;
      base.span_id = spanCtx.spanId;
    }
    if (requestId) {
      base.request_id = requestId;
    }
    let attrs = attributes || {};
    const merged: Record<string, unknown> = { message: base.message, ...attrs };
    const scrubbed = scrubPII(merged as any);
    const sanitized = scrubbed.sanitizedLog as Record<string, unknown>;
    const piiRedacted = scrubbed.detections.length > 0;
    base.message = (sanitized.message as string) || base.message;
    const sanitizedAttrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sanitized)) {
      if (k !== 'message') sanitizedAttrs[k] = v;
    }
    base.attributes = sanitizedAttrs;
    base.pii_redacted = piiRedacted;
    if (err && this.includeStack) {
      const e = err as any;
      base.error_name = e?.name;
      base.error_message = e?.message;
      base.error_stack = e?.stack;
    }
    this.emit(base);
  }

  trace(message: string, attributes?: Record<string, unknown>, requestId?: string) {
    this.log('trace', message, attributes, requestId);
  }
  debug(message: string, attributes?: Record<string, unknown>, requestId?: string) {
    this.log('debug', message, attributes, requestId);
  }
  info(message: string, attributes?: Record<string, unknown>, requestId?: string) {
    this.log('info', message, attributes, requestId);
  }
  warn(message: string, attributes?: Record<string, unknown>, requestId?: string) {
    this.log('warn', message, attributes, requestId);
  }
  error(message: string, attributes?: Record<string, unknown>, requestId?: string, err?: unknown) {
    this.log('error', message, attributes, requestId, err);
  }
  fatal(message: string, attributes?: Record<string, unknown>, requestId?: string, err?: unknown) {
    this.log('fatal', message, attributes, requestId, err);
  }
}

let logger: Logger | null = null;

export function initLogger() {
  if (!logger) logger = new Logger();
  return logger;
}

export function getLogger() {
  if (!logger) logger = new Logger();
  return logger;
}

export function __resetLoggerForTest() {
  logger = null;
}
