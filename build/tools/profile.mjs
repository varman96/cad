// RB7 perf harness: real GPU (ANGLE/D3D11), 1280x800 CSS @ DPR 1.5 = this XPS 13's actual display config.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const html = args.html; const label = args.label || 'run';
const dpr = +(args.dpr || 1.5); const noAA = !!args.noaa; const noBlur = !!args.noblur; const noShadow = !!args.noshadow; const cpuThrottle = +(args.throttle || 1);
const headful = !!args.headful; const unlimited = !!args.unlimited;       // unlimited: no vsync cap -> raw cost per frame
const playSecs = +(args.play || 6); const waitSweep = args.nosweepwait ? false : true;
const url = 'file:///' + html.split('\\').join('/');

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: headful ? false : 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...(unlimited ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: dpr },
});
const page = await browser.newPage();
const client = await page.createCDPSession();
if (cpuThrottle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
await client.send('Performance.enable');
if (args.nocache) { await client.send('Network.enable'); await client.send('Network.setCacheDisabled', { cacheDisabled: true }); }

await page.evaluateOnNewDocument((opts) => {
  const P = { longtasks: [], frames: [], gpu: [], tris: 0, calls: 0, marks: {}, q: [], programs: 0, recording: false };
  window.__P = P;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] });
  // capture the GL context; optionally force antialias off
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, a) {
    if (opts.noAA && a) a = { ...a, antialias: false };
    const gl = orig.call(this, type, a);
    if (gl && type === 'webgl2' && !P.gl) {
      P.gl = gl; P.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const wrap = (name, trisOf) => { const f = gl[name].bind(gl); gl[name] = (...x) => { P.calls++; P.tris += trisOf(x); return f(...x); }; };
      const tri = (mode, n) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
      wrap('drawElements', (x) => tri(x[0], x[1])); wrap('drawArrays', (x) => tri(x[0], x[2]));
      wrap('drawElementsInstanced', (x) => tri(x[0], x[1]) * x[4]); wrap('drawArraysInstanced', (x) => tri(x[0], x[2]) * x[4]);
      const lp = gl.linkProgram.bind(gl); gl.linkProgram = (p) => { P.programs++; return lp(p); };
      P.attrs = gl.getContextAttributes();
    }
    return gl;
  };
  // wrap rAF: frame interval, per-callback CPU time, GPU time via timer query, draw calls/tris per frame
  const raf = window.requestAnimationFrame.bind(window); let last = 0;
  window.requestAnimationFrame = (cb) => raf((t) => {
    const gl = P.gl, ext = P.ext; let q = null;
    const c0 = P.calls, t0 = P.tris;
    if (gl && ext && P.recording) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const s = performance.now(); cb(t); const cpu = performance.now() - s;
    if (P.marks.firstRender === undefined && P.calls - c0 > 0) { P.marks.firstRender = performance.now(); P.marks.firstRenderCpu = cpu; }
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); P.q.push({ q, calls: P.calls - c0 }); }
    if (P.recording) P.frames.push({ t: Math.round(t), dt: +(t - last).toFixed(2), cpu: +cpu.toFixed(2), calls: P.calls - c0, tris: P.tris - t0 });
    last = t;
    if (gl && ext) while (P.q.length) { const { q: qq, calls } = P.q[0]; if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) break; if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && calls > 0) P.gpu.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6); P.q.shift(); }
  });
  // startup markers
  const mo = new MutationObserver(() => {
    const l = document.getElementById('loading'); if (l && l.classList.contains('hidden') && P.marks.loadingHidden === undefined) P.marks.loadingHidden = performance.now();
    const b = document.getElementById('badge'); if (b && /sweep|flagged/.test(b.textContent) && P.marks.firstBadge === undefined) P.marks.firstBadge = performance.now();
  });
  document.addEventListener('DOMContentLoaded', () => { P.marks.dcl = performance.now(); mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true }); });
}, { noAA });

if (noBlur) await page.evaluateOnNewDocument(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'; document.head.appendChild(s); }); });

const errs = []; page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

const m0 = await client.send('Performance.getMetrics');
const tNav = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.RB7 && window.RB7.V', { timeout: 120000 });
const tReady = Date.now() - tNav;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
const res = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => ({ n: e.name.split('/').slice(-2).join('/'), start: Math.round(e.startTime), dur: Math.round(e.duration), kb: Math.round(e.transferSize / 1024) })));

if (noShadow) await page.evaluate(() => { window.RB7.scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = false; }); });

// --- phase E: press play as soon as the page is up, i.e. while the self-check is still running ---
let phaseEarly = null, earlyInfo = null;
if (args.early) {
  const earlySecs = +(args.early === true ? 10 : args.early);
  await page.evaluate(() => { const P = window.__P; P.recording = true; P.frames.length = 0; P.gpu.length = 0; window.__earlyT0 = performance.now(); document.getElementById('btnPlay').click(); });
  await new Promise((r) => setTimeout(r, earlySecs * 1000));
  phaseEarly = await page.evaluate(() => { const P = window.__P; const o = { f: P.frames.slice(), g: P.gpu.slice(), t: window.RB7.state.t, sweepDone: !!(window.RB7.V.sweep && window.RB7.V.sweep.done) }; P.frames.length = 0; P.gpu.length = 0; window.RB7.state.playing = false; window.RB7.applyT(0); return o; });
  earlyInfo = { tEnd: +phaseEarly.t.toFixed(3), verificationDoneWithin: phaseEarly.sweepDone };
}
// --- phase 1: frames while the sweep is still running (if it is) ---
await page.evaluate(() => { window.__P.recording = true; window.__P.frames.length = 0; window.__P.gpu.length = 0; });
const swStart = await page.evaluate(() => performance.now());
let sweepDoneAt = null;
if (waitSweep) { await page.waitForFunction('window.RB7.V.sweep && window.RB7.V.sweep.done', { timeout: 900000, polling: 250 }); sweepDoneAt = await page.evaluate(() => performance.now()); }
const phaseSweep = await page.evaluate(() => { const P = window.__P; const o = { f: P.frames.slice(), g: P.gpu.slice() }; P.frames.length = 0; P.gpu.length = 0; return o; });
const mS = await client.send('Performance.getMetrics');

// --- phase 2: idle, sweep finished, scene static ---
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { window.__P.frames.length = 0; window.__P.gpu.length = 0; });
await new Promise((r) => setTimeout(r, 3000));
const phaseIdle = await page.evaluate(() => { const P = window.__P; const o = { f: P.frames.slice(), g: P.gpu.slice() }; P.frames.length = 0; P.gpu.length = 0; return o; });

// --- phase 3: explosion animation (play at 1x for playSecs) ---
const mA = await client.send('Performance.getMetrics');
await page.evaluate(() => { window.RB7.applyT(0); window.__P.frames.length = 0; window.__P.gpu.length = 0; document.getElementById('btnPlay').click(); });
await new Promise((r) => setTimeout(r, playSecs * 1000));
const phasePlay = await page.evaluate(() => { const P = window.__P; const o = { f: P.frames.slice(), g: P.gpu.slice(), t: window.RB7.state.t }; P.frames.length = 0; P.gpu.length = 0; return o; });
const mB = await client.send('Performance.getMetrics');

const info = await page.evaluate(() => ({ marks: window.__P.marks, attrs: window.__P.attrs, programs: window.__P.programs, longtasks: window.__P.longtasks, timing: window.RB7.V.timing,
  badge: document.getElementById('badge').textContent, sweepElapsed: window.RB7.V.sweep && Math.round(window.RB7.V.sweep.elapsed),
  dpr: devicePixelRatio, canvas: [document.getElementById('c').width, document.getElementById('c').height],
  scene: (() => { let m = 0, tr = 0; window.RB7.scene.traverse((o) => { if (o.isMesh) { m++; const g = o.geometry; tr += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { meshes: m, tris: Math.round(tr) }; })() }));

const stat = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
const fr = (a) => { const dts = a.map((f) => f.dt).filter((d) => d > 0 && d < 1000); const mean = dts.reduce((x, y) => x + y, 0) / (dts.length || 1); const r = a.filter((f) => f.calls > 0); const span = a.length ? (a[a.length - 1].t - a[0].t) / 1000 : 0; return { ticks: a.length, tickFps: +(1000 / mean).toFixed(1), renders: r.length, rendersPerSec: span ? +(r.length / span).toFixed(1) : 0, dt: stat(dts), cpu: stat(a.map((f) => f.cpu)), cpuRendered: stat(r.map((f) => f.cpu)), calls: stat(r.map((f) => f.calls)), tris: stat(r.map((f) => f.tris)), worstDt: dts.length ? Math.max(...dts) : null }; };
const ds = (m1, m0_) => { const g = (m, n) => m.metrics.find((x) => x.name === n).value; const d = {}; for (const n of ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']) d[n] = +((g(m1, n) - g(m0_, n)) * 1000).toFixed(0); return d; };

const out = { label, cfg: { nocache: !!args.nocache, dpr, noAA, noBlur, noShadow, cpuThrottle, unlimited, headful }, tReadyMs: tReady, nav, info: { ...info, longtasks: undefined, nLong: info.longtasks.length }, errs,
  early: phaseEarly ? { ...fr(phaseEarly.f), gpuMs: stat(phaseEarly.g), ...earlyInfo } : null,
  sweepPhase: { ...fr(phaseSweep.f), gpuMs: stat(phaseSweep.g), sweepWallMs: sweepDoneAt ? Math.round(sweepDoneAt - swStart) : null, metricsFromStartMs: ds(mS, m0) },
  idle: { ...fr(phaseIdle.f), gpuMs: stat(phaseIdle.g) },
  play: { ...fr(phasePlay.f), gpuMs: stat(phasePlay.g), tEnd: +phasePlay.t.toFixed(3), metricsMs: ds(mB, mA) },
  resources: res.filter((r) => /three|bvh|jsm|three-mesh/.test(r.n)),
};
const lts = info.longtasks.slice().sort((a, b) => a[0] - b[0]);
let tti = 0; for (let i = 0; i < lts.length; i++) { const end = lts[i][0] + lts[i][1], next = lts[i + 1] ? lts[i + 1][0] : Infinity; tti = end; if (next - end >= 2000) break; }
out.interactiveMs = tti;                       // end of last long task before the first 2 s window with no long task
out.longTasksOver200 = lts.filter((x) => x[1] >= 200).length;
console.log(JSON.stringify(out, null, 1));
console.log('longtasks [start,dur]:', JSON.stringify(info.longtasks.slice(0, 40)));
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ ...out, longtasks: info.longtasks }, null, 1));
await browser.close();
