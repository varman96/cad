// ============================================================================
// vworker.mjs — Web Worker entry.  Runs the §8 verification (asserts, regulatory
// envelope, named clearances, part scan, pairwise BVH sweep) off the main thread
// so the page renders and responds while it works.  DOM-free; verify.mjs is the
// very same code the main thread would otherwise run, on a model built by the
// very same buildModel(), so the numbers are identical (the page checks this
// with modelFingerprint()).
//
// Order (exactly the original in-thread sequence, on one world):
//   world -> asserts -> reg -> named clearances -> part scan -> pairwise sweep (progress after every pair)
// ============================================================================
import { buildModel } from './bodies.mjs';
import { buildWorld, runAsserts, regChecks, namedClearances, partScan, PairSweep } from './verify.mjs';
import { modelFingerprint } from './fingerprint.mjs';

const post = (type, payload = {}) => self.postMessage({ type, ...payload });
const ms = (t0) => performance.now() - t0;

function runChecks(model, world) {
  let t = performance.now();
  const asserts = runAsserts(model, world);
  post('asserts', { asserts, ms: ms(t) });
  post('reg', { reg: regChecks(model) });
  t = performance.now();
  const named = namedClearances(world);
  post('named', { named, ms: ms(t) });
  t = performance.now();
  post('parts', { parts: partScan(world, 5), ms: ms(t) });
}

function runSweep(world) {
  const sweep = new PairSweep(world, { step: 0.005, thr: 15, report: 15 });
  post('sweepStart', { pairs: sweep.pairs.map(([a, b]) => [a.id, b.id]), report: sweep.report, step: sweep.step, thr: sweep.thr });
  while (!sweep.done) {
    sweep.run(1);                                       // at least one pair per slice; progress after every slice
    post('sweepProgress', { cursor: sweep.cursor, queries: sweep.queries, elapsed: sweep.elapsed });
  }
  post('sweepDone', { results: sweep.results, queries: sweep.queries, elapsed: sweep.elapsed });
}

self.onmessage = (ev) => {
  const m = ev.data;
  if (!m || m.type !== 'start') return;
  try {
    let t = performance.now();
    const model = buildModel({ withGearbox: true });
    const tModel = ms(t); t = performance.now();
    const world = buildWorld(model);
    post('ready', { fingerprint: modelFingerprint(model), timing: { model: tModel, world: ms(t) } });
    runChecks(model, world);
    runSweep(world);
  } catch (e) {
    post('error', { message: String((e && e.stack) || e) });
  }
};
