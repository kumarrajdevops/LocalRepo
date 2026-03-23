type LogEntry = Record<string, unknown>;

class LogsStore {
  private buffer: LogEntry[] = [];
  private max = 5000;

  append(entry: LogEntry) {
    this.buffer.push(entry);
    if (this.buffer.length > this.max) {
      this.buffer.splice(0, this.buffer.length - this.max);
    }
  }

  recent(limit = 200): LogEntry[] {
    const l = Math.max(0, Math.min(limit, this.max));
    return this.buffer.slice(Math.max(0, this.buffer.length - l));
  }

  query(params: {
    level?: string;
    text?: string;
    since?: number;
    until?: number;
  }): LogEntry[] {
    const { level, text, since, until } = params;
    const textLc = text ? String(text).toLowerCase() : null;
    return this.buffer.filter((e) => {
      const ts = Date.parse(String(e.timestamp || '')) || 0;
      if (since && ts < since) return false;
      if (until && ts > until) return false;
      if (level && String(e.level) !== level) return false;
      if (textLc) {
        const msg = String(e.message || '').toLowerCase();
        const attrs = JSON.stringify(e.attributes || {}).toLowerCase();
        if (!msg.includes(textLc) && !attrs.includes(textLc)) return false;
      }
      return true;
    });
  }
}

let store: LogsStore | null = null;
export function getLogsStore() {
  if (!store) store = new LogsStore();
  return store;
}

