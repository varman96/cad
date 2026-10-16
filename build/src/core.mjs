// ============================================================================
// core.mjs — math helpers + double-precision mesh accumulator + generic builders
// All geometry here is authored in millimetres (spec units), frame B.
// ============================================================================
import { ShapeUtils, Vector2 } from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const sgnPow = (v, p) => (v === 0 ? 0 : (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), p));
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** smoothstep easing e(s) = s^2 (3 - 2 s) — §7.1 */
export const smoothstep = (s) => { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); };

// ---- small vector helpers on plain arrays ---------------------------------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  madd: (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
};

/** Lanczos Gamma (g = 7) */
export function gammaFn(z) {
  const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = C[0];
  for (let i = 1; i < 9; i++) x += C[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Area of the superellipse |x/a|^n + |y/b|^n = 1  —  §4.1 */
export const superellipseArea = (a, b, n) => 4 * a * b * gammaFn(1 + 1 / n) ** 2 / gammaFn(1 + 2 / n);

/** piecewise-linear interpolation of a numeric field over stations (sorted monotone in `key`) */
export function stationInterp(st, zKey, z, field) {
  const n = st.length;
  for (let i = 0; i < n - 1; i++) {
    const a = st[i], b = st[i + 1];
    const lo = Math.min(a[zKey], b[zKey]), hi = Math.max(a[zKey], b[zKey]);
    if (z >= lo - 1e-9 && z <= hi + 1e-9) {
      const t = (z - a[zKey]) / (b[zKey] - a[zKey]);
      return a[field] + (b[field] - a[field]) * t;
    }
  }
  throw new Error(`stationInterp: z=${z} outside stations`);
}

// ============================================================================
// Mesh accumulator (double precision, indexed triangles)
// ============================================================================
export class Mesh {
  constructor(name = '') { this.name = name; this.p = []; this.i = []; }
  v(x, y, z) { this.p.push(x, y, z); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); return this; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); return this; }
  get nv() { return this.p.length / 3; }
  get nt() { return this.i.length / 3; }
  append(o) {
    const b = this.nv;
    for (let k = 0; k < o.p.length; k++) this.p.push(o.p[k]);
    for (let k = 0; k < o.i.length; k++) this.i.push(o.i[k] + b);
    return this;
  }
  clone(name = this.name) { const m = new Mesh(name); m.p = this.p.slice(); m.i = this.i.slice(); return m; }
  transform(fn) {
    const p = this.p;
    for (let k = 0; k < p.length; k += 3) { const r = fn(p[k], p[k + 1], p[k + 2]); p[k] = r[0]; p[k + 1] = r[1]; p[k + 2] = r[2]; }
    return this;
  }
  translate(dx, dy, dz) { const p = this.p; for (let k = 0; k < p.length; k += 3) { p[k] += dx; p[k + 1] += dy; p[k + 2] += dz; } return this; }
  /** mirror x -> -x and restore outward winding */
  mirrorX() { const p = this.p; for (let k = 0; k < p.length; k += 3) p[k] = -p[k]; return this.flip(); }
  flip() { const t = this.i; for (let k = 0; k < t.length; k += 3) { const q = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = q; } return this; }
  /** signed volume (closed outward-wound mesh => positive) */
  volume() {
    const p = this.p, t = this.i; let vol = 0;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
    }
    return vol;
  }
  /** for watertight solids: flip winding if the signed volume is negative */
  orientOutward() { if (this.volume() < 0) this.flip(); return this; }
  /**
   * Make triangle winding consistent across shared edges (BFS per connected component), then flip each
   * closed component so its signed volume is positive (outward normals).
   */
  orientManifold() {
    const t = this.i, nT = t.length / 3, N = this.nv;
    const em = new Map();
    const key = (a, b) => (a < b ? a * N + b : b * N + a);
    for (let k = 0; k < nT; k++) for (let e = 0; e < 3; e++) {
      const kk = key(t[3 * k + e], t[3 * k + (e + 1) % 3]);
      const l = em.get(kk); if (l) l.push(k); else em.set(kk, [k]);
    }
    const seen = new Uint8Array(nT);
    const dirOf = (k, a, b) => { // does triangle k traverse edge a->b ?  +1 yes, -1 reversed, 0 not an edge
      for (let e = 0; e < 3; e++) { const x = t[3 * k + e], y = t[3 * k + (e + 1) % 3]; if (x === a && y === b) return 1; if (x === b && y === a) return -1; }
      return 0;
    };
    const p = this.p;
    for (let s = 0; s < nT; s++) {
      if (seen[s]) continue;
      seen[s] = 1; const stack = [s], comp = [s];
      while (stack.length) {
        const k = stack.pop();
        for (let e = 0; e < 3; e++) {
          const a = t[3 * k + e], b = t[3 * k + (e + 1) % 3];
          const nb = em.get(key(a, b)); if (!nb) continue;
          for (const q of nb) {
            if (q === k || seen[q]) continue;
            if (dirOf(q, a, b) === 1) { const tmp = t[3 * q + 1]; t[3 * q + 1] = t[3 * q + 2]; t[3 * q + 2] = tmp; } // same direction => flip
            seen[q] = 1; stack.push(q); comp.push(q);
          }
        }
      }
      let vol = 0;
      for (const k of comp) {
        const a = t[3 * k] * 3, b = t[3 * k + 1] * 3, c = t[3 * k + 2] * 3;
        vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
      }
      if (vol < 0) for (const k of comp) { const tmp = t[3 * k + 1]; t[3 * k + 1] = t[3 * k + 2]; t[3 * k + 2] = tmp; }
    }
    return this;
  }
  area() {
    const p = this.p, t = this.i; let A = 0;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
      A += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    }
    return A;
  }
  bbox() {
    const p = this.p; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k += 3) for (let a = 0; a < 3; a++) { const v = p[k + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    return { min: mn, max: mx };
  }
  /** volume centroid for a closed mesh, or area centroid fallback */
  centroid() {
    const p = this.p, t = this.i; let V = 0; const c = [0, 0, 0];
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, d = t[k + 2] * 3;
      const v = (p[a] * (p[b + 1] * p[d + 2] - p[b + 2] * p[d + 1])
        - p[a + 1] * (p[b] * p[d + 2] - p[b + 2] * p[d])
        + p[a + 2] * (p[b] * p[d + 1] - p[b + 1] * p[d])) / 6;
      V += v;
      for (let j = 0; j < 3; j++) c[j] += v * (p[a + j] + p[b + j] + p[d + j]) / 4;
    }
    if (Math.abs(V) < 1e-9) return null;
    return [c[0] / V, c[1] / V, c[2] / V];
  }
  /** drop triangles for which keep(cx,cy,cz, a,b,c)=false and compact vertices */
  filterTris(keep) {
    const p = this.p, t = this.i, out = [];
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const cx = (p[a] + p[b] + p[c]) / 3, cy = (p[a + 1] + p[b + 1] + p[c + 1]) / 3, cz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
      if (keep(cx, cy, cz, a, b, c)) out.push(t[k], t[k + 1], t[k + 2]);
    }
    this.i = out;
    return this.compact();
  }
  compact() {
    const map = new Int32Array(this.nv).fill(-1); const np = [];
    const ni = this.i.map((idx) => {
      if (map[idx] < 0) { map[idx] = np.length / 3; np.push(this.p[idx * 3], this.p[idx * 3 + 1], this.p[idx * 3 + 2]); }
      return map[idx];
    });
    this.p = np; this.i = ni;
    return this;
  }
}


/**
 * Exact removal of the region {F < 0} from a triangle mesh (marching triangles).
 * Triangles fully inside are dropped, mixed triangles are clipped along F = 0 (crossing found by bisection on the chord),
 * new vertices are shared across edges so the cut boundary is watertight.
 */
export function clipTriangles(mesh, F) {
  const p = mesh.p, t = mesh.i;
  const nv0 = mesh.nv;
  const fv = new Float64Array(nv0);
  for (let i = 0; i < nv0; i++) fv[i] = F(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
  const edgeMap = new Map(); const out = [];
  const cross = (i, j) => { // vertex on edge (i,j) where F crosses 0
    const a = Math.min(i, j), b = Math.max(i, j), key = a * nv0 + b;
    let id = edgeMap.get(key); if (id !== undefined) return id;
    let lo = 0, hi = 1; const fa = fv[a];
    const P = (s) => [p[3 * a] + (p[3 * b] - p[3 * a]) * s, p[3 * a + 1] + (p[3 * b + 1] - p[3 * a + 1]) * s, p[3 * a + 2] + (p[3 * b + 2] - p[3 * a + 2]) * s];
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; const q = P(m); const fm = F(q[0], q[1], q[2]); if ((fm < 0) === (fa < 0)) lo = m; else hi = m; }
    const q = P((lo + hi) / 2); id = mesh.v(q[0], q[1], q[2]); edgeMap.set(key, id); return id;
  };
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k], b = t[k + 1], c = t[k + 2];
    const ina = fv[a] < 0, inb = fv[b] < 0, inc = fv[c] < 0;
    const n = (ina ? 1 : 0) + (inb ? 1 : 0) + (inc ? 1 : 0);
    if (n === 0) { out.push(a, b, c); continue; }
    if (n === 3) continue;
    // rotate so that the odd vertex is first
    let v = [a, b, c], inside = [ina, inb, inc];
    if (n === 1) {                                   // one inside: keep a quad
      const r = inside.indexOf(true); v = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
      const p1 = cross(v[0], v[1]), p2 = cross(v[0], v[2]);
      out.push(p1, v[1], v[2], p1, v[2], p2);
    } else {                                         // two inside: keep a triangle at the outside vertex
      const r = inside.indexOf(false); v = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
      const p1 = cross(v[0], v[1]), p2 = cross(v[0], v[2]);
      out.push(v[0], p1, p2);
    }
  }
  mesh.i = out;
  return mesh.compact();
}

// ============================================================================
// Grid helpers
// ============================================================================
/** add rows x cols vertices from fn(r,c)->[x,y,z]; returns index accessor */
export function addGrid(mesh, rows, cols, fn) {
  const base = mesh.nv;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const q = fn(r, c); mesh.v(q[0], q[1], q[2]); }
  return (r, c) => base + r * cols + c;
}
/** stitch a vertex grid into quads. wrap closes the column loop. flip reverses winding */
export function stitchGrid(mesh, idx, rows, cols, { wrap = false, flip = false } = {}) {
  const nc = wrap ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < nc; c++) {
    const a = idx(r, c), b = idx(r, (c + 1) % cols), d = idx(r + 1, (c + 1) % cols), e = idx(r + 1, c);
    if (flip) mesh.quad(a, e, d, b); else mesh.quad(a, b, d, e);
  }
}

// ============================================================================
// 2-D polygon utilities
// ============================================================================
export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/** triangulate a polygon (contour + holes). Returns {pts, tris} where tris index into pts. */
export function triangulate2D(contour, holes = []) {
  const c = contour.map((p) => new Vector2(p[0], p[1]));
  const h = holes.map((hh) => hh.map((p) => new Vector2(p[0], p[1])));
  const tris = ShapeUtils.triangulateShape(c, h);
  const pts = contour.slice(); for (const hh of holes) for (const p of hh) pts.push(p);
  return { pts, tris };
}

/**
 * Extrude a 2-D polygon (with holes) into a closed solid.
 * frame: { o:[x,y,z], U:[...], V:[...], W:[...] }  (W = extrusion direction, any length = unit)
 * point(u,v,w) = o + u U + v V + w W,  w in {0, depth}
 */
export function extrudePolygon(contour, holes, frame, depth, name = '') {
  const { o, U, V, W } = frame;
  const m = new Mesh(name);
  const P = (u, v, w) => [o[0] + u * U[0] + v * V[0] + w * W[0], o[1] + u * U[1] + v * V[1] + w * W[1], o[2] + u * U[2] + v * V[2] + w * W[2]];
  const { pts, tris } = triangulate2D(contour, holes);
  const n = pts.length;
  const iBot = [], iTop = [];
  for (const p of pts) { const a = P(p[0], p[1], 0); iBot.push(m.v(a[0], a[1], a[2])); const b = P(p[0], p[1], depth); iTop.push(m.v(b[0], b[1], b[2])); }
  for (const t of tris) { m.tri(iBot[t[0]], iBot[t[1]], iBot[t[2]]); m.tri(iTop[t[0]], iTop[t[2]], iTop[t[1]]); }
  const walls = (ring, off) => {
    for (let i = 0; i < ring.length; i++) {
      const a = off + i, b = off + (i + 1) % ring.length;
      m.quad(iBot[a], iBot[b], iTop[b], iTop[a]);
    }
  };
  walls(contour, 0);
  let off = contour.length;
  for (const hh of holes) { walls(hh, off); off += hh.length; }
  // wall winding may disagree with cap winding after earcut: normalise by volume sign per construction
  // (rebuild consistently: cap triangles from earcut are CCW or CW; walls follow ring order).
  return m.orientManifold();
}

// ============================================================================
// Superellipse helpers
// ============================================================================
/** point on superellipse of half-axes (a,b) exponent n at angle phi (§4.1) */
export function superPoint(a, b, n, phi) {
  return [a * sgnPow(Math.cos(phi), 2 / n), b * sgnPow(Math.sin(phi), 2 / n)];
}

// ============================================================================
// Closed superellipse loft (§4.1)
// st: [{z, yb, yt, a, n}] ordered monotone in z
// ============================================================================
export function ringZs(zs, nSeg, extra = []) {
  const out = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    for (let k = 0; k < nSeg; k++) out.push(z0 + (z1 - z0) * k / nSeg);
  }
  out.push(zs[zs.length - 1]);
  for (const e of extra) out.push(e);
  // sort in the direction of travel
  const dir = Math.sign(zs[zs.length - 1] - zs[0]) || 1;
  out.sort((x, y) => dir * (x - y));
  // unique
  const u = [];
  for (const z of out) if (!u.length || Math.abs(z - u[u.length - 1]) > 1e-6) u.push(z);
  return u;
}

export function loftSection(st, z) {
  const yb = stationInterp(st, 'z', z, 'yb'), yt = stationInterp(st, 'z', z, 'yt');
  return { yb, yt, a: stationInterp(st, 'z', z, 'a'), n: stationInterp(st, 'z', z, 'n'), yc: (yb + yt) / 2, b: (yt - yb) / 2 };
}

/**
 * loftSuperellipse
 * opts: nPhi (64), nSeg (10 => 9 interior rings between stations, spec requires >= 8), capFront, capBack
 *       phis: explicit list of phi values in [0,2pi) (overrides nPhi), extraZ: extra ring z's
 */
export function loftSuperellipse(st, o = {}) {
  const nSeg = o.nSeg ?? 10;
  const zs = ringZs(st.map((s) => s.z), nSeg, o.extraZ ?? []);
  const phis = o.phis ?? Array.from({ length: o.nPhi ?? 64 }, (_, k) => TAU * k / (o.nPhi ?? 64));
  const nc = phis.length;
  const m = new Mesh(o.name || 'loft');
  const secs = zs.map((z) => ({ z, ...loftSection(st, z) }));
  const idx = addGrid(m, zs.length, nc, (r, c) => {
    const s = secs[r]; const q = superPoint(s.a, s.b, s.n, phis[c]);
    return [q[0], s.yc + q[1], s.z];
  });
  const dir = Math.sign(zs[zs.length - 1] - zs[0]);
  // winding: with increasing z and increasing phi the quad order (a,b,d,e) is outward
  stitchGrid(m, idx, zs.length, nc, { wrap: true, flip: dir < 0 });
  const cap = (r, faceUp) => {
    const s = secs[r]; const ci = m.v(0, s.yc, s.z);
    for (let c = 0; c < nc; c++) {
      const a = idx(r, c), b = idx(r, (c + 1) % nc);
      if (faceUp) m.tri(ci, a, b); else m.tri(ci, b, a);
    }
  };
  if (o.capFront !== false) cap(0, dir < 0);                 // first ring: faces +z if descending in z
  if (o.capBack !== false) cap(zs.length - 1, dir > 0);      // last ring: faces +z if ascending
  return { mesh: m, zs, secs, phis, idx, nc };
}

// ============================================================================
// Lathe — revolve a closed (x, r) profile about the +X axis through centre c.
//   P = c + (x, r cos(phi), r sin(phi))
// ============================================================================
export function lathe(profile, c, nSeg = 64, name = '') {
  const m = new Mesh(name);
  const np = profile.length;
  const idx = addGrid(m, nSeg, np, (k, j) => {
    const ph = TAU * k / nSeg; const [x, r] = profile[j];
    return [c[0] + x, c[1] + r * Math.cos(ph), c[2] + r * Math.sin(ph)];
  });
  for (let k = 0; k < nSeg; k++) for (let j = 0; j < np; j++) {
    const k2 = (k + 1) % nSeg, j2 = (j + 1) % np;
    m.quad(idx(k, j), idx(k2, j), idx(k2, j2), idx(k, j2));
  }
  return m.orientOutward();
}

// ============================================================================
// Oriented box: centre c, unit axes ax,ay,az, half extents h
// ============================================================================
export function orientedBox(c, ax, ay, az, h, name = '') {
  const m = new Mesh(name);
  const ids = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    ids.push(m.v(
      c[0] + sx * h[0] * ax[0] + sy * h[1] * ay[0] + sz * h[2] * az[0],
      c[1] + sx * h[0] * ax[1] + sy * h[1] * ay[1] + sz * h[2] * az[1],
      c[2] + sx * h[0] * ax[2] + sy * h[1] * ay[2] + sz * h[2] * az[2]));
  }
  // index = sx*4 + sy*2 + sz  with (-1 -> 0, +1 -> 1)
  const I = (sx, sy, sz) => ids[(sx > 0 ? 4 : 0) + (sy > 0 ? 2 : 0) + (sz > 0 ? 1 : 0)];
  const face = (a, b, c2, d) => m.quad(a, b, c2, d);
  face(I(-1, -1, -1), I(-1, -1, 1), I(-1, 1, 1), I(-1, 1, -1)); // -x
  face(I(1, -1, -1), I(1, 1, -1), I(1, 1, 1), I(1, -1, 1));     // +x
  face(I(-1, -1, -1), I(1, -1, -1), I(1, -1, 1), I(-1, -1, 1)); // -y
  face(I(-1, 1, -1), I(-1, 1, 1), I(1, 1, 1), I(1, 1, -1));     // +y
  face(I(-1, -1, -1), I(-1, 1, -1), I(1, 1, -1), I(1, -1, -1)); // -z
  face(I(-1, -1, 1), I(1, -1, 1), I(1, 1, 1), I(-1, 1, 1));     // +z
  return m.orientOutward();
}
export function axisBox(x0, x1, y0, y1, z0, z1, name = '') {
  return orientedBox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2], name);
}

// ============================================================================
// Cylinder (solid) between two points, radius r
// ============================================================================
export function cylinder(p0, p1, r, nSeg = 24, name = '', caps = true) {
  const m = new Mesh(name);
  const ax = v3.norm(v3.sub(p1, p0));
  const t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = v3.norm(v3.cross(ax, t)), w = v3.cross(ax, u);
  const ring = (p) => Array.from({ length: nSeg }, (_, k) => { const a = TAU * k / nSeg; return m.v(...v3.add(p, v3.add(v3.mul(u, r * Math.cos(a)), v3.mul(w, r * Math.sin(a))))); });
  const a = ring(p0), b = ring(p1);
  for (let k = 0; k < nSeg; k++) { const k2 = (k + 1) % nSeg; m.quad(a[k], a[k2], b[k2], b[k]); }
  if (caps) {
    const c0 = m.v(...p0), c1 = m.v(...p1);
    for (let k = 0; k < nSeg; k++) { const k2 = (k + 1) % nSeg; m.tri(c0, a[k2], a[k]); m.tri(c1, b[k], b[k2]); }
    m.orientOutward();
  }
  return m;
}

// ============================================================================
// §4.4 NACA 4-digit airfoil (inverted for downforce: m -> -m)
// Returns a closed loop of (X,Y) in chord-normalised coordinates, LE first,
// upper surface to TE then lower surface back (TE vertex appears once).
// ============================================================================
export function nacaLoop(code, inverted = true, N = 40) {
  const d1 = +code[0], d2 = +code[1], tt = +code.slice(2, 4);
  let m = d1 / 100; const p = d2 / 10 || 0.4, t = tt / 100;
  if (inverted) m = -m;
  const xs = Array.from({ length: N + 1 }, (_, k) => (1 - Math.cos(Math.PI * k / N)) / 2);
  const up = [], lo = [];
  for (const x of xs) {
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc = 0, dyc = 0;
    if (m !== 0) {
      if (x < p) { yc = (m / (p * p)) * (2 * p * x - x * x); dyc = (2 * m / (p * p)) * (p - x); }
      else { yc = (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x); dyc = (2 * m / ((1 - p) ** 2)) * (p - x); }
    }
    const psi = Math.atan(dyc);
    up.push([x - yt * Math.sin(psi), yc + yt * Math.cos(psi)]);
    lo.push([x + yt * Math.sin(psi), yc - yt * Math.cos(psi)]);
  }
  // loop: upper LE->TE, then lower TE->LE (skip TE dup and LE dup)
  const loop = up.slice();
  for (let k = N - 1; k >= 1; k--) loop.push(lo[k]);
  return loop;
}

/**
 * Place a chord-normalised loop in the (z,y) side view (§4.4).
 *   c-hat = (-cos a, +sin a), n-hat = (+sin a, +cos a)
 *   (z,y) = LE + C (X c-hat + Y n-hat)
 */
export function placeAirfoil(loop, LEz, LEy, C, alphaDeg) {
  const a = alphaDeg * DEG, ca = Math.cos(a), sa = Math.sin(a);
  return loop.map(([X, Y]) => [
    LEz + C * (X * -ca + Y * sa),
    LEy + C * (X * sa + Y * ca),
  ]);
}

/**
 * Extrude a (z,y) polygon along X between x0(z) and x1(z) (functions allow trimming at slanted endplates).
 * Builds a closed solid: wall ring + two cap surfaces (height fields).
 */
export function extrudeZYAlongX(poly, x0, x1, name = '') {
  const f0 = typeof x0 === 'function' ? x0 : () => x0;
  const f1 = typeof x1 === 'function' ? x1 : () => x1;
  const m = new Mesh(name);
  const n = poly.length;
  const a = poly.map(([z, y]) => m.v(f0(z), y, z));
  const b = poly.map(([z, y]) => m.v(f1(z), y, z));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; m.quad(a[i], a[j], b[j], b[i]); }
  const { tris } = triangulate2D(poly.map((p) => [p[0], p[1]]));
  for (const t of tris) { m.tri(a[t[0]], a[t[1]], a[t[2]]); m.tri(b[t[0]], b[t[2]], b[t[1]]); }
  return m.orientManifold();
}

/** flat plate: polygon in (z,y) extruded along X from x0 to x1 (constant) */
export function plateZY(poly, x0, x1, name = '') { return extrudeZYAlongX(poly, x0, x1, name); }

// ============================================================================
// §4.5 swept suspension member: elliptical section (chord C, thickness tau), flat caps
// ============================================================================
export function sweptMember(A, B, C, tau, name = '', nU = 8, nW = 24) {
  const e = v3.norm(v3.sub(B, A));
  const m_ = v3.norm(v3.cross([0, 1, 0], e));         // m-hat is perpendicular to Y_B  =>  major axis horizontal
  const n_ = v3.cross(e, m_);
  const m = new Mesh(name);
  const idx = addGrid(m, nU + 1, nW, (r, c) => {
    const u = r / nU, w = TAU * c / nW;
    const P = v3.lerp(A, B, u);
    return v3.add(v3.add(P, v3.mul(m_, (C / 2) * Math.cos(w))), v3.mul(n_, (tau / 2) * Math.sin(w)));
  });
  stitchGrid(m, idx, nU + 1, nW, { wrap: true });
  const cA = m.v(...A), cB = m.v(...B);
  for (let c = 0; c < nW; c++) { const c2 = (c + 1) % nW; m.tri(cA, idx(0, c2), idx(0, c)); m.tri(cB, idx(nU, c), idx(nU, c2)); }
  m.orientOutward();
  m.frame = { e, m: m_, n: n_, A, B, C, tau };
  return m;
}

// ============================================================================
// §4.6 Bézier sweep with flat-top D section
// ============================================================================
export function bezier(P0, P1, P2, P3, u) {
  const w0 = (1 - u) ** 3, w1 = 3 * (1 - u) ** 2 * u, w2 = 3 * (1 - u) * u * u, w3 = u ** 3;
  return [0, 1, 2].map((k) => w0 * P0[k] + w1 * P1[k] + w2 * P2[k] + w3 * P3[k]);
}
export function bezierD(P0, P1, P2, P3, u) {
  const w0 = 3 * (1 - u) ** 2, w1 = 6 * (1 - u) * u, w2 = 3 * u * u;
  return [0, 1, 2].map((k) => w0 * (P1[k] - P0[k]) + w1 * (P2[k] - P1[k]) + w2 * (P3[k] - P2[k]));
}
export function bezierFrame(P0, P1, P2, P3, u) {
  const t = v3.norm(bezierD(P0, P1, P2, P3, u));
  const m = v3.norm(v3.cross([0, 1, 0], t));
  const n = v3.cross(t, m);
  return { t, m, n };
}
/** D section point (§4.6): upper superellipse n=8 flat top, lower half ellipse */
export function dSection(alpha, a, bt, bb) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  if (sa >= 0) return [a * sgnPow(ca, 1 / 4), bt * Math.pow(Math.abs(sa), 1 / 4)];
  return [a * ca, bb * sa];
}
export const dSectionArea = (a, bt, bb) => Math.PI * a * bb / 2 + 2 * a * bt * gammaFn(1.125) ** 2 / gammaFn(1.25);

export function bezierSweepD(P0, P1, P2, P3, { a = 55, bt = 18, bb = 32, nU = 64, nA = 48, u0 = 0, u1 = 1, offset = 0, name = '', capStart = false, capEnd = false } = {}) {
  const m = new Mesh(name);
  const idx = addGrid(m, nU + 1, nA, (r, c) => {
    const u = u0 + (u1 - u0) * r / nU;
    const B = bezier(P0, P1, P2, P3, u); const { m: mh, n: nh } = bezierFrame(P0, P1, P2, P3, u);
    const al = TAU * c / nA;
    let [dm, dn] = dSection(al, a, bt, bb);
    if (offset) { // grow section radially by `offset` (sleeve)
      const L = Math.hypot(dm, dn) || 1; dm += offset * dm / L; dn += offset * dn / L;
    }
    return [B[0] + dm * mh[0] + dn * nh[0], B[1] + dm * mh[1] + dn * nh[1], B[2] + dm * mh[2] + dn * nh[2]];
  });
  stitchGrid(m, idx, nU + 1, nA, { wrap: true });
  const cap = (r, up) => {
    const u = u0 + (u1 - u0) * r / nU; const B = bezier(P0, P1, P2, P3, u); const ci = m.v(...B);
    for (let c = 0; c < nA; c++) { const c2 = (c + 1) % nA; if (up) m.tri(ci, idx(r, c), idx(r, c2)); else m.tri(ci, idx(r, c2), idx(r, c)); }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(nU, false);
  // orientation: pipe walls (open) take the 'closed' fix only when capped
  if (capStart && capEnd) m.orientOutward();
  else { // choose outward by testing a wall point against the section centre
    const t = m.i; const p = m.p; const k = 0;
    const a_ = t[k] * 3, b_ = t[k + 1] * 3, c_ = t[k + 2] * 3;
    const nx = (p[b_ + 1] - p[a_ + 1]) * (p[c_ + 2] - p[a_ + 2]) - (p[b_ + 2] - p[a_ + 2]) * (p[c_ + 1] - p[a_ + 1]);
    const ny = (p[b_ + 2] - p[a_ + 2]) * (p[c_] - p[a_]) - (p[b_] - p[a_]) * (p[c_ + 2] - p[a_ + 2]);
    const nz = (p[b_] - p[a_]) * (p[c_ + 1] - p[a_ + 1]) - (p[b_ + 1] - p[a_ + 1]) * (p[c_] - p[a_]);
    const B0 = bezier(P0, P1, P2, P3, u0);
    const out = (p[a_] - B0[0]) * nx + (p[a_ + 1] - B0[1]) * ny + (p[a_ + 2] - B0[2]) * nz;
    if (out < 0) m.flip();
  }
  return m;
}

// ============================================================================
// §4.7 superellipse-torus tyre
// ============================================================================
export function tyreTorus(C, W, Rw, Rrim, { nPhi = 64, nAlpha = 48, name = '', phase = 0 } = {}) {
  const H = Rw - Rrim, rm = Rrim + H / 2;
  const m = new Mesh(name);
  const idx = addGrid(m, nPhi, nAlpha, (k, j) => {
    const ph = phase + TAU * k / nPhi, al = TAU * j / nAlpha;
    const xi = (W / 2) * sgnPow(Math.cos(al), 2 / 3);
    const rho = rm + (H / 2) * sgnPow(Math.sin(al), 2 / 3);
    return [C[0] + xi, C[1] + rho * Math.cos(ph), C[2] + rho * Math.sin(ph)];
  });
  for (let k = 0; k < nPhi; k++) for (let j = 0; j < nAlpha; j++) {
    const k2 = (k + 1) % nPhi, j2 = (j + 1) % nAlpha;
    m.quad(idx(k, j), idx(k2, j), idx(k2, j2), idx(k, j2));
  }
  return m.orientOutward();
}

// ============================================================================
// plan-region rasteriser: converts an implicit plan region into runs of quads at height y
// (used for gold foil patches).  test(x,z)->bool.  cell in mm.
// ============================================================================
export function rasterPatch(test, x0, x1, z0, z1, cell, y, name = '') {
  const m = new Mesh(name);
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  for (let j = 0; j < nz; j++) {
    const za = z0 + j * cell, zb = Math.min(z1, za + cell), zc = (za + zb) / 2;
    let run = -1;
    for (let i = 0; i <= nx; i++) {
      const xa = x0 + i * cell, xc = xa + cell / 2;
      const inside = i < nx && test(xc, zc);
      if (inside && run < 0) run = i;
      if (!inside && run >= 0) {
        const xs = x0 + run * cell, xe = Math.min(x1, x0 + i * cell);
        const a = m.v(xs, y, za), b = m.v(xe, y, za), c = m.v(xe, y, zb), d = m.v(xs, y, zb);
        // normal +y : (a,d,c,b)
        m.quad(a, d, c, b);
        run = -1;
      }
    }
  }
  return m;
}
