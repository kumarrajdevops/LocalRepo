import Fastify from 'fastify';
import { initTracing } from './observability/tracing';
import { performance } from 'node:perf_hooks';
import proxy from '@fastify/http-proxy';
import { initLogger, getLogger } from './logging/agent';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { getLogsStore } from './logging/store';
import { startAlertLoop, getAlertStates, getAlertConfig, updateAlertConfig } from './alerts/state';
import { createProfile, getProfile, listProfiles, updateProfile, createValidationRun, getValidationRun, listValidationRuns } from './drha/store';
import { ExperimentPlan } from './drha/types';
import { runValidationAsync } from './drha/runner';

initTracing();
initLogger();

const fastify = Fastify();

// Prefix used when this agent UI is mounted under a reverse-proxy path, e.g.
// /agents/secure-audit-service/. All in-page links/fetch calls should use this
// prefix so the browser URL never “falls back” to absolute /sre/* routes.
const PROXY_BASE_URL = (process.env.PROXY_BASE_URL || '').replace(/\/$/, '');

type Bucket = { ts: number; requests: number; errors: number };
const buckets: Bucket[] = [];
const durations: number[] = [];
let eventLoopLagMs = 0;
setInterval(() => {
  const started = performance.now();
  setImmediate(() => {
    eventLoopLagMs = performance.now() - started;
  });
}, 1000);

function recordRequest(start: number, statusCode: number) {
  const dur = performance.now() - start;
  durations.push(dur);
  if (durations.length > 1000) durations.shift();
  const sec = Math.floor(Date.now() / 1000);
  let b = buckets[buckets.length - 1];
  if (!b || b.ts !== sec) {
    b = { ts: sec, requests: 0, errors: 0 };
    buckets.push(b);
    while (buckets.length > 120) buckets.shift();
  }
  b.requests += 1;
  if (statusCode >= 500) b.errors += 1;
}

function pct(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function windowAgg() {
  const cutoff = Math.floor(Date.now() / 1000) - 60;
  const last = buckets.filter(b => b.ts > cutoff);
  const totalReq = last.reduce((a, b) => a + b.requests, 0);
  const totalErr = last.reduce((a, b) => a + b.errors, 0);
  const rps = totalReq / 60;
  const errRps = totalErr / 60;
  const errRate = totalReq > 0 ? totalErr / totalReq : 0;
  return { rps, errRps, errRate };
}

fastify.addHook('onRequest', async (req) => {
  (req as any).__start = performance.now();
  const rid = Math.random().toString(36).slice(2);
  (req as any).__rid = rid;
  getLogger().info('request.start', { method: req.method, url: req.url }, rid);
});

fastify.addHook('onResponse', async (req, reply) => {
  const start = (req as any).__start as number;
  recordRequest(start, reply.statusCode);
  const rid = (req as any).__rid as string | undefined;
  const dur = performance.now() - start;
  const attrs = { method: req.method, url: req.url, status: reply.statusCode, duration_ms: dur };
  if (reply.statusCode >= 500) {
    getLogger().error('request.end', attrs, rid);
  } else {
    getLogger().info('request.end', attrs, rid);
  }
});

// Mount-friendly default entrypoint.
// When this agent is reverse-proxied under /agents/<slug>/, the browser hits `/`
// on the upstream. Redirect users to the main Observability UI.
fastify.get('/', async (_req, reply) => {
  return reply.redirect(`${PROXY_BASE_URL}/sre/observability`);
});

fastify.get('/metrics.json', async () => {
  const avg =
    durations.length === 0
      ? 0
      : durations.reduce((a, b) => a + b, 0) / durations.length;
  const { rps, errRps, errRate } = windowAgg();
  return {
    latency_ms: {
      p50: pct(durations, 50),
      p95: pct(durations, 95),
      p99: pct(durations, 99),
      avg
    },
    traffic: {
      rps
    },
    errors: {
      error_rps: errRps,
      error_rate_1m: errRate
    },
    saturation: {
      event_loop_lag_ms: eventLoopLagMs
    }
  };
});

fastify.get('/logs/recent.json', async (req) => {
  const q = (req.query as any) || {};
  const limit = Number(q.limit ?? 200);
  return getLogsStore().recent(limit);
});

fastify.get('/logs/search.json', async (req) => {
  const q = (req.query as any) || {};
  const since = q.since ? Number(q.since) : undefined;
  const until = q.until ? Number(q.until) : undefined;
  const level = q.level ? String(q.level) : undefined;
  const text = q.text ? String(q.text) : undefined;
  return getLogsStore().query({ since, until, level, text });
});

fastify.get('/logs/file.json', async () => {
  const file = process.env.LOG_FILE_PATH;
  if (!file) return [];
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) return [];
  try {
    const data = fs.readFileSync(abs, 'utf-8');
    const lines = data.trim().split('\n').slice(-1000);
    return lines.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
});

fastify.get('/alerts/state.json', async () => {
  return getAlertStates();
});

fastify.get('/alerts/config.json', async () => {
  return getAlertConfig();
});

fastify.post('/alerts/config.json', async (req) => {
  const body = (req.body as any) || {};
  updateAlertConfig(body);
  return getAlertConfig();
});

fastify.register(proxy, {
  upstream: process.env.JAEGER_UPSTREAM || 'http://localhost:16686',
  prefix: '/jaeger',
  replyOptions: {
    rewriteHeaders: (headers) => {
      const h = { ...headers };
      delete (h as any)['x-frame-options'];
      delete (h as any)['content-security-policy'];
      return h;
    }
  }
});

fastify.register(proxy, {
  upstream: process.env.JAEGER_UPSTREAM || 'http://localhost:16686',
  prefix: '/static',
  replyOptions: {
    rewriteHeaders: (headers) => {
      const h = { ...headers };
      delete (h as any)['x-frame-options'];
      delete (h as any)['content-security-policy'];
      return h;
    }
  }
});

fastify.register(proxy, {
  upstream: process.env.JAEGER_UPSTREAM || 'http://localhost:16686',
  prefix: '/api',
  replyOptions: {
    rewriteHeaders: (headers) => {
      const h = { ...headers };
      delete (h as any)['x-frame-options'];
      delete (h as any)['content-security-policy'];
      return h;
    }
  }
});

fastify.setErrorHandler((err, req, reply) => {
  const url = req.raw.url || '';
  if (url.startsWith('/jaeger')) {
    reply.code(502).send({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Jaeger upstream unavailable. Ensure Jaeger is running on http://localhost:16686'
    });
    return;
  }
  reply.code(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: err.message || 'Unexpected error'
  });
});

fastify.get('/sre/golden-signals', async (request, reply) => {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SRE Golden Signals</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:16px;background:#0b1020;color:#e6e8f0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.card{background:#141a33;border:1px solid #1f2a4a;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.title{font-size:14px;color:#9db2ce;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em}
.value{font-size:28px;font-weight:600}
.small{font-size:12px;color:#9db2ce}
.ok{color:#8bd5ca}.warn{color:#f4d06f}.bad{color:#ef6e6e}
</style>
</head>
<body>
  <h1>Golden Signals</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px 0">
    <button id="btnErr" style="padding:8px 12px;border-radius:8px;border:1px solid #1f2a4a;background:#1a2342;color:#e6e8f0;cursor:pointer">Burst 500 (x10)</button>
    <button id="btnOk" style="padding:8px 12px;border-radius:8px;border:1px solid #1f2a4a;background:#1a2342;color:#e6e8f0;cursor:pointer">Burst 200 (x10)</button>
    <button id="btnLatency" style="padding:8px 12px;border-radius:8px;border:1px solid #1f2a4a;background:#1a2342;color:#e6e8f0;cursor:pointer">Spike Latency (750ms x5)</button>
  </div>
  <div class="grid">
    <div class="card"><div class="title">Latency p50</div><div id="p50" class="value">-</div><div class="small">ms</div></div>
    <div class="card"><div class="title">Latency p95</div><div id="p95" class="value">-</div><div class="small">ms</div></div>
    <div class="card"><div class="title">Latency p99</div><div id="p99" class="value">-</div><div class="small">ms</div></div>
    <div class="card"><div class="title">Traffic</div><div id="rps" class="value">-</div><div class="small">requests/sec</div></div>
    <div class="card"><div class="title">Error Rate (1m)</div><div id="errRate" class="value">-</div><div class="small">fraction</div></div>
    <div class="card"><div class="title">Error RPS</div><div id="errRps" class="value">-</div><div class="small">errors/sec</div></div>
    <div class="card"><div class="title">Saturation</div><div id="elu" class="value">-</div><div class="small">event loop lag ms</div></div>
  </div>
  <script>
    function cls(v){if(v<50)return'ok';if(v<200)return'warn';return'bad'}
    async function fire(url, n){
      for(let i=0;i<n;i++){ fetch(url).catch(()=>{}); await new Promise(r=>setTimeout(r,100)); }
    }
    async function tick(){
      try{
        const r=await fetch('${PROXY_BASE_URL}/metrics.json',{cache:'no-store'});
        const m=await r.json();
        const set=(id,val,klass)=>{const el=document.getElementById(id);el.textContent=val;el.className='value '+(klass||'')}
        set('p50',m.latency_ms.p50.toFixed(1),cls(m.latency_ms.p50));
        set('p95',m.latency_ms.p95.toFixed(1),cls(m.latency_ms.p95));
        set('p99',m.latency_ms.p99.toFixed(1),cls(m.latency_ms.p99));
        set('rps',m.traffic.rps.toFixed(2),m.traffic.rps>10?'warn':'ok');
        set('errRate',m.errors.error_rate_1m.toFixed(3),m.errors.error_rate_1m>0.05?'bad':(m.errors.error_rate_1m>0.01?'warn':'ok'));
        set('errRps',m.errors.error_rps.toFixed(2),m.errors.error_rps>0?'warn':'ok');
        set('elu',m.saturation.event_loop_lag_ms.toFixed(2),cls(m.saturation.event_loop_lag_ms));
      }catch(e){}
      setTimeout(tick,2000);
    }
    document.addEventListener('DOMContentLoaded',()=>{
      const e=document.getElementById('btnErr'); if(e){ e.onclick=()=>fire('${PROXY_BASE_URL}/sre/test/error',10); }
      const o=document.getElementById('btnOk'); if(o){ o.onclick=()=>fire('${PROXY_BASE_URL}/sre/test/ok',10); }
      const l=document.getElementById('btnLatency'); if(l){ l.onclick=()=>fire('${PROXY_BASE_URL}/sre/test/latency?ms=750',5); }
    });
    tick();
  </script>
</body>
</html>`;
  reply.type('text/html; charset=utf-8');
  return reply.send(html);
});

fastify.register(async (app) => {
  // DR/HA profiles
  app.post('/drha/profiles', async (req, reply) => {
    const body = (req.body as any) || {};
    if (!body.name || !body.targetBaseUrl || !body.rtoSeconds || !body.rpoSeconds || !body.availabilityTarget || !body.maxFailoverSeconds) {
      return reply.status(400).send({ error: 'invalid_profile', message: 'Missing required fields' });
    }
    const prof = createProfile({
      name: String(body.name),
      description: body.description ? String(body.description) : undefined,
      targetBaseUrl: String(body.targetBaseUrl),
      rtoSeconds: Number(body.rtoSeconds),
      rpoSeconds: Number(body.rpoSeconds),
      availabilityTarget: Number(body.availabilityTarget),
      maxFailoverSeconds: Number(body.maxFailoverSeconds)
    });
    return reply.code(201).send(prof);
  });

  app.get('/drha/profiles', async () => {
    return listProfiles();
  });

  app.get('/drha/profiles/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const prof = getProfile(id);
    if (!prof) return reply.status(404).send({ error: 'not_found' });
    return prof;
  });

  app.patch('/drha/profiles/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const patch = (req.body as any) || {};
    const updated = updateProfile(id, patch);
    if (!updated) return reply.status(404).send({ error: 'not_found' });
    return updated;
  });

  // DR/HA validation runs
  app.post('/drha/validations', async (req, reply) => {
    const body = (req.body as any) || {};
    const profileId = String(body.profileId || '');
    const profile = getProfile(profileId);
    if (!profile) return reply.status(400).send({ error: 'invalid_profile', message: 'Unknown profileId' });

    const experiments: ExperimentPlan[] = (body.experiments as any[] | undefined)?.map((e, idx) => ({
      id: String(e.id || `exp_${idx}`),
      kind: e.kind || 'node_failure',
      description: e.description || 'DR/HA validation experiment'
    })) ?? [
      {
        id: 'exp_node_failure',
        kind: 'node_failure',
        description: 'Simulated node failure'
      }
    ];

    const run = createValidationRun(profileId, experiments);
    if (!run) return reply.status(400).send({ error: 'invalid_profile', message: 'Unable to create run' });

    // Fire-and-forget async execution
    runValidationAsync(run, profile.targetBaseUrl).catch(() => {
      // errors are handled inside runner
    });

    return reply.code(201).send(run);
  });

  app.get('/drha/validations', async (req) => {
    const q = (req.query as any) || {};
    const profileId = q.profileId ? String(q.profileId) : undefined;
    return listValidationRuns(profileId);
  });

  app.get('/drha/validations/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const run = getValidationRun(id);
    if (!run) return reply.status(404).send({ error: 'not_found' });
    return run;
  });
});

fastify.get('/sre/alerts', async (_req, reply) => {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Alert Thresholding</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1020;color:#e6e8f0}
.bar{display:flex;gap:8px;padding:12px;background:#0e1630;border-bottom:1px solid #1f2a4a;position:sticky;top:0}
.wrap{padding:12px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #1f2a4a;padding:8px;text-align:left;font-size:12px}
.ok{color:#8bd5ca}.warn{color:#f4d06f}.error{color:#ef6e6e}.critical{color:#ff5252}
.card{background:#141a33;border:1px solid #1f2a4a;border-radius:12px;padding:12px}
</style>
</head>
<body>
  <div class="bar">
    <button id="apply">Refresh</button>
    <button id="live">Live</button>
    <button id="edit">Edit Thresholds</button>
  </div>
  <div class="wrap grid">
    <div class="card">
    <table id="tbl"><thead><tr><th>metric</th><th>level</th><th>value</th><th>thresholds</th><th>since</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card" id="panel" style="display:none">
      <h3>Edit Thresholds</h3>
      <div>
        <label>Dynamic Enabled <input type="checkbox" id="dynEnabled"/></label>
      </div>
      <div>
        <label>Window Samples <input type="number" id="dynWindow" min="5" max="300"/></label>
      </div>
      <div>
        <label>Deviation Warn (%) <input type="number" id="devWarn" min="0" max="200"/></label>
        <label>Deviation Error (%) <input type="number" id="devError" min="0" max="200"/></label>
        <label>Deviation Critical (%) <input type="number" id="devCritical" min="0" max="200"/></label>
      </div>
      <div>
        <h4>Static Thresholds</h4>
        <label>p95 warn <input type="number" id="p95Warn"/></label>
        <label>p95 error <input type="number" id="p95Error"/></label>
        <label>p95 critical <input type="number" id="p95Critical"/></label>
        <br/>
        <label>errorRate warn <input type="number" step="0.001" id="erWarn"/></label>
        <label>errorRate error <input type="number" step="0.001" id="erError"/></label>
        <label>errorRate critical <input type="number" step="0.001" id="erCritical"/></label>
        <br/>
        <label>rps warn <input type="number" id="rpsWarn"/></label>
        <label>rps error <input type="number" id="rpsError"/></label>
        <label>rps critical <input type="number" id="rpsCritical"/></label>
        <br/>
        <label>lag warn <input type="number" id="lagWarn"/></label>
        <label>lag error <input type="number" id="lagError"/></label>
        <label>lag critical <input type="number" id="lagCritical"/></label>
      </div>
      <div style="margin-top:8px">
        <button id="save">Save</button>
      </div>
    </div>
  </div>
  <script>
    let timer=null;
    function fmt(t){try{return new Date(t).toLocaleTimeString()}catch{return String(t)}}
    function render(rows){
      const tbody=document.querySelector('#tbl tbody');
      tbody.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        const thr=JSON.stringify(r.thresholds||{});
        tr.innerHTML='<td>'+r.metric+'</td><td class="'+r.level+'">'+r.level+'</td><td>'+Number(r.value).toFixed(2)+'</td><td><pre style="margin:0">'+thr+'</pre></td><td>'+fmt(r.since)+'</td>';
        tbody.appendChild(tr);
      });
    }
    async function apply(){
      const res=await fetch('${PROXY_BASE_URL}/alerts/state.json',{cache:'no-store'});
      const rows=await res.json();
      render(rows);
    }
    function live(){
      if(timer){clearInterval(timer);timer=null;document.getElementById('live').textContent='Live';return;}
      document.getElementById('live').textContent='Stop Live';
      timer=setInterval(apply,1500);
    }
    async function loadConfig(){
      const c=await (await fetch('${PROXY_BASE_URL}/alerts/config.json',{cache:'no-store'})).json();
      document.getElementById('dynEnabled').checked=!!c.dynamic.enabled;
      document.getElementById('dynWindow').value=Number(c.dynamic.windowSamples||30);
      document.getElementById('devWarn').value=Number((c.dynamic.deviation?.warn||0.1)*100);
      document.getElementById('devError').value=Number((c.dynamic.deviation?.error||0.25)*100);
      document.getElementById('devCritical').value=Number((c.dynamic.deviation?.critical||0.5)*100);
      document.getElementById('p95Warn').value=Number(c.p95.warn||200);
      document.getElementById('p95Error').value=Number(c.p95.error||400);
      document.getElementById('p95Critical').value=Number(c.p95.critical||800);
      document.getElementById('erWarn').value=Number(c.errorRate.warn||0.01);
      document.getElementById('erError').value=Number(c.errorRate.error||0.05);
      document.getElementById('erCritical').value=Number(c.errorRate.critical||0.15);
      document.getElementById('rpsWarn').value=Number(c.rps.warn||50);
      document.getElementById('rpsError').value=Number(c.rps.error||200);
      document.getElementById('rpsCritical').value=Number(c.rps.critical||500);
      document.getElementById('lagWarn').value=Number(c.lag.warn||50);
      document.getElementById('lagError').value=Number(c.lag.error||200);
      document.getElementById('lagCritical').value=Number(c.lag.critical||500);
    }
    async function saveConfig(){
      const body={
        dynamic:{
          enabled: document.getElementById('dynEnabled').checked,
          windowSamples: Number(document.getElementById('dynWindow').value||30),
          deviation:{
            warn: Number(document.getElementById('devWarn').value||10)/100,
            error: Number(document.getElementById('devError').value||25)/100,
            critical: Number(document.getElementById('devCritical').value||50)/100
          }
        },
        p95:{warn:Number(document.getElementById('p95Warn').value||200),error:Number(document.getElementById('p95Error').value||400),critical:Number(document.getElementById('p95Critical').value||800)},
        errorRate:{warn:Number(document.getElementById('erWarn').value||0.01),error:Number(document.getElementById('erError').value||0.05),critical:Number(document.getElementById('erCritical').value||0.15)},
        rps:{warn:Number(document.getElementById('rpsWarn').value||50),error:Number(document.getElementById('rpsError').value||200),critical:Number(document.getElementById('rpsCritical').value||500)},
        lag:{warn:Number(document.getElementById('lagWarn').value||50),error:Number(document.getElementById('lagError').value||200),critical:Number(document.getElementById('lagCritical').value||500)}
      };
      await fetch('${PROXY_BASE_URL}/alerts/config.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      apply();
    }
    document.getElementById('apply').onclick=apply;
    document.getElementById('live').onclick=live;
    document.getElementById('edit').onclick=async ()=>{
      const panel=document.getElementById('panel');
      panel.style.display=panel.style.display==='none'?'block':'none';
      if(panel.style.display==='block'){ await loadConfig(); }
    };
    document.getElementById('save').onclick=saveConfig;
    apply();
  </script>
</body>
</html>`;
  reply.type('text/html; charset=utf-8');
  return reply.send(html);
});

fastify.get('/sre/observability', async (_req, reply) => {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Observability Dashboard</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1020;color:#e6e8f0}
.bar{display:flex;gap:8px;padding:12px;background:#0e1630;border-bottom:1px solid #1f2a4a;position:sticky;top:0}
.btn{padding:8px 12px;border-radius:8px;border:1px solid #1f2a4a;background:#141a33;color:#e6e8f0;cursor:pointer}
.btn:hover{background:#1a2342}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;height:calc(100vh - 54px)}
iframe{width:100%;height:100%;border:0}
.col{border-left:1px solid #1f2a4a}
</style>
</head>
<body>
  <div class="bar">
    <a class="btn" href="${PROXY_BASE_URL}/sre/golden-signals" target="_blank">Open Golden Signals</a>
    <a class="btn" href="${PROXY_BASE_URL}/jaeger" target="_blank">Open Jaeger</a>
  </div>
  <div class="grid">
    <div><iframe src="${PROXY_BASE_URL}/sre/golden-signals"></iframe></div>
    <div class="col"><iframe src="${PROXY_BASE_URL}/jaeger"></iframe></div>
  </div>
</body>
</html>`;
  reply.type('text/html; charset=utf-8');
  return reply.send(html);
});

fastify.get('/sre/logs', async (_req, reply) => {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Structured Logs Viewer</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1020;color:#e6e8f0}
.bar{display:flex;gap:8px;padding:12px;background:#0e1630;border-bottom:1px solid #1f2a4a;position:sticky;top:0}
input,select,button{padding:8px;border-radius:8px;border:1px solid #1f2a4a;background:#141a33;color:#e6e8f0}
button{cursor:pointer}
.wrap{padding:12px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #1f2a4a;padding:8px;text-align:left;font-size:12px}
.grid{display:grid;grid-template-columns:2fr 1fr;gap:12px}
.card{background:#141a33;border:1px solid #1f2a4a;border-radius:12px;padding:12px}
.ok{color:#8bd5ca}.warn{color:#f4d06f}.bad{color:#ef6e6e}
</style>
</head>
<body>
  <div class="bar">
    <select id="source"><option value="recent">Recent (memory)</option><option value="file">File (JSONL)</option></select>
    <select id="level"><option value="">All levels</option><option>info</option><option>warn</option><option>error</option><option>debug</option><option>trace</option><option>fatal</option></select>
    <input id="text" placeholder="Search text" />
    <button id="apply">Apply</button>
    <button id="live">Live</button>
    <button id="compare">Compare 5m vs prev 5m</button>
  </div>
  <div class="wrap grid">
    <div class="card">
      <table id="tbl"><thead><tr><th>time</th><th>level</th><th>message</th><th>attrs</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card">
      <div id="cmpTitle">Comparison</div>
      <div id="cmpBody" class="small"></div>
    </div>
  </div>
  <script>
    let timer=null;
    function fmt(t){try{return new Date(t).toLocaleTimeString()}catch{return String(t)}}
    function render(rows){
      const tbody=document.querySelector('#tbl tbody');
      tbody.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        const attrs=JSON.stringify(r.attributes||{});
        tr.innerHTML='<td>'+fmt(r.timestamp)+'</td><td>'+r.level+'</td><td>'+r.message+'</td><td><pre style="margin:0">'+attrs+'</pre></td>';
        tbody.appendChild(tr);
      });
    }
    async function fetchRecent(query){
      const p=new URLSearchParams(query).toString();
      const res=await fetch('${PROXY_BASE_URL}/logs/recent.json?'+p,{cache:'no-store'});return res.json();
    }
    async function fetchSearch(query){
      const p=new URLSearchParams(query).toString();
      const res=await fetch('${PROXY_BASE_URL}/logs/search.json?'+p,{cache:'no-store'});return res.json();
    }
    async function fetchFile(){const res=await fetch('${PROXY_BASE_URL}/logs/file.json',{cache:'no-store'});return res.json();}
    async function apply(){
      const source=document.getElementById('source').value;
      const level=document.getElementById('level').value;
      const text=document.getElementById('text').value;
      let rows=[];
      if(source==='file'){ rows=await fetchFile(); }
      else {
        if(level || text){ rows=await fetchSearch({level,text}); }
        else { rows=await fetchRecent({}); }
      }
      render(rows.reverse());
    }
    function live(){
      if(timer){clearInterval(timer);timer=null;document.getElementById('live').textContent='Live';return;}
      document.getElementById('live').textContent='Stop Live';
      timer=setInterval(apply,1500);
    }
    async function compare(){
      const now=Date.now();
      const curr=await fetchSearch({since:now-5*60*1000,until:now});
      const prev=await fetchSearch({since:now-10*60*1000,until:now-5*60*1000});
      const currErr=curr.filter(x=>String(x.level)==='error').length;
      const prevErr=prev.filter(x=>String(x.level)==='error').length;
      const body=document.getElementById('cmpBody');
      const diff=currErr-prevErr;
      const klass=diff>0?'bad':(diff<0?'ok':'warn');
      body.innerHTML='Curr 5m errors: '+currErr+'; Prev 5m: '+prevErr+'; Diff: <span class="'+klass+'">'+diff+'</span>';
    }
    document.getElementById('apply').onclick=apply;
    document.getElementById('live').onclick=live;
    document.getElementById('compare').onclick=compare;
    apply();
  </script>
</body>
</html>`;
  reply.type('text/html; charset=utf-8');
  return reply.send(html);
});

fastify.get('/drha/ui', async (_req, reply) => {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DR & HA Validation</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b1020;color:#e6e8f0}
.bar{display:flex;gap:8px;padding:12px;background:#0e1630;border-bottom:1px solid #1f2a4a;position:sticky;top:0;z-index:10}
.btn{padding:8px 12px;border-radius:8px;border:1px solid #1f2a4a;background:#141a33;color:#e6e8f0;cursor:pointer}
.btn:hover{background:#1a2342}
.wrap{padding:12px;display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:16px}
.card{background:#141a33;border:1px solid #1f2a4a;border-radius:12px;padding:12px}
label{display:block;font-size:12px;color:#9db2ce;margin-top:8px}
input,select{width:100%;padding:8px;border-radius:8px;border:1px solid #1f2a4a;background:#0b1020;color:#e6e8f0;font-size:13px}
input:focus,select:focus{outline:1px solid #3b82f6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px}
.metric-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9db2ce;margin-bottom:4px}
.metric-value{font-size:22px;font-weight:600}
.metric-sub{font-size:11px;color:#9db2ce}
.ok{color:#8bd5ca}.warn{color:#f4d06f}.bad{color:#ef6e6e}
.table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.table th,.table td{border-bottom:1px solid #1f2a4a;padding:6px;text-align:left}
.badge{display:inline-block;padding:2px 6px;border-radius:999px;font-size:11px}
.badge.running{background:#1a2342;color:#f4d06f}
.badge.completed{background:#123524;color:#8bd5ca}
.badge.failed{background:#3b0f16;color:#ef6e6e}
.small{font-size:12px;color:#9db2ce}
</style>
</head>
<body>
  <div class="bar">
    <div style="font-weight:600">DR &amp; HA Validation (Litmus Chaos Ready)</div>
    <div style="flex:1"></div>
    <button class="btn" id="btnRefresh">Refresh</button>
  </div>
  <div class="wrap">
    <div class="card">
      <h3 style="margin-top:0">Target &amp; Objectives</h3>
      <label>Target Base URL (app / web server)
        <input id="targetBaseUrl" placeholder="https://my-app.example.com" />
      </label>
      <label>Profile Name
        <input id="profileName" placeholder="web-app-prod" />
      </label>
      <label>RTO (seconds)
        <input id="rtoSeconds" type="number" min="1" value="300" />
      </label>
      <label>RPO (seconds)
        <input id="rpoSeconds" type="number" min="1" value="60" />
      </label>
      <label>Availability Target (0-1)
        <input id="availabilityTarget" type="number" min="0" max="1" step="0.0001" value="0.999" />
      </label>
      <label>Max Failover Time (seconds)
        <input id="maxFailoverSeconds" type="number" min="1" value="120" />
      </label>
      <label>Experiment Suite
        <select id="suite">
          <option value="default">Quick smoke (node failure)</option>
          <option value="node_net">Node + network</option>
          <option value="full">Full (node + network + db placeholder)</option>
        </select>
      </label>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn" id="btnRun">Run Validation</button>
        <button class="btn" id="btnLoadLast">Load Last Profile</button>
      </div>
      <div id="profileInfo" class="small" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Latest Validation Run</h3>
      <div id="runSummary" class="small">No runs yet.</div>
      <div class="grid">
        <div>
          <div class="metric-label">RTO Observed</div>
          <div id="rtoObserved" class="metric-value">-</div>
          <div class="metric-sub">seconds</div>
        </div>
        <div>
          <div class="metric-label">RPO Observed</div>
          <div id="rpoObserved" class="metric-value">-</div>
          <div class="metric-sub">seconds</div>
        </div>
        <div>
          <div class="metric-label">Availability</div>
          <div id="availabilityObserved" class="metric-value">-</div>
          <div class="metric-sub">fraction</div>
        </div>
        <div>
          <div class="metric-label">Verdict</div>
          <div id="verdict" class="metric-value">-</div>
          <div class="metric-sub">pass/fail</div>
        </div>
      </div>
      <h4 style="margin-top:16px">Experiments</h4>
      <table class="table">
        <thead><tr><th>ID</th><th>Kind</th><th>Description</th></tr></thead>
        <tbody id="experimentsBody"></tbody>
      </table>
      <h4 style="margin-top:16px">Findings &amp; Recommendations</h4>
      <div id="recommendations" class="small">Run a validation to see findings.</div>
    </div>
  </div>
  <script>
    let lastProfileId = null;
    let lastRunId = null;

    function $(id){return document.getElementById(id);}

    function statusBadge(status){
      if(!status) return '';
      const cls = status==='running'?'badge running':(status==='completed'?'badge completed':'badge failed');
      return '<span class="'+cls+'">'+status+'</span>';
    }

    function suiteToExperiments(suite){
      if(suite==='node_net'){
        return [
          { id: 'exp_node_failure', kind: 'node_failure', description: 'Simulated node failure' },
          { id: 'exp_network_partition', kind: 'network_partition', description: 'Simulated network partition' }
        ];
      }
      if(suite==='full'){
        return [
          { id: 'exp_node_failure', kind: 'node_failure', description: 'Simulated node failure' },
          { id: 'exp_network_partition', kind: 'network_partition', description: 'Simulated network partition' },
          { id: 'exp_db_failover', kind: 'db_failover', description: 'Simulated database failover (placeholder)' }
        ];
      }
      return [
        { id: 'exp_node_failure', kind: 'node_failure', description: 'Simulated node failure' }
      ];
    }

    async function createOrUpdateProfile(){
      const body = {
        name: $('profileName').value || 'drha-profile',
        targetBaseUrl: $('targetBaseUrl').value,
        rtoSeconds: Number($('rtoSeconds').value||300),
        rpoSeconds: Number($('rpoSeconds').value||60),
        availabilityTarget: Number($('availabilityTarget').value||0.999),
        maxFailoverSeconds: Number($('maxFailoverSeconds').value||120)
      };
      if(!body.targetBaseUrl){
        alert('Please provide target base URL');
        return null;
      }
      const res = await fetch('${PROXY_BASE_URL}/drha/profiles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if(!res.ok){
        alert('Failed to create profile');
        return null;
      }
      const prof = await res.json();
      lastProfileId = prof.id;
      $('profileInfo').textContent = 'Profile '+prof.name+' created (id='+prof.id+').';
      return prof;
    }

    async function loadLastProfile(){
      const res = await fetch('${PROXY_BASE_URL}/drha/profiles',{cache:'no-store'});
      if(!res.ok){ return; }
      const all = await res.json();
      if(!all.length){
        $('profileInfo').textContent = 'No profiles yet.';
        return;
      }
      const prof = all[all.length-1];
      lastProfileId = prof.id;
      $('profileName').value = prof.name || '';
      $('targetBaseUrl').value = prof.targetBaseUrl || '';
      $('rtoSeconds').value = prof.rtoSeconds || 300;
      $('rpoSeconds').value = prof.rpoSeconds || 60;
      $('availabilityTarget').value = prof.availabilityTarget || 0.999;
      $('maxFailoverSeconds').value = prof.maxFailoverSeconds || 120;
      $('profileInfo').textContent = 'Loaded last profile '+prof.name+' (id='+prof.id+').';
    }

    function renderRun(run, profile){
      if(!run){
        $('runSummary').innerHTML = 'No runs yet.';
        $('rtoObserved').textContent='-';
        $('rpoObserved').textContent='-';
        $('availabilityObserved').textContent='-';
        $('verdict').textContent='-';
        $('experimentsBody').innerHTML='';
        $('recommendations').textContent='Run a validation to see findings.';
        return;
      }
      lastRunId = run.id;
      const profName = profile && profile.name ? profile.name : run.profileId;
      const created = new Date(run.createdAt||Date.now()).toLocaleString();
      $('runSummary').innerHTML = 'Run '+run.id+' for profile '+profName+' at '+created+' '+statusBadge(run.status);
      const rtoObs = run.rtoSecondsObserved;
      const rpoObs = run.rpoSecondsObserved;
      const availObs = run.availabilityObserved;
      $('rtoObserved').textContent = rtoObs!=null ? rtoObs.toFixed(1) : '-';
      $('rpoObserved').textContent = rpoObs!=null ? rpoObs.toFixed(1) : '-';
      $('availabilityObserved').textContent = availObs!=null ? availObs.toFixed(4) : '-';
      $('verdict').textContent = run.verdict || '-';

      const tbody = $('experimentsBody');
      tbody.innerHTML = '';
      (run.experiments||[]).forEach(e=>{
        const tr = document.createElement('tr');
        tr.innerHTML='<td>'+e.id+'</td><td>'+e.kind+'</td><td>'+e.description+'</td>';
        tbody.appendChild(tr);
      });

      const rec = [];
      if(profile){
        if(rtoObs!=null && rtoObs > profile.rtoSeconds){
          rec.push('RTO is above target ('+rtoObs.toFixed(1)+'s > '+profile.rtoSeconds+'s). Consider improving failover automation, reducing recovery steps, or adding warm standby capacity.');
        } else if(rtoObs!=null){
          rec.push('RTO meets target for this run.');
        }
        if(rpoObs!=null && rpoObs > profile.rpoSeconds){
          rec.push('RPO is above target ('+rpoObs.toFixed(1)+'s > '+profile.rpoSeconds+'s). Improve replication, backup frequency, or transaction shipping.');
        } else if(rpoObs!=null){
          rec.push('RPO meets target for this run.');
        }
        if(availObs!=null && availObs < profile.availabilityTarget){
          rec.push('Availability below target ('+availObs.toFixed(4)+' < '+profile.availabilityTarget+'). Consider scaling out, multi-AZ/region, or health-check tuning.');
        } else if(availObs!=null){
          rec.push('Availability meets target for this run.');
        }
      }
      if(!rec.length){
        rec.push('Awaiting more detailed metrics; current implementation uses placeholder values. Integrate Litmus Chaos and metrics to get real DR/HA insights.');
      }
      $('recommendations').innerHTML = '<ul><li>'+rec.join('</li><li>')+'</li></ul>';
    }

    async function refreshLatest(){
      let profile = null;
      if(lastProfileId){
        const res = await fetch('${PROXY_BASE_URL}/drha/profiles/'+encodeURIComponent(lastProfileId),{cache:'no-store'});
        if(res.ok){ profile = await res.json(); }
      }
      const q = lastProfileId ? ('?profileId='+encodeURIComponent(lastProfileId)) : '';
      const resRuns = await fetch('${PROXY_BASE_URL}/drha/validations'+q,{cache:'no-store'});
      if(!resRuns.ok){
        renderRun(null, profile);
        return;
      }
      const runs = await resRuns.json();
      if(!runs.length){
        renderRun(null, profile);
        return;
      }
      const run = runs[runs.length-1];
      renderRun(run, profile);
    }

    async function runValidation(){
      const prof = await createOrUpdateProfile();
      if(!prof) return;
      const suite = $('suite').value;
      const experiments = suiteToExperiments(suite);
      const body = { profileId: prof.id, experiments };
      const res = await fetch('${PROXY_BASE_URL}/drha/validations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if(!res.ok){
        alert('Failed to create validation run');
        return;
      }
      const run = await res.json();
      renderRun(run, prof);
      // poll for completion a few times
      let attempts = 0;
      const interval = setInterval(async ()=>{
        attempts++;
        const r = await fetch('${PROXY_BASE_URL}/drha/validations/'+encodeURIComponent(run.id),{cache:'no-store'});
        if(!r.ok){ clearInterval(interval); return; }
        const updated = await r.json();
        renderRun(updated, prof);
        if(updated.status==='completed' || updated.status==='failed' || attempts>10){
          clearInterval(interval);
        }
      }, 2000);
    }

    $('btnRun').onclick = runValidation;
    $('btnLoadLast').onclick = loadLastProfile;
    $('btnRefresh').onclick = refreshLatest;
    refreshLatest();
  </script>
</body>
</html>`;
  reply.type('text/html; charset=utf-8');
  return reply.send(html);
});

fastify.get('/sre/test/ok', async (_req, reply) => {
  return reply.status(200).send({ ok: true, ts: Date.now() });
});

fastify.get('/sre/test/error', async (_req, reply) => {
  return reply.status(500).send({ ok: false, ts: Date.now(), error: 'intentional-error' });
});

fastify.get('/sre/test/latency', async (_req, reply) => {
  const delay = Number((_req.query as any)?.ms || 500);
  await new Promise(r => setTimeout(r, Math.max(0, delay)));
  return reply.send({ ok: true, delayed_ms: delay, ts: Date.now() });
});

fastify.get('/sre/test/internal-crash', async (_req, reply) => {
  return reply.status(500).send({ ok: false, ts: Date.now(), error: 'internal_crash', code: 'EINTCRASH' });
});

fastify.get('/sre/test/db-down', async (_req, reply) => {
  return reply.status(500).send({ ok: false, ts: Date.now(), error: 'db_down', code: 'EDOWNDB' });
});

fastify.get('/sre/test/status/:code', async (req, reply) => {
  const code = Number((req.params as any).code) || 500;
  const message = (req.query as any)?.message || 'test-status';
  return reply.status(code).send({ ok: code < 400, statusCode: code, message, ts: Date.now() });
});

fastify.get('/sre/test/bad-request', async (_req, reply) => {
  return reply.status(400).send({ ok: false, error: 'bad_request', ts: Date.now() });
});

fastify.get('/sre/test/unauthorized', async (_req, reply) => {
  return reply.status(401).send({ ok: false, error: 'unauthorized', ts: Date.now() });
});

fastify.get('/sre/test/forbidden', async (_req, reply) => {
  return reply.status(403).send({ ok: false, error: 'forbidden', ts: Date.now() });
});

fastify.get('/sre/test/not-found', async (_req, reply) => {
  return reply.status(404).send({ ok: false, error: 'not_found', ts: Date.now() });
});

fastify.get('/sre/test/conflict', async (_req, reply) => {
  return reply.status(409).send({ ok: false, error: 'conflict', ts: Date.now() });
});

fastify.get('/sre/test/too-many', async (_req, reply) => {
  return reply.status(429).send({ ok: false, error: 'too_many_requests', ts: Date.now() });
});

fastify.get('/sre/test/bad-gateway', async (_req, reply) => {
  return reply.status(502).send({ ok: false, error: 'bad_gateway', ts: Date.now() });
});

fastify.get('/sre/test/service-unavailable', async (_req, reply) => {
  return reply.status(503).send({ ok: false, error: 'service_unavailable', ts: Date.now() });
});

fastify.get('/sre/test/gateway-timeout', async (_req, reply) => {
  return reply.status(504).send({ ok: false, error: 'gateway_timeout', ts: Date.now() });
});

fastify.get('/sre/test/flaky', async (req, reply) => {
  const q = (req.query as any) || {};
  const rate = Math.max(0, Math.min(1, Number(q.errorRate ?? 0.3)));
  const delayMs = Number(q.delayMs ?? 0);
  if (delayMs > 0) {
    await new Promise(r => setTimeout(r, delayMs));
  }
  if (Math.random() < rate) {
    return reply.status(500).send({ ok: false, error: 'flaky_error', rate, ts: Date.now() });
  }
  return reply.send({ ok: true, rate, ts: Date.now() });
});

fastify.post('/sre/test/validate', async (req, reply) => {
  const body = (req.body as any) || {};
  if (!body || typeof body !== 'object' || !body.name) {
    return reply.status(400).send({ ok: false, error: 'validation_failed', details: ['name is required'], ts: Date.now() });
  }
  return reply.send({ ok: true, name: body.name, ts: Date.now() });
});

const PORT = Number(process.env.PORT || 3002);
function ensurePort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err) => reject(err));
    srv.once('listening', () => {
      srv.close(() => resolve());
    });
    srv.listen({ port, host: '0.0.0.0' });
  });
}
ensurePort(PORT)
  .then(() => fastify.listen({ port: PORT, host: '0.0.0.0' }))
  .catch((err) => {
    console.error('Port unavailable', PORT, err && (err as any).code);
    process.exit(1);
  });

fastify.ready().then(() => {
  const base = `http://localhost:${PORT}`;
  startAlertLoop(base);
});
