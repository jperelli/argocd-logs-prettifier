#!/usr/bin/env node
// Measures the extension's cost on a live Argo CD Logs tab through the Chrome DevTools protocol.
//
//   google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/argocd-perf <argo cd logs url>
//   node scripts/perf.js [seconds=30] [label]
//
// Reports extension renders (from the panel's data-perf attribute) and main-thread long tasks
// (>50 ms), the number that matters for a responsive page. Toggle the view off with the
// { } JSON button and run it again to get Argo CD's own baseline.
const seconds = Number(process.argv[2] || 30);
const label = process.argv[3] || '';
const port = process.env.CDP_PORT || 9222;

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /\/applications\//.test(t.url));
  if (!page) throw new Error('no Argo CD application tab found on the debugging port');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (msg) => {
        if (msg.result.exceptionDetails) reject(new Error(msg.result.exceptionDetails.text));
        else resolve(msg.result.result.value);
      });
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });

  await evaluate(`(() => {
    const p = document.querySelector('.ajl-panel');
    window.__perf0 = p && p.dataset.perf ? JSON.parse(p.dataset.perf) : null;
    window.__lt = { count: 0, total: 0, max: 0 };
    if (window.__ltObs) window.__ltObs.disconnect();
    window.__ltObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { window.__lt.count++; window.__lt.total += e.duration; window.__lt.max = Math.max(window.__lt.max, e.duration); }
    });
    window.__ltObs.observe({ entryTypes: ['longtask'] });
    window.__t0 = performance.now();
    return true;
  })()`);

  await new Promise((r) => setTimeout(r, seconds * 1000));

  const out = await evaluate(`(() => {
    const p = document.querySelector('.ajl-panel');
    const cur = p && p.dataset.perf ? JSON.parse(p.dataset.perf) : null;
    const d = (k) => (cur && window.__perf0 ? cur[k] - window.__perf0[k] : cur ? cur[k] : null);
    return {
      elapsedS: (performance.now() - window.__t0) / 1000,
      enabled: !!document.querySelector('.pod-logs-viewer.ajl-on'),
      argoLines: document.querySelectorAll('.pod-logs-viewer div.noscroll').length,
      rows: document.querySelectorAll('.ajl-row').length,
      renders: d('renders'), renderMs: d('totalMs'), maxMs: cur ? cur.maxMs : null, walks: d('walks'), appends: d('appends'),
      lt: window.__lt,
    };
  })()`);
  const pct = (ms) => ((ms / (out.elapsedS * 1000)) * 100).toFixed(1) + '%';
  console.log(`== ${label} (${out.elapsedS.toFixed(0)} s, view ${out.enabled ? 'ON' : 'OFF'}, ${out.argoLines} Argo lines, ${out.rows} rows mounted)`);
  if (out.renders !== null) {
    console.log(`renders: ${out.renders} (${(out.renders / out.elapsedS).toFixed(1)}/s)  avg ${(out.renderMs / Math.max(1, out.renders)).toFixed(1)} ms  max ${out.maxMs.toFixed(1)} ms  total ${pct(out.renderMs)} of wall time  (walks ${out.walks}, appended lines ${out.appends})`);
  }
  console.log(`long tasks (>50 ms): ${out.lt.count}  total ${out.lt.total.toFixed(0)} ms = ${pct(out.lt.total)}  max ${out.lt.max.toFixed(0)} ms`);
  ws.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
