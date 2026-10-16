// Side-by-side medians for interleaved before/after runs.  usage: node cmp.mjs <prefixA> <prefixB> [n]
import fs from 'node:fs';
const [A, B, nStr] = process.argv.slice(2); const n = +(nStr || 3);
const load = (p) => Array.from({ length: n }, (_, i) => JSON.parse(fs.readFileSync(`runs/${p}_${i + 1}.json`, 'utf8')));
const med = (a) => { const s = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const rng = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? `${s[0].toFixed(0)}–${s[s.length - 1].toFixed(0)}` : '-'; };
const fx = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const metrics = [
  ['first 3D frame (ms from nav start)', (r) => r.info.marks.firstRender],
  ['loading overlay hidden (ms)', (r) => r.info.marks.loadingHidden],
  ['interactive: end of last long task (ms)', (r) => r.interactiveMs],
  ['  longest single main-thread block (ms)', (r) => Math.max(...r.longtasks.map((x) => x[1]))],
  ['  # long tasks >= 200 ms', (r) => r.longTasksOver200],
  ['EARLY PLAY (during verification): tick fps', (r) => r.early && r.early.tickFps],
  ['  frame dt p95 (ms)', (r) => r.early && r.early.dt.p95],
  ['  frame dt max (ms)', (r) => r.early && r.early.dt.max],
  ['  renders/s', (r) => r.early && r.early.rendersPerSec],
  ['AFTER VERIFICATION, idle: renders/s', (r) => r.idle.rendersPerSec],
  ['  idle GPU ms/render', (r) => r.idle.gpuMs && r.idle.gpuMs.mean],
  ['  idle main-thread CPU ms per rAF tick', (r) => r.idle.cpu.mean],
  ['FULL TEARDOWN 1x: tick fps', (r) => r.play.tickFps],
  ['  frame dt p95 (ms)', (r) => r.play.dt.p95],
  ['  frame dt max (ms)', (r) => r.play.dt.max],
  ['  GPU ms/frame mean', (r) => r.play.gpuMs && r.play.gpuMs.mean],
  ['  GPU ms/frame p95', (r) => r.play.gpuMs && r.play.gpuMs.p95],
  ['  main-thread CPU ms/frame', (r) => r.play.cpu.mean],
  ['  layout+style ms over whole play', (r) => r.play.metricsMs.LayoutDuration + r.play.metricsMs.RecalcStyleDuration],
  ['  reached t', (r) => r.play.tEnd],
  ['verification: sweep CPU ms (in worker/thread)', (r) => r.info.sweepElapsed],
  ['verification: named clearances ms', (r) => r.info.timing.named],
];
const RA = load(A), RB = load(B);
console.log('metric'.padEnd(46), `${A} median [range]`.padEnd(28), `${B} median [range]`.padEnd(28));
for (const [name, fn] of metrics) {
  const a = RA.map(fn), b = RB.map(fn);
  const d = name.includes('tick fps') || name.includes('renders/s') || name === '  reached t' ? 1 : 0;
  console.log(name.padEnd(46), `${fx(med(a), d || 1)} [${rng(a)}]`.padEnd(28), `${fx(med(b), d || 1)} [${rng(b)}]`.padEnd(28));
}
console.log('errors:', RA.concat(RB).map((r) => r.errs.length).join(','), '| badges:', [...new Set(RA.concat(RB).map((r) => r.info.badge))].join(' / '));
