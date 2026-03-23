type Log = Record<string, unknown>;

let lastSentAt = 0;

function shouldNotify(level: string): boolean {
  const threshold = (process.env.TEAMS_ALERT_LEVEL || 'error').toLowerCase();
  const order: Record<string, number> = {
    trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60
  };
  const lvl = order[level] ?? 0;
  const thr = order[threshold] ?? 50;
  return lvl >= thr;
}

export async function notifyTeams(log: Log): Promise<void> {
  try {
    const url = process.env.TEAMS_WEBHOOK_URL;
    if (!url) return;
    const level = String(log.level || '').toLowerCase();
    if (!shouldNotify(level)) return;
    const minInterval = Number(process.env.TEAMS_MIN_INTERVAL_MS || 30000);
    const now = Date.now();
    if (now - lastSentAt < minInterval) return;
    lastSentAt = now;

    const service = String(log.service_name || 'service');
    const title = `Error: ${String(log.message || 'event')}`;
    const summary = `${service} - ${level}`;
    const color = level === 'fatal' ? '8B0000' : 'E81123';

    const attrs = log.attributes || {};
    const facts = Object.entries(attrs as Record<string, unknown>)
      .slice(0, 12)
      .map(([name, value]) => ({ name, value: String(value) }));

    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary,
      themeColor: color,
      title,
      sections: [
        {
          facts: [
            { name: 'service', value: service },
            { name: 'environment', value: String(log.environment || '') },
            { name: 'level', value: level },
            { name: 'request_id', value: String(log.request_id || '') },
            { name: 'trace_id', value: String(log.trace_id || '') },
            { name: 'span_id', value: String(log.span_id || '') },
            { name: 'pii_redacted', value: String(log.pii_redacted || false) },
            ...facts
          ],
          text: `Time: ${String(log.timestamp || '')}`
        }
      ]
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });
  } catch {
    // Silently ignore notification errors to avoid impacting request flow
  }
}

