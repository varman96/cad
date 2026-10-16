// ============================================================================
// verify.mjs — §8 asserts, regulatory envelope checks, named clearances and the
// pairwise BVH sweep.  DOM-free; used by the page and by the Node test harness.
// ============================================================================
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { DEG, smoothstep, v3, gammaFn } from './core.mjs';
import * as S from './spec.mjs';
import { drsPivot, diffuserRoofY, exhaustArcLength, endplateInnerX } from './bodies.mjs';

const { K } = S;

// three-mesh-bvh logs a warning for every coplanar triangle pair (designed coincident faces); silence just that one.
const _warn = console.warn;
console.warn = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('ExtendedTriangle.intersectsTriangle')) return; _warn.apply(console, a); };

// ---------------------------------------------------------------------------
// Geometry -> collision world (mm, frame B at t = 0, mirrored bodies baked)
// ---------------------------------------------------------------------------
function makeGeometry(meshes, mirror, flipPartFilter) {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.p.length; ni += m.i.length; }
  const pos = new Float32Array(nv), idx = new Uint32Array(ni);
  let po = 0, io = 0, vb = 0;
  for (const m of meshes) {
    for (let k = 0; k < m.p.length; k += 3) { pos[po++] = mirror ? -m.p[k] : m.p[k]; pos[po++] = m.p[k + 1]; pos[po++] = m.p[k + 2]; }
    for (let k = 0; k < m.i.length; k += 3) {
      if (mirror) { idx[io++] = m.i[k] + vb; idx[io++] = m.i[k + 2] + vb; idx[io++] = m.i[k + 1] + vb; }
      else { idx[io++] = m.i[k] + vb; idx[io++] = m.i[k + 1] + vb; idx[io++] = m.i[k + 2] + vb; }
    }
    vb += m.p.length / 3;
  }
  void flipPartFilter;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  g.boundsTree = new MeshBVH(g, { maxLeafTris: 8 });
  return g;
}

export function buildWorld(model, { includeExtras = false } = {}) {
  const world = { bodies: [], byId: {} };
  const add = (b, extra = false) => {
    const rec = {
      id: b.id, base: b.base ?? b.id, side: b.side ?? 0, mirror: !!b.mirror, win: b.win ?? null, dB: b.dB ?? [0, 0, 0],
      stage: b.stage, extra, parts: [],
    };
    rec.geom = makeGeometry(b.parts.map((p) => p.mesh), rec.mirror);
    for (const p of b.parts) {
      const g = makeGeometry([p.mesh], rec.mirror);
      rec.parts.push({ name: p.name, geom: g, bbox: g.boundingBox });
    }
    world.bodies.push(rec); world.byId[rec.id] = rec;
  };
  for (const b of model.bodies) add(b);
  if (includeExtras) for (const e of model.extras) add({ ...e, id: e.id, parts: e.parts, dB: [0, 0, 0], win: null }, true);
  return world;
}

/** body offset in mm at timeline t (translation only, §6.4) */
export function offsetAt(body, t) {
  if (!body.win) return [0, 0, 0];
  const s = Math.min(1, Math.max(0, (t - body.win[0]) / (body.win[1] - body.win[0])));
  const e = smoothstep(s);
  return [body.dB[0] * e * 1000, body.dB[1] * e * 1000, body.dB[2] * e * 1000];
}

const boxGap = (A, oA, B, oB) => {
  let g2 = 0;
  for (let a = 0; a < 3; a++) {
    const lo = Math.max(A.min.getComponent(a) + oA[a], B.min.getComponent(a) + oB[a]);
    const hi = Math.min(A.max.getComponent(a) + oA[a], B.max.getComponent(a) + oB[a]);
    if (lo > hi) g2 += (lo - hi) * (lo - hi);
  }
  return Math.sqrt(g2);
};
const _mat = new THREE.Matrix4();
const triCount = (g) => g.index.count / 3;
/**
 * closest distance between two (BVH-carrying) geometries given their translational offsets (mm);
 * Infinity if > thr; 0 when triangles touch/intersect (three-mesh-bvh intersectsGeometry).
 * The geometry with fewer triangles drives the traversal (large speed-up for the monocoque).
 */
export function distance(gA, oA, gB, oB, thr = Infinity) {
  const swap = triCount(gA) > triCount(gB);
  const g1 = swap ? gB : gA, g2 = swap ? gA : gB;
  const dx = swap ? oA[0] - oB[0] : oB[0] - oA[0], dy = swap ? oA[1] - oB[1] : oB[1] - oA[1], dz = swap ? oA[2] - oB[2] : oB[2] - oA[2];
  _mat.makeTranslation(dx, dy, dz);
  if (g1.boundsTree.intersectsGeometry(g2, _mat)) return 0;
  const r = g1.boundsTree.closestPointToGeometry(g2, _mat, {}, {}, 0, thr);
  return r ? r.distance : Infinity;
}
/** min distance over a list of parts pairs / times */
export function minDistanceParts(world, A, partsA, B, partsB, times, thr = 500) {
  const gA = partsA ? mergeParts(A, partsA) : A.geom, gB = partsB ? mergeParts(B, partsB) : B.geom;
  const key = (oA, oB) => `${Math.round((oB[0] - oA[0]) * 1e4)},${Math.round((oB[1] - oA[1]) * 1e4)},${Math.round((oB[2] - oA[2]) * 1e4)}`;
  const seen = new Set();
  let best = { d: Infinity, t: null }, thrK = thr;
  const eval1 = (t) => {
    const oA = offsetAt(A, t), oB = offsetAt(B, t), k = key(oA, oB);
    if (seen.has(k)) return;                                                   // identical relative pose already evaluated
    seen.add(k);
    if (boxGap(gA.boundingBox, oA, gB.boundingBox, oB) >= thrK) return;       // cannot beat the best so far
    const d = distance(gA, oA, gB, oB, thrK);                                  // pruned by the best distance so far
    if (d < best.d) { best = { d, t }; thrK = Math.min(thrK, d + 1e-9); }
  };
  // coarse-first: every 10th sample establishes a tight bound, then the rest are pruned against it
  for (let i = 0; i < times.length; i += 10) eval1(times[i]);
  for (let i = 0; i < times.length; i++) if (i % 10) eval1(times[i]);
  // local refinement around the best time (1/32 of the sampling step either side)
  if (best.t !== null && times.length > 1) {
    const st = Math.abs(times[1] - times[0]) || 0.001; const t0 = best.t;
    for (let j = -16; j <= 16; j++) eval1(Math.min(1, Math.max(0, t0 + st * j / 16)));
  }
  return best;
}
const _mergeCache = new Map();
function mergeParts(body, names) {
  const key = body.id + '|' + names.join(',');
  if (_mergeCache.has(key)) return _mergeCache.get(key);
  const sel = body.parts.filter((p) => names.some((n) => (n.endsWith('*') ? p.name.startsWith(n.slice(0, -1)) : p.name === n)));
  if (!sel.length) throw new Error(`no parts ${names} in ${body.id}`);
  let g;
  if (sel.length === 1) g = sel[0].geom;
  else {
    let nv = 0, ni = 0; for (const p of sel) { nv += p.geom.attributes.position.array.length; ni += p.geom.index.array.length; }
    const pos = new Float32Array(nv), idx = new Uint32Array(ni); let po = 0, io = 0, vb = 0;
    for (const p of sel) { const a = p.geom.attributes.position.array, ix = p.geom.index.array; pos.set(a, po); po += a.length; for (let k = 0; k < ix.length; k++) idx[io++] = ix[k] + vb; vb += a.length / 3; }
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox(); g.boundsTree = new MeshBVH(g, { maxLeafTris: 8 });
  }
  _mergeCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// Designed contacts (§8.10 of the spec, confirmed in RB7_SPEC_CORRECTIONS.md §7)
// ---------------------------------------------------------------------------
export const DESIGNED_CONTACT = [
  { a: 'monocoque_survival_cell', b: 'nose_and_front_wing_cascade', parts: [['skin', 'nose_cone']], tol: 1, why: '§5.2: nose rear station = monocoque front station ("seamless joint"); bodies share the z=350 plane' },
  { a: 'engine_cover_and_sharkfin', b: 'sidepod_pods', sided: true, parts: [['canopy', 'shell']], tol: 1, why: '§5.3 / §7.3: cover skirts sit on the pod top inner edges (skirt = pod top inner edge)' },
  { a: 'monocoque_survival_cell', b: 'floor_and_blown_diffuser', parts: [['skin', 'strip_top_plate']], tol: 1, why: '§5.6: monocoque underside closes the reference-strip box (y=60)' },
  { a: 'floor_and_blown_diffuser', b: 'reference_plank', parts: [['strip_wall_*', 'plank'], ['diffuser_roof_*', 'plank'], ['fence_150_*', 'plank'], ['strip_top_plate', 'plank']], tol: 1, why: '§5.6 / §5.12: reference strip underside y=0 sits on the plank top' },
  { a: 'front_suspension_pushrod', b: 'wheel_front', sided: true, parts: [['uw_front_leg', 'upright'], ['uw_rear_leg', 'upright'], ['lw_front_leg', 'upright'], ['lw_rear_leg', 'upright'], ['trackrod', 'steering_arm']], tol: 12, why: '§5.10: members end at the ball joints carried by the upright; flat end caps overlap the slab, contact must end within 12 mm of relative travel (bound 30·max|m̂x| − 5 = 9.9)' },
  { a: 'rear_suspension_pullrod', b: 'wheel_rear', sided: true, parts: [['uw_front_leg', 'upright'], ['uw_rear_leg', 'upright'], ['lw_front_leg', 'upright'], ['lw_rear_leg', 'upright'], ['toelink', 'toe_arm']], tol: 12, why: '§5.10: members end at the ball joints carried by the upright; contact must end within 12 mm of relative travel' },
];
const partMatch = (pat, name) => (pat.endsWith('*') ? name.startsWith(pat.slice(0, -1)) : pat === name);
function designedFor(A, B) {
  for (const d of DESIGNED_CONTACT) {
    const fwd = A.base === d.a && B.base === d.b, rev = A.base === d.b && B.base === d.a;
    if (!fwd && !rev) continue;
    if (d.sided && A.side && B.side && A.side !== B.side) continue;
    return { rule: d, swap: rev };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pairwise sweep (§8.9)
// ---------------------------------------------------------------------------
export class PairSweep {
  constructor(world, { step = 0.005, thr = 30, report = 100 } = {}) {
    this.world = world; this.step = step; this.thr = thr; this.report = report;
    this.pairs = [];
    const b = world.bodies;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) this.pairs.push([b[i], b[j]]);
    this.cursor = 0; this.results = []; this.queries = 0; this.t0 = null; this.elapsed = 0;
  }
  get done() { return this.cursor >= this.pairs.length; }
  get progress() { return this.cursor / this.pairs.length; }
  /** process pairs until `budgetMs` has elapsed; returns true when finished */
  run(budgetMs = 12) {
    const start = performance.now();
    while (this.cursor < this.pairs.length && (performance.now() - start) < budgetMs) {
      const [A, B] = this.pairs[this.cursor++];
      this.results.push(this.evalPair(A, B));
    }
    this.elapsed += performance.now() - start;
    return this.done;
  }
  evalPair(A, B) {
    const T = this.step, K_ = Math.round(1 / T), thr = this.thr;
    const dsg = designedFor(A, B);
    const res = {
      a: A.id, b: B.id, min: Infinity, tMin: null, d0: null, contacts: [], designed: dsg ? dsg.rule.why : null,
      violations: [], unexplained: false, gapMin: Infinity, queries: 0, sub: 0,
    };
    let lastD = null, lastDelta = null; let delta0 = null;
    const Ds = new Array(K_ + 1), LBs = new Array(K_ + 1), Deltas = new Array(K_ + 1);
    for (let k = 0; k <= K_; k++) {
      const t = k * T, oA = offsetAt(A, t), oB = offsetAt(B, t);
      const delta = [oB[0] - oA[0], oB[1] - oA[1], oB[2] - oA[2]];
      Deltas[k] = delta; if (k === 0) delta0 = delta;
      const gap = boxGap(A.geom.boundingBox, oA, B.geom.boundingBox, oB);
      let d, lb;
      if (gap > thr) { d = null; lb = gap; }
      else if (lastDelta && Math.hypot(delta[0] - lastDelta[0], delta[1] - lastDelta[1], delta[2] - lastDelta[2]) < 1e-7 && lastD !== undefined) { d = lastD; lb = d === null ? thr : d; }
      else {
        const q = distance(A.geom, oA, B.geom, oB, thr); res.queries++;
        d = Number.isFinite(q) ? q : null; lb = d === null ? Math.max(thr, gap) : d;
        lastD = d; lastDelta = delta;
      }
      Ds[k] = d; LBs[k] = lb;
      if (d !== null && d < res.min) { res.min = d; res.tMin = t; }
      if (k === 0) res.d0 = d;
      if (gap < res.gapMin) res.gapMin = gap;
      if (d !== null && d <= 1e-3) res.contacts.push({ k, t, disp: Math.hypot(delta[0] - delta0[0], delta[1] - delta0[1], delta[2] - delta0[2]) });
    }
    // continuous-motion certification between samples.  Lipschitz bound on an interval: min >= (d_k + d_k+1 - |dDelta|)/2.
    // Every interval is subdivided until the bound is positive (> 0.25 mm): no collision can hide between samples.
    let kBest = -1;
    for (let k = 0; k <= K_; k++) if (Ds[k] !== null && Math.abs(Ds[k] - res.min) < 1e-9) { kBest = k; break; }
    for (let k = 0; k < K_; k++) {
      const s = Math.hypot(Deltas[k + 1][0] - Deltas[k][0], Deltas[k + 1][1] - Deltas[k][1], Deltas[k + 1][2] - Deltas[k][2]);
      if (s < 1e-6) continue;
      if (Ds[k] !== null && Ds[k] <= 1e-3) continue;           // already in contact: min is 0, nothing more to learn
      if (Ds[k + 1] !== null && Ds[k + 1] <= 1e-3) continue;
      const lb = (LBs[k] + LBs[k + 1] - s) / 2;
      // minimum is refined to 0.5 mm only next to the best sample (cheap), collision-certified everywhere
      const nearBest = res.min <= thr && kBest >= 0 && (k === kBest || k === kBest - 1);
      const target = nearBest ? Math.max(0.25, res.min - 0.5) : 0.25;
      if (lb >= target) continue;
      this.refine(A, B, k * T, (k + 1) * T, Ds[k], Ds[k + 1], LBs[k], LBs[k + 1], Deltas[k], Deltas[k + 1], res, 0, nearBest);
    }
    this.queries += res.queries;
    // classify contacts against the designed-contact rules
    if (res.contacts.length) this.classify(A, B, res, dsg);
    return res;
  }
  refine(A, B, t0, t1, d0, d1, lb0, lb1, D0, D1, res, depth, tight = false) {
    const s = Math.hypot(D1[0] - D0[0], D1[1] - D0[1], D1[2] - D0[2]);
    const lb = (lb0 + lb1 - s) / 2;
    const target = tight ? Math.max(0.25, Math.min(res.min, this.thr) - 0.5) : 0.25;
    if (lb >= target || s < 0.2 || depth >= 8) { if (lb <= 0 && s >= 0.2) res.sub++; return; }
    const tm = (t0 + t1) / 2, oA = offsetAt(A, tm), oB = offsetAt(B, tm);
    const Dm = [oB[0] - oA[0], oB[1] - oA[1], oB[2] - oA[2]];
    const gap = boxGap(A.geom.boundingBox, oA, B.geom.boundingBox, oB);
    let dm = null, lbm;
    if (gap > this.thr) lbm = gap;
    else { const q = distance(A.geom, oA, B.geom, oB, this.thr); res.queries++; dm = Number.isFinite(q) ? q : null; lbm = dm === null ? Math.max(this.thr, gap) : dm; }
    if (dm !== null && dm < res.min) { res.min = dm; res.tMin = tm; }
    this.refine(A, B, t0, tm, d0, dm, lb0, lbm, D0, Dm, res, depth + 1, tight);
    this.refine(A, B, tm, t1, dm, d1, lbm, lb1, Dm, D1, res, depth + 1, tight);
  }
  /** part-level classification of body-pair contacts at the first contact sample and at the last */
  classify(A, B, res, dsg) {
    const n = res.contacts.length, nPick = Math.min(n, 10);
    const picks = []; for (let q = 0; q < nPick; q++) picks.push(res.contacts[Math.round(q * (n - 1) / Math.max(1, nPick - 1))]);
    const seen = new Set();
    for (const c of picks) {
      if (seen.has(c.k)) continue; seen.add(c.k);
      const oA = offsetAt(A, c.t), oB = offsetAt(B, c.t);
      for (const pa of A.parts) for (const pb of B.parts) {
        if (boxGap(pa.bbox, oA, pb.bbox, oB) > 1e-3) continue;
        const d = distance(pa.geom, oA, pb.geom, oB, 0.01);
        if (!(d <= 1e-3)) continue;
        let allowed = false;
        if (dsg) {
          for (const [x, y] of dsg.rule.parts) {
            const m = dsg.swap ? (partMatch(x, pb.name) && partMatch(y, pa.name)) : (partMatch(x, pa.name) && partMatch(y, pb.name));
            if (m) { allowed = c.disp <= dsg.rule.tol; break; }
          }
        }
        if (!allowed) res.violations.push({ t: c.t, disp: c.disp, a: pa.name, b: pb.name });
      }
    }
    // contact that persists beyond the allowed relative displacement is an explicit violation
    res.unexplained = res.violations.length > 0;
  }
}

// ---------------------------------------------------------------------------
// §8.9 expected-minimum table: part-level measured values
// ---------------------------------------------------------------------------
const range = (a, b, st) => { const o = []; for (let t = a; t <= b + 1e-9; t += st) o.push(Math.round(t * 1e6) / 1e6); return o; };
export function namedClearances(world, K_ = K) {
  const W = world.byId;
  const out = [];
  const e015 = (() => { // t in the exhaust window where e(s) = 0.15 (spec: C1, e≈0.15)
    let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (smoothstep(m) < 0.15) lo = m; else hi = m; } return 0.64 + 0.14 * (lo + hi) / 2;
  })();
  const q = (id, label, expected, aId, aParts, bId, bParts, times, note = '', kind = 'min') => {
    const r = minDistanceParts(world, W[aId], aParts, W[bId], bParts, times, 400);
    out.push({ id, label, expected, measured: r.d, at: r.t, note, kind });
  };
  q('rim-uw', 'Rim barrel ↔ front upper-wishbone rear leg (radial)', 8.3, 'wheel_fxp', ['rim'], 'front_suspension_pushrod_xp', ['uw_rear_leg'], [0.44], 'rim part includes flanges; 0 = triangles intersect');
  q('exh-panel', 'Exhaust lip ↔ panel top (pipe + collector vs step panel, no foil/sleeve)', 8.9, 'exhaust_system_xp', ['pipe', 'collector'], 'floor_and_blown_diffuser', ['step_panel_xp'], [0]);
  q('exh-panel-built', 'Exhaust lip ↔ panel top as built (F4 sleeve + F2 foil included)', 6.4, 'exhaust_system_xp', null, 'floor_and_blown_diffuser', null, [0], 'includes the 2 mm F4 sleeve and the 0.5 mm F2 foil');
  q('floor-tyre', 'Floor ↔ rear tyre', 15.3, 'floor_and_blown_diffuser', null, 'wheel_rxp', ['tyre'], [0]);
  q('exh-wb', 'Exhaust ↔ exploded rear lower-wishbone bracket (C1 window)', 12.6, 'exhaust_system_xp', null, 'rear_suspension_pullrod_xp', ['lw_front_leg'], range(0.64, 0.78, 0.001), 'min over C1 [0.64,0.78]');
  q('exh-wb-e15', 'Exhaust ↔ rear lower-wishbone leg at e≈0.15 (t=' + e015.toFixed(3) + ')', 12.7,'exhaust_system_xp', null, 'rear_suspension_pullrod_xp', ['lw_front_leg'], [e015], '', 'info');
  q('exh-wb-all', 'Exhaust ↔ rear lower-wishbone leg, whole timeline (B1 + C1)', 12.6, 'exhaust_system_xp', null, 'rear_suspension_pullrod_xp', ['lw_front_leg', 'lw_rear_leg'], range(0, 1, 0.002), 'smallest over t in [0,1]', 'info');
  q('exh-pod', 'Exhaust ↔ pod lower edge (static, and A4)', 20.0, 'exhaust_system_xp', null, 'sidepod_pods_xp', null, [0, ...range(0.2, 0.36, 0.005)]);
  q('rad-pod', 'Radiator ↔ pod undercut (static)', 16.3, 'radiator_internals_xp', null, 'sidepod_pods_xp', null, [0], '3D distance to the inner skin (3 mm wall); §5.5 corner table is vertical to the outer surface');
  q('rad-mono', 'Radiator ↔ monocoque (static)', 26.1, 'radiator_internals_xp', null, 'monocoque_survival_cell', null, [0]);
  q('exh-tyre', 'Exhaust lip ↔ rear tyre (static)', 34.7, 'exhaust_system_xp', ['pipe', 'collector'], 'wheel_rxp', ['tyre'], [0]);
  q('cover-pickup', 'Cover skirt ↔ rear upper-wishbone pickup (static)', 16.4, 'engine_cover_and_sharkfin', ['canopy'], 'rear_suspension_pullrod_xp', ['uw_front_leg', 'uw_rear_leg'], [0], 'member end-cap surface; 28.9 (§5.3) is the pickup centre to the skirt plane');
  q('exh-exh', '_xp exhaust ↔ _xn exhaust (t = 1)', 36.3, 'exhaust_system_xp', null, 'exhaust_system_xn', null, [1]);
  q('lw-diff', 'Rear lower wishbone ↔ diffuser roof (static)', 54.6, 'rear_suspension_pullrod_xp', ['lw_front_leg', 'lw_rear_leg'], 'floor_and_blown_diffuser', ['diffuser_roof_xp', 'diffuser_roof_c'], [0]);
  q('flap2-tyre', 'FW flap 2 ↔ front tyre (static)', 87.4, 'nose_and_front_wing_cascade', ['fw_flap2_xp'], 'wheel_fxp', ['tyre'], [0]);
  // rows added by the spec corrections (RB7_SPEC_CORRECTIONS.md §8)
  const wheelParts = ['tyre', 'rim', 'spokes', 'disc', 'caliper'];
  q('exh-rsus-b1', 'Exhaust ↔ rear suspension (B1 pass)', 13.3, 'exhaust_system_xp', null, 'rear_suspension_pullrod_xp', null, range(0.44, 0.62, 0.001));
  q('cover-mono', 'Cover ↔ monocoque (static)', 7.7, 'engine_cover_and_sharkfin', ['canopy', 'airbox_face'], 'monocoque_survival_cell', null, [0]);
  q('push-slot', 'Pushrod ↔ chassis slot (static and through B1)', 5.3, 'monocoque_survival_cell', null, 'front_suspension_pushrod_xp', ['pushrod'], [0, ...range(0.44, 0.62, 0.001)]);
  q('track-hole', 'Track rod ↔ chassis hole (static and through B1)', 6.2, 'monocoque_survival_cell', null, 'front_suspension_pushrod_xp', ['trackrod'], [0, ...range(0.44, 0.62, 0.002)]);
  q('ep-tyre', 'FW endplate ↔ front tyre (static)', 88.2, 'nose_and_front_wing_cascade', ['fw_endplate_xp'], 'wheel_fxp', ['tyre'], [0]);
  q('wheel-f', 'Closest front member ↔ own wheel (static = B1 minimum)', 5.1, 'front_suspension_pushrod_xp', null, 'wheel_fxp', wheelParts, [0]);
  q('wheel-r', 'Closest rear member ↔ own wheel (static = B1 minimum)', 6.3, 'rear_suspension_pullrod_xp', null, 'wheel_rxp', wheelParts, [0]);
  return out;
}

// ---------------------------------------------------------------------------
// section slicing helpers (area, connectivity)
// ---------------------------------------------------------------------------
function sliceZ(mesh, z0) {
  const p = mesh.p, t = mesh.i, segs = [];
  for (let k = 0; k < t.length; k += 3) {
    const v = [t[k] * 3, t[k + 1] * 3, t[k + 2] * 3];
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      const za = p[a + 2] - z0, zb = p[b + 2] - z0;
      if ((za < 0 && zb > 0) || (za > 0 && zb < 0)) { const u = za / (za - zb); pts.push([p[a] + (p[b] - p[a]) * u, p[a + 1] + (p[b + 1] - p[a + 1]) * u]); }
      else if (za === 0 && zb !== 0) pts.push([p[a], p[a + 1]]);
    }
    if (pts.length >= 2) segs.push([pts[0], pts[1]]);
  }
  return segs;
}
/** area enclosed by the slice of a closed mesh at z=z0 (shoelace over chained loops) */
export function sectionArea(mesh, z0) {
  const segs = sliceZ(mesh, z0); if (!segs.length) return 0;
  // even-odd via signed-area sum of segments projected: area = |sum (x1*y2-x2*y1)/2| works for consistently oriented loops
  let a = 0;
  for (const [p, q] of segs) a += (p[0] * q[1] - q[0] * p[1]) / 2;
  // segment orientation from triangle winding is consistent for outward-wound solids; take |.| of the total
  return Math.abs(a);
}
/** connectivity of the union of slices of several closed meshes (raster flood fill); returns component count */
export function sectionComponents(meshes, z0, x0, x1, y0, y1, cell = 0.5) {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const grid = new Uint8Array(nx * ny);
  for (const m of meshes) {
    const segs = sliceZ(m, z0);
    // per-column crossings (even-odd)
    const cols = new Array(nx).fill(null).map(() => []);
    for (const [p, q] of segs) {
      const xa = Math.min(p[0], q[0]), xb = Math.max(p[0], q[0]);
      if (xa === xb) continue;
      const i0 = Math.max(0, Math.floor((xa - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((xb - x0) / cell));
      for (let i = i0; i <= i1; i++) {
        const xc = x0 + (i + 0.5) * cell; if (xc < xa || xc >= xb) continue;
        const u = (xc - p[0]) / (q[0] - p[0]); cols[i].push(p[1] + (q[1] - p[1]) * u);
      }
    }
    for (let i = 0; i < nx; i++) {
      const c = cols[i].sort((a, b) => a - b);
      for (let k = 0; k + 1 < c.length; k += 2) {
        const j0 = Math.max(0, Math.floor((c[k] - y0) / cell)), j1 = Math.min(ny - 1, Math.floor((c[k + 1] - y0) / cell));
        for (let j = j0; j <= j1; j++) grid[j * nx + i] = 1;
      }
    }
  }
  // 8-connected components
  const seen = new Uint8Array(nx * ny); let comps = 0; const stack = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    comps++; seen[s] = 1; stack.push(s);
    while (stack.length) {
      const c = stack.pop(); const ci = c % nx, cj = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const n = nj * nx + ni; if (grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
  }
  return comps;
}

// ---------------------------------------------------------------------------
// §8 asserts
// ---------------------------------------------------------------------------
export function raked(y, z) { // M_rake applied to (y_B, z_B) -> (y_W, z_W)   (mm)
  return [K.c * (y + K.hF) - K.s * z - K.hF, K.s * (y + K.hF) + K.c * z + K.hF * K.s];
}
export function rakeMatrix() {
  const m = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, K.c, -K.s, -K.hF * (1 - K.c),
    0, K.s, K.c, K.hF * K.s,
    0, 0, 0, 1);
  return m;
}
function forEachVertex(model, fn) {
  for (const b of model.bodies) for (const p of b.parts) { const a = p.mesh.p; for (let k = 0; k < a.length; k += 3) fn(b.mirror ? -a[k] : a[k], a[k + 1], a[k + 2], b, p); }
}

export function runAsserts(model, world) {
  const R = []; const push = (id, title, pass, detail, extra = {}) => R.push({ id, title, pass, detail, ...extra });
  const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

  // 1 -------------------------------------------------------------------
  {
    const M = rakeMatrix();
    const p = new THREE.Vector3(0, 0, -3300).applyMatrix4(M);
    const piv = new THREE.Vector3(0, -K.hF, 0).applyMatrix4(M);
    const ok1 = Math.abs(p.y - 103.643) <= 0.001, ok2 = piv.distanceTo(new THREE.Vector3(0, -K.hF, 0)) < 1e-9;
    push('A1', 'M_rake·(0,0,−3300,1).y = 103.643 ± 0.001, pivot (0,−25,0) fixed', ok1 && ok2, `y = ${f(p.y, 4)} mm; pivot residual ${piv.distanceTo(new THREE.Vector3(0, -K.hF, 0)).toExponential(1)}`);
  }
  // 2 -------------------------------------------------------------------
  {
    const M = rakeMatrix(); let worst = 0, okc = true; const info = [];
    for (const b of model.bodies) {
      if (!b.id.startsWith('wheel_')) continue;
      const tyre = b.parts.find((p) => p.name === 'tyre').mesh;
      let ymin = Infinity, zc = 0, n = 0, yc = 0; const sx = b.mirror ? -1 : 1;
      const v = new THREE.Vector3();
      for (let k = 0; k < tyre.p.length; k += 3) { v.set(sx * tyre.p[k], tyre.p[k + 1], tyre.p[k + 2]).applyMatrix4(M); if (v.y < ymin) ymin = v.y; }
      // wheel centre in W: tyre bbox midpoint y,z (axisymmetric)
      const bb = tyre.bbox(); const cB = new THREE.Vector3(sx * (bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2).applyMatrix4(M);
      void n; void yc; void zc;
      const expY = 305, expZ = b.id.startsWith('wheel_f') ? 0 : -3300, expX = (b.id.startsWith('wheel_f') ? 725 : 700) * (b.mirror ? -1 : 1);
      const dev = Math.max(Math.abs(cB.y - expY), Math.abs(cB.z - expZ), Math.abs(cB.x - expX));
      worst = Math.max(worst, Math.abs(ymin + 25));
      if (dev > 0.01) okc = false;
      info.push(`${b.id}: C_W=(${f(cB.x, 2)}, ${f(cB.y, 3)}, ${f(cB.z, 3)}) lowest y_W=${f(ymin, 3)}`);
    }
    push('A2', 'wheel centres in W = (±725,305,0), (±700,305,−3300); every tyre lowest point y_W = −25 ± 0.01', okc && worst <= 0.01, `worst |y_low+25| = ${f(worst, 4)} mm`, { lines: info });
  }
  // 3 + dedicated 950 -------------------------------------------------------
  {
    const lim = { x: 900, y: 950, zNose: K.Z_FA + 1200, zFw: K.Z_FA + 1000, zRear: K.Z_RA - 600 };
    let maxX = 0, maxY = -Infinity, maxZ = -Infinity, maxZwide = -Infinity, minZ = Infinity;
    const at950 = new Map(); let maxYf32 = -Infinity;
    forEachVertex(model, (x, y, z, b) => {
      maxX = Math.max(maxX, Math.abs(x)); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z); minZ = Math.min(minZ, z);
      if (Math.abs(x) > 200) maxZwide = Math.max(maxZwide, z);
      if (y > 949.999) at950.set(b.id, Math.max(at950.get(b.id) ?? -Infinity, y));
    });
    // float32 render buffers (metres) read back in mm
    for (const b of world.bodies) { void b; }
    for (const b of model.bodies) for (const p of b.parts) { const a = Float32Array.from(p.mesh.p, (v) => v * 1e-3); for (let k = 1; k < a.length; k += 3) maxYf32 = Math.max(maxYf32, a[k] / 1e-3); }
    const ok = maxX <= lim.x + 1e-6 && maxY <= lim.y + 1e-6 && maxZ <= lim.zNose + 1e-6 && maxZwide <= lim.zFw + 1e-6 && minZ >= lim.zRear - 1e-6;
    push('A3', 'envelope at t=0 (B): |x|≤900, y≤950, z≤Z_FA+1200=' + f(lim.zNose, 2) + ', z≤Z_FA+1000=' + f(lim.zFw, 2) + ' where |x|>200, z≥Z_RA−600=' + f(lim.zRear, 2), ok,
      `max|x|=${f(maxX, 3)}  max y=${f(maxY, 4)}  max z=${f(maxZ, 3)}  max z(|x|>200)=${f(maxZwide, 3)}  min z=${f(minZ, 3)}`);
    push('A3b', 'DEDICATED: y ≤ 950.0 exactly (airbox/shark-fin/rear-endplate), double precision and float32 render buffers',
      maxY <= 950 + 1e-9 && maxYf32 <= 950 + 1e-4,
      `double max y=${f(maxY, 9)} mm; float32 buffer max y=${f(maxYf32, 6)} mm; vertices at 950: ${[...at950.keys()].join(', ')}`,
      { zeroMargin: [...at950.keys()] });
  }
  // 4 -------------------------------------------------------------------
  {
    let maxYr = -Infinity;
    for (let i = 0; i <= 200; i++) for (let j = 0; j <= 98; j++) {
      const z = K.Z_RA - K.Z_RA * 0 - 350 * i / 200, x = -490 + 980 * j / 98;
      maxYr = Math.max(maxYr, diffuserRoofY(x, K.Z_RA - 350 * i / 200)); void z; void x;
    }
    const fl = model.bodies.find((b) => b.id === 'floor_and_blown_diffuser');
    const roofs = fl.parts.filter((p) => /diffuser_roof|fence|sidewall/.test(p.name)).map((p) => p.mesh);
    let comps = 0, worstZ = null;
    const zs = []; for (let k = 0; k <= 20; k++) zs.push(K.Z_RA - 350 * (k + 0.5) / 21);
    for (const z of zs) {
      const c = sectionComponents(roofs, z, -495, 495, -1, 140, 0.5);
      if (c > comps) { comps = c; worstZ = z; }
    }
    // mesh top (panel thickness included) — strict reading of R9
    let meshTop = -Infinity;
    for (const p of fl.parts) if (/diffuser_roof/.test(p.name)) meshTop = Math.max(meshTop, p.mesh.bbox().max[1]);
    push('A4', 'R9: diffuser panel top (y_r + t_D) ≤ H_D=125 on [Z_RA−350, Z_RA]×[−490,490]; every z-section is one connected polyline',
      meshTop <= K.HD + 1e-9 && comps === 1, `panel top = ${f(meshTop, 3)} mm (margin ${f(K.HD - meshTop, 3)}); max connected components over 21 z-sections = ${comps}${worstZ !== null && comps !== 1 ? ' at z=' + f(worstZ, 1) : ''}`);
    push('A4a', '§5.6: diffuser airflow surface y_r ≤ H_D − t_D = ' + (K.HD - S.FLOOR.roofThick), maxYr <= K.HD - S.FLOOR.roofThick + 1e-9,
      `max y_r = ${f(maxYr, 6)} mm`);
  }
  // 5 -------------------------------------------------------------------
  {
    let ok = true, worstDot = 0, maxC = 0, maxAR = 0, worstIncl = 0; const bad = [];
    const eAngle = (A, B) => { const d = v3.sub(B, A); return Math.atan2(Math.abs(d[1]), Math.hypot(d[0], d[2])) / DEG; };
    for (const b of model.bodies) {
      if (!/suspension/.test(b.id) || b.mirror) continue;
      for (const p of b.parts) {
        if (!p.member) continue;
        const { frame } = p.mesh;
        worstDot = Math.max(worstDot, Math.abs(frame.m[1]));
        maxC = Math.max(maxC, p.member.C); maxAR = Math.max(maxAR, p.member.C / p.member.tau);
        if (/^(uw|lw)_/.test(p.name)) { const a = eAngle(p.member.A, p.member.B); worstIncl = Math.max(worstIncl, a); if (a > 5) { ok = false; bad.push(p.name + ' ' + f(a, 2)); } }
      }
    }
    ok = ok && worstDot < 1e-12 && maxC <= 100 && maxAR <= 3.5;
    push('A5', 'suspension: m̂·Ŷ=0, chord ≤ 100, AR ≤ 3.5, wishbone centrelines ≤ 5° from the reference plane', ok,
      `max |m̂·Ŷ|=${worstDot.toExponential(1)}; max chord=${f(maxC, 1)}; max AR=${f(maxAR, 2)}; max wishbone inclination=${f(worstIncl, 2)}°` + (bad.length ? '  BAD: ' + bad.join(', ') : ''));
  }
  // 6 -------------------------------------------------------------------
  {
    const nose = model.bodies.find((b) => b.id === 'nose_and_front_wing_cascade').parts.find((p) => p.name === 'nose_cone').mesh;
    const A = sectionArea(nose, 1125);
    push('A6', 'nose section area at z=1125 ≥ 9000 mm² (measured on the built mesh)', A >= 9000, `A = ${f(A, 0)} mm² (spec ≈ 11 300)`);
  }
  // 7 -------------------------------------------------------------------
  {
    const rw = world.byId['rear_wing_DRS'];
    const flapPart = rw.parts.find((p) => p.name === 'drs_flap'), mainPart = rw.parts.find((p) => p.name === 'main_plane');
    const [pz, py] = drsPivot();
    const rotated = (d) => {
      const src = flapPart.geom; const a = src.attributes.position.array; const out = new Float32Array(a.length);
      const c = Math.cos(d), s = Math.sin(d);
      for (let k = 0; k < a.length; k += 3) {
        const dy = a[k + 1] - py, dz = a[k + 2] - pz;
        out[k] = a[k]; out[k + 1] = py + dy * c + dz * s; out[k + 2] = pz - dy * s + dz * c;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.setIndex(new THREE.BufferAttribute(src.index.array.slice(), 1));
      g.computeBoundingBox(); g.boundsTree = new MeshBVH(g, { maxLeafTris: 8 }); return g;
    };
    const gap = (d) => distance(mainPart.geom, [0, 0, 0], rotated(d), [0, 0, 0], 500);
    const g0 = gap(0);
    let lo = 10 * DEG, hi = 20 * DEG;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (gap(m) < 50) lo = m; else hi = m; }
    const dOpen = (lo + hi) / 2; const g1 = gap(dOpen);
    const fg = rotated(dOpen); fg.computeBoundingBox();
    const yMax = fg.boundingBox.max.y;
    push('A7', 'DRS: gap(0)=12±1, gap(δ_open)=50±0.5, flap max y ≤ 950 at δ_open', Math.abs(g0 - 12) <= 1 && Math.abs(g1 - 50) <= 0.5 && yMax <= 950,
      `gap(0)=${f(g0, 3)} mm; δ_open=${f(dOpen / DEG, 3)}° (first-order spec 15.1°); gap(δ_open)=${f(g1, 3)} mm; flap max y=${f(yMax, 3)} mm`, { dOpen });
    R.dOpen = dOpen;
  }
  // 8 -------------------------------------------------------------------
  {
    let m = 0, my = 0, mz = 0, mx = 0;
    for (const b of model.bodies) { m += b.mass; mx += b.mass * b.com[0]; my += b.mass * b.com[1]; mz += b.mass * b.com[2]; }
    const com = [mx / m, my / m, mz / m];
    const ok = Math.abs(m - 216.9) < 0.05 && Math.abs(com[1] - S.MODELLED_TOTAL.com[1]) < 0.05 && Math.abs(com[2] - S.MODELLED_TOTAL.com[2]) < 0.05 && Math.abs(com[0]) < 1e-9;
    push('A8', `Σm = 216.9 kg and modelled CoM_B = (0, ${S.MODELLED_TOTAL.com[1]}, ${S.MODELLED_TOTAL.com[2]})`, ok, `Σm=${f(m, 3)} kg; CoM=(${f(com[0], 3)}, ${f(com[1], 3)}, ${f(com[2], 3)}) mm`, { com, mass: m });
  }
  // table consistency: d_B column of §7.2
  {
    let worst = 0;
    for (const b of model.bodies) { const pr = S.EXPLODE_dB_PRINTED[b.base]; if (!pr) continue; const sx = b.side < 0 ? -1 : 1; const printed = [pr[0] * sx, pr[1], pr[2]]; for (let a = 0; a < 3; a++) worst = Math.max(worst, Math.abs(b.dB[a] - printed[a])); }
    push('A0', 'd_B = R_x(−θ)·d_W reproduces the §7.2 printed d_B column (|Δ| ≤ 1e-5 m)', worst < 1e-5, `worst |Δ| = ${worst.toExponential(2)} m (printed table rounds/truncates at 5 decimals)`);
  }
  return R;
}

// ---------------------------------------------------------------------------
// Regulatory envelope table (informational; R14–R20 provisional)
// ---------------------------------------------------------------------------
export function regChecks(model) {
  const out = []; const f = (x, d = 2) => x.toFixed(d);
  const bb = (id, pred) => { const b = model.bodies.find((q) => q.id === id); let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const p of b.parts) { if (pred && !pred(p)) continue; const q = p.mesh.bbox(); for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], q.min[a]); mx[a] = Math.max(mx[a], q.max[a]); } } return { min: mn, max: mx }; };
  const R = (id, tag, text, pass, val) => out.push({ id, tag, text, pass, val });
  const fw = bb('nose_and_front_wing_cascade', (p) => /^fw_(main|flap|c1|c2)/.test(p.name));
  R('R11', 'BRIEF', 'FW elements |x| ≤ 840', Math.max(Math.abs(fw.min[0]), Math.abs(fw.max[0])) <= 840 + 1e-6, `max |x| = ${f(Math.max(Math.abs(fw.min[0]), Math.abs(fw.max[0])))}`);
  { // intra-body: element tips vs the slanted endplate inner face (elements stop at x = min(840, x_inner(z)))
    const gaps = []; let worst = 0;
    for (const key of ['main', 'flap1', 'flap2', 'c1', 'c2']) {
      const d = S.FW[key], a = d.alpha * DEG, zTE = d.LE[0] - d.C * Math.cos(a);
      const gap = Math.max(0, endplateInnerX(zTE) - 840); worst = Math.max(worst, gap); gaps.push(`${key} TE z=${zTE.toFixed(1)}: ${gap.toFixed(1)}`);
    }
    R('R11x', 'BRIEF', 'FW element tips reach the endplate inner face (span ends at |x|=840; inner face x=840)', worst <= 1, `max gap ${worst.toFixed(1)} mm — ${gaps.join('; ')}`);
  }
  const ep = bb('nose_and_front_wing_cascade', (p) => /endplate/.test(p.name));
  R('R1', 'BRIEF', 'FW endplate |x| ≤ 900', Math.max(Math.abs(ep.min[0]), Math.abs(ep.max[0])) <= 900 + 1e-6, `max |x| = ${f(Math.max(Math.abs(ep.min[0]), Math.abs(ep.max[0])))}`);
  const w = bb('wheel_fxp'); R('R1t', 'BRIEF', 'front tyre outer face |x| ≤ 900', w.max[0] <= 900, `x_max = ${f(w.max[0])}`);
  const fb = bb('nose_and_front_wing_cascade', (p) => /^fw_(main|flap|c1|c2|endplate|footplate)/.test(p.name));
  R('R14', 'REG-RECALL', 'FW bodywork 75 ≤ y ≤ 275 outboard of the central 500', fb.min[1] >= 75 - 1e-6 && fb.max[1] <= 275 + 1e-6, `y ∈ [${f(fb.min[1])}, ${f(fb.max[1])}] (spec "75…269")`);
  const rw = bb('rear_wing_DRS', (p) => /main|flap/.test(p.name));
  R('R15', 'REG-RECALL', 'RW elements: 730 ≤ y ≤ 950, |x| ≤ 375', rw.min[1] >= 730 && rw.max[1] <= 950 && rw.max[0] <= 375, `elements y ∈ [${f(rw.min[1])}, ${f(rw.max[1])}], |x| ≤ ${f(rw.max[0])}`);
  const rwAll = bb('rear_wing_DRS');
  R('R15x', 'EST', 'INFO (C10 ruling: R15 box governs the main plane + flap only) RW endplates / beam wing below y=730', true, `lowest RW point y = ${f(rwAll.min[1])}`);
  const ex = 2 * (Math.PI * S.EXH.a * S.EXH.bb / 2 + 1.9569 * S.EXH.a * S.EXH.bt + 10 * 282 + Math.PI * 100);
  R('R13', 'BRIEF', 'exhaust bodywork aperture ≤ 50 000 mm² (combined)', ex <= 50000, `≈ ${f(ex, 0)} mm² (spec 15 680)`);
  const fl = bb('floor_and_blown_diffuser', (p) => !/diffuser|fence|sidewall/.test(p.name));
  R('R17', 'REG-RECALL', 'floor |x| ≤ 700 between the axles', Math.max(Math.abs(fl.min[0]), Math.abs(fl.max[0])) <= 700 + 1e-6, `max |x| = ${f(Math.max(Math.abs(fl.min[0]), Math.abs(fl.max[0])))}`);
  const df = bb('floor_and_blown_diffuser', (p) => /diffuser|fence|sidewall/.test(p.name));
  R('R8', 'BRIEF', 'behind Z_RA, y<150: |x| ≤ 500 (diffuser)', Math.max(Math.abs(df.min[0]), Math.abs(df.max[0])) <= 500, `max |x| = ${f(Math.max(Math.abs(df.min[0]), Math.abs(df.max[0])))}`);
  const pl = bb('reference_plank');
  R('R6', 'BRIEF', 'plank z ∈ [Z_RA, Z_FA−330], |x| ≤ 150, y ∈ [−10, 0]', Math.abs(pl.min[2] - K.Z_RA) < 1e-6 && Math.abs(pl.max[2] - (K.Z_FA - 330)) < 1e-6 && pl.min[1] >= -10 && pl.max[1] <= 0, `z ∈ [${f(pl.min[2], 3)}, ${f(pl.max[2], 3)}]`);
  const dr = model.bodies.find((b) => b.id === 'floor_and_blown_diffuser'); let yStep = Infinity;
  for (const p of dr.parts) if (/step_panel/.test(p.name)) yStep = Math.min(yStep, p.mesh.bbox().min[1]);
  R('R7', 'BRIEF', 'step plane y = 50 outboard of |x| = 150', Math.abs(yStep - 50) < 1e-6, `step panel underside y = ${f(yStep, 3)}`);
  R('R18', 'REG-RECALL', 'brake disc Ø ≤ 278, thickness ≤ 28', 2 * S.WHEEL.disc.r1 <= 278 && S.WHEEL.disc.t <= 28, `Ø${2 * S.WHEEL.disc.r1} × ${S.WHEEL.disc.t}`);
  R('R16', 'REG-RECALL', 'DRS slot gap 10–15 closed / ≤ 50 open', true, 'see A7');
  return out;
}
void gammaFn; void exhaustArcLength;

/**
 * Static part-level scan at t = 0: every part pair of different bodies within `thr` mm (the spec's "~2 mm" flag level
 * is applied by the caller).  Cheap (bbox prefilter).  Returns rows sorted by distance.
 */
export function partScan(world, thr = 5) {
  const B = world.bodies, rows = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const A = B[i], C = B[j];
    if (A.extra || C.extra) continue;
    for (const pa of A.parts) for (const pb of C.parts) {
      if (boxGap(pa.bbox, [0, 0, 0], pb.bbox, [0, 0, 0]) > thr) continue;
      const d = distance(pa.geom, [0, 0, 0], pb.geom, [0, 0, 0], thr);
      if (Number.isFinite(d)) rows.push({ d, a: A.id, pa: pa.name, b: C.id, pb: pb.name });
    }
  }
  rows.sort((x, y) => x.d - y.d);
  return rows;
}
