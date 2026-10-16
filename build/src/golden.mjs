// Golden reference for the verification outputs. Usage: node src/golden.mjs <mode> <out.json>
//   inline  : the exact sequence app.mjs runs on the main thread (world -> asserts -> reg -> named -> parts -> sweep in ONE world)
//   checks  : worker role A (fresh process: model -> world -> asserts -> reg -> named -> parts)
//   sweep   : worker role B (fresh process: model -> world -> sweep)
import fs from 'node:fs';
import { buildModel } from './bodies.mjs';
import { buildWorld, runAsserts, regChecks, namedClearances, partScan, PairSweep } from './verify.mjs';
const [mode, out] = process.argv.slice(2);
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `__${v}__` : v)));
const res = {};
const t0 = performance.now();
const model = buildModel({ withGearbox: true });
const world = buildWorld(model);
if (mode === 'inline' || mode === 'checks') {
  res.asserts = runAsserts(model, world);
  res.reg = regChecks(model);
  res.named = namedClearances(world);
  res.parts = partScan(world, 5);
}
if (mode === 'inline' || mode === 'sweep') {
  const sw = new PairSweep(world, { step: 0.005, thr: 15, report: 15 });
  while (!sw.done) sw.run(1);
  res.sweep = { pairs: sw.pairs.map(([a, b]) => [a.id, b.id]), queries: sw.queries, results: sw.results };
}
// structuredClone must work on everything that crosses the worker boundary
for (const [k, v] of Object.entries(res)) { try { structuredClone(v); } catch (e) { console.error('NOT CLONEABLE:', k, e.message); process.exitCode = 3; } }
fs.writeFileSync(out, JSON.stringify(strip(res)));
console.log(mode, 'done in', ((performance.now() - t0) / 1000).toFixed(1), 's ->', out, Object.keys(res).join(','));
