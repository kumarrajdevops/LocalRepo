import { notifyTeams } from '../logging/teams';

type Level = 'ok' | 'warn' | 'error' | 'critical';

export type AlertState = {
  metric: string;
  level: Level;
  value: number;
  thresholds: Record<string, number>;
  since: number;
  lastChange: number;
  cooldownUntil?: number;
};

const states: Record<string, AlertState> = {};

function now() { return Date.now(); }

function parseNum(env: string | undefined, def: number) {
  const n = Number(env);
  return Number.isFinite(n) ? n : def;
}

function levelFor(value: number, thr: Record<string, number>): Level {
  if (Number.isFinite(thr.critical) && value >= thr.critical) return 'critical';
  if (Number.isFinite(thr.error) && value >= thr.error) return 'error';
  if (Number.isFinite(thr.warn) && value >= thr.warn) return 'warn';
  return 'ok';
}

function hysteresis(prev: Level, next: Level) {
  // Simple hysteresis: only allow downgrade by one level at a time
  const order: Record<Level, number> = { ok: 0, warn: 1, error: 2, critical: 3 };
  if (order[next] < order[prev] - 1) {
    const map = { 3: 'error', 2: 'warn', 1: 'ok' } as any;
    return map[order[prev] - 1] as Level;
  }
  return next;
}

function shouldNotify(level: Level) {
  return level === 'error' || level === 'critical';
}

export function getAlertStates() {
  return Object.values(states);
}

async function evaluateMetric(baseUrl: string, key: string, value: number, thr: Record<string, number>) {
  const prev = states[key];
  const nextLvlRaw = levelFor(value, thr);
  const nextLvl = prev ? hysteresis(prev.level, nextLvlRaw) : nextLvlRaw;
  const cooldownMs = parseNum(process.env.ALERT_COOLDOWN_MS, 15000);
  const durationMs = parseNum(process.env.ALERT_MIN_DURATION_MS, 5000);
  const t = now();
  let state = prev;
  if (!state) {
    state = { metric: key, level: nextLvl, value, thresholds: thr, since: t, lastChange: t };
  } else {
    state.value = value;
    state.thresholds = thr;
    if (nextLvl !== state.level) {
      const canChange = !state.cooldownUntil || t >= state.cooldownUntil;
      if (canChange && t - state.since >= durationMs) {
        state.level = nextLvl;
        state.lastChange = t;
        state.since = t;
        state.cooldownUntil = t + cooldownMs;
        if (shouldNotify(nextLvl)) {
          await notifyTeams({
            level: 'error',
            message: `alert.transition:${key}:${nextLvl}`,
            service_name: process.env.OTEL_SERVICE_NAME || 'secure-audit-service',
            environment: process.env.NODE_ENV || 'development',
            attributes: { metric: key, level: nextLvl, value, thresholds: thr }
          });
        }
      }
    }
  }
  states[key] = state!;
}

type Thresholds = { warn: number; error: number; critical: number };
type AlertsConfig = {
  p95: Thresholds;
  errorRate: Thresholds;
  rps: Thresholds;
  lag: Thresholds;
  dynamic: {
    enabled: boolean;
    windowSamples: number;
    deviation: Thresholds; // percentage expressed as 0.10 = +10%
  };
};

let config: AlertsConfig = {
  p95: {
    warn: parseNum(process.env.ALERT_LATENCY_P95_WARN, 200),
    error: parseNum(process.env.ALERT_LATENCY_P95_ERROR, 400),
    critical: parseNum(process.env.ALERT_LATENCY_P95_CRITICAL, 800)
  },
  errorRate: {
    warn: parseNum(process.env.ALERT_ERROR_RATE_WARN, 0.01),
    error: parseNum(process.env.ALERT_ERROR_RATE_ERROR, 0.05),
    critical: parseNum(process.env.ALERT_ERROR_RATE_CRITICAL, 0.15)
  },
  rps: {
    warn: parseNum(process.env.ALERT_RPS_WARN, 50),
    error: parseNum(process.env.ALERT_RPS_ERROR, 200),
    critical: parseNum(process.env.ALERT_RPS_CRITICAL, 500)
  },
  lag: {
    warn: parseNum(process.env.ALERT_LAG_WARN, 50),
    error: parseNum(process.env.ALERT_LAG_ERROR, 200),
    critical: parseNum(process.env.ALERT_LAG_CRITICAL, 500)
  },
  dynamic: {
    enabled: false,
    windowSamples: 30,
    deviation: { warn: 0.1, error: 0.25, critical: 0.5 }
  }
};

const hist = {
  p95: [] as number[],
  errorRate: [] as number[],
  rps: [] as number[],
  lag: [] as number[]
};

export function getAlertConfig(): AlertsConfig {
  return config;
}

export function updateAlertConfig(partial: Partial<AlertsConfig>) {
  config = {
    ...config,
    ...partial,
    p95: { ...config.p95, ...(partial.p95 || {}) },
    errorRate: { ...config.errorRate, ...(partial.errorRate || {}) },
    rps: { ...config.rps, ...(partial.rps || {}) },
    lag: { ...config.lag, ...(partial.lag || {}) },
    dynamic: { ...config.dynamic, ...(partial.dynamic || {}) }
  };
}

function applyDynamic(base: number, dev: Thresholds): Thresholds {
  return {
    warn: base * (1 + dev.warn),
    error: base * (1 + dev.error),
    critical: base * (1 + dev.critical)
  };
}

export function startAlertLoop(baseUrl: string) {
  const url = `${baseUrl}/metrics.json`;
  setInterval(async () => {
    try {
      const res = await fetch(url);
      const m: any = await res.json();
      const p95 = Number((m && m.latency_ms && m.latency_ms.p95) ?? 0);
      const errRate = Number((m && m.errors && m.errors.error_rate_1m) ?? 0);
      const rps = Number((m && m.traffic && m.traffic.rps) ?? 0);
      const lag = Number((m && m.saturation && m.saturation.event_loop_lag_ms) ?? 0);
      // Update history
      const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > config.dynamic.windowSamples) arr.shift(); };
      push(hist.p95, p95); push(hist.errorRate, errRate); push(hist.rps, rps); push(hist.lag, lag);
      const useDyn = config.dynamic.enabled;
      const thrP95 = useDyn ? applyDynamic(avg(hist.p95), config.dynamic.deviation) : config.p95;
      const thrErr = useDyn ? applyDynamic(avg(hist.errorRate), config.dynamic.deviation) : config.errorRate;
      const thrRps = useDyn ? applyDynamic(avg(hist.rps), config.dynamic.deviation) : config.rps;
      const thrLag = useDyn ? applyDynamic(avg(hist.lag), config.dynamic.deviation) : config.lag;
      await evaluateMetric(baseUrl, 'latency_p95_ms', p95, thrP95);
      await evaluateMetric(baseUrl, 'error_rate_1m', errRate, thrErr);
      await evaluateMetric(baseUrl, 'rps', rps, thrRps);
      await evaluateMetric(baseUrl, 'event_loop_lag_ms', lag, thrLag);
    } catch {
      // ignore
    }
  }, 2000);
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
