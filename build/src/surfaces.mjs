// ============================================================================
// surfaces.mjs — arc-length parametrisations of the body surfaces, used to lay
// flat decal patches onto the lofted shells (mm, frame B).  DOM-free.
// ============================================================================
import { sgnPow, superPoint, loftSection, TAU, DEG, nacaLoop, placeAirfoil } from './core.mjs';
import * as S from './spec.mjs';
import { canopySection, canopyRow, podPoint } from './bodies.mjs';

/** polyline of [x,y] points with cumulative arc length; query position + outward normal at arc length s */
export class Row {
  constructor(pts, sRef = 0, outward = 1) {
    this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.sRef = sRef; this.outward = outward; this.length = this.cum[this.cum.length - 1];
  }
  /** s is measured from the reference point (cum index position `sRef` in cumulative length) */
  at(s) {
    let t = this.sRef + s; t = Math.max(0, Math.min(this.length, t));
    let i = 1; while (i < this.cum.length - 1 && this.cum[i] < t) i++;
    const a = this.pts[i - 1], b = this.pts[i], u = (t - this.cum[i - 1]) / ((this.cum[i] - this.cum[i - 1]) || 1);
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    return { x, y, nx: this.outward * ty / L, ny: -this.outward * tx / L };
  }
}

/** engine-cover section polyline for the +x flank, arc length measured upward from the skirt top (phi = 0) */
export function canopyFlank(z, side = +1) {
  const sec = canopySection(z);
  const pts = [];
  const N = 160;
  for (let k = 0; k <= N; k++) {
    const ph = (Math.PI / 2) * k / N;            // phi from 0 (skirt top) to pi/2 (top centre)
    pts.push([side * sec.a * sgnPow(Math.cos(ph), 2 / sec.n), sec.ys + (sec.yt - sec.ys) * Math.pow(Math.sin(ph), 2 / sec.n)]);
  }
  // outward normal: for +x flank going up the polyline tangent points up/inward; outward = (ty, -tx)
  return new Row(pts, 0, side > 0 ? 1 : -1);
}

/** full roof polyline right skirt-top -> top centre -> left skirt-top; s measured from the top centre, + toward +x */
export function canopyRoof(z) {
  const sec = canopySection(z); const pts = []; const N = 240;
  for (let k = 0; k <= N; k++) {
    const ph = Math.PI * (1 - k / N);            // from pi (left) to 0 (right)
    pts.push([sec.a * sgnPow(Math.cos(ph), 2 / sec.n), sec.ys + (sec.yt - sec.ys) * Math.pow(Math.abs(Math.sin(ph)), 2 / sec.n)]);
  }
  const r = new Row(pts, 0, 1);
  // reference = top centre
  let best = 0, bx = 1e9; for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i][0]) < bx) { bx = Math.abs(pts[i][0]); best = i; }
  r.sRef = r.cum[best];
  return r;
}

/** pod outer surface section from phi=0 (outer middle). s>0 upward, s<0 downward */
export function podRow(z) {
  const pts = []; const N = 200;
  for (let k = 0; k <= N; k++) { const ph = -Math.PI / 2 + Math.PI * k / N; const p = podPoint(z, ph); pts.push([p[0], p[1]]); }
  const r = new Row(pts, 0, -1);
  // outward normal for the pod points to +x at phi=0: tangent goes upward (dy>0) => outward = (ty,-tx)*(+1)
  r.outward = 1;
  let best = 0, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = Math.abs(-Math.PI / 2 + Math.PI * i / N); if (d < bd) { bd = d; best = i; } }
  r.sRef = r.cum[best];
  return r;
}

/** nose loop at z; s measured from the top centre, positive toward +x (clockwise seen from +z... ) */
export function noseRow(z) {
  const s = loftSection(S.NOSE_ST, z); const N = 256; const pts = [];
  for (let k = 0; k <= N; k++) {
    const ph = Math.PI * (1 - k / N) * 1;       // pi .. 0 (upper half only)
    const q = superPoint(s.a, s.b, s.n, ph); pts.push([q[0], s.yc + q[1]]);
  }
  const r = new Row(pts, 0, 1);
  let best = 0, bx = 1e9; for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i][0]) < bx) { bx = Math.abs(pts[i][0]); best = i; }
  r.sRef = r.cum[best];
  return r;
}

/**
 * Build a decal patch: rows at each z (descending or ascending), columns at s values.
 * rowFn(z) -> Row. offset (mm) along the outward normal. mirrorX flips x of the sampled points.
 * uv: u runs along z from z0 to z1 (u in [0,1]); v runs along s.
 */
export function buildPatch(rowFn, z0, z1, s0, s1, { nz = 24, ns = 16, offset = 0.4, uFlip = false } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * i / nz; const row = rowFn(z);
    for (let j = 0; j <= ns; j++) {
      const s = s0 + (s1 - s0) * j / ns; const q = row.at(s);
      pos.push(q.x + q.nx * offset, q.y + q.ny * offset, z);
      let u = i / nz; if (uFlip) u = 1 - u;
      uv.push(u, j / ns);
    }
  }
  const cols = ns + 1;
  for (let i = 0; i < nz; i++) for (let j = 0; j < ns; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
    idx.push(a, b, c, a, c, d);
  }
  return { pos, uv, idx };
}

/** upper surface of an inverted NACA wing element as a patch over x (span) and chord fraction */
export function airfoilUpperPatch(def, x0, x1, X0, X1, { nx = 12, nc = 16, offset = 0.4, inverted = true } = {}) {
  // build upper-surface function Y_u(X) from the profile loop (first N+1 points are LE->TE upper)
  const loop = nacaLoop(def.code, inverted, 40);
  const upper = loop.slice(0, 41);                    // LE..TE upper surface
  const pos = [], uv = [], idx = [];
  const place = placeAirfoil(upper, def.LE[0], def.LE[1], def.C, def.alpha);
  const at = (X) => { // interpolate along upper placed polyline by chord fraction X in [0,1]
    const f = X * 40; const i = Math.min(39, Math.floor(f)); const t = f - i;
    // the placed array is parametrised by cosine-spaced index not by X; find by X on the unplaced loop
    let k = 0; while (k < 40 && upper[k + 1][0] < X) k++;
    const a = upper[k], b = upper[Math.min(40, k + 1)]; const u = (X - a[0]) / ((b[0] - a[0]) || 1);
    const pa = place[k], pb = place[Math.min(40, k + 1)];
    void f; void i; void t;
    return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u, a[1] + (b[1] - a[1]) * u];
  };
  for (let i = 0; i <= nc; i++) {
    const X = X0 + (X1 - X0) * i / nc; const [z, y] = at(X);
    const [z2, y2] = at(Math.min(1, X + 0.01)); const [z1, y1] = at(Math.max(0, X - 0.01));
    const tz = z2 - z1, ty = y2 - y1, L = Math.hypot(tz, ty) || 1;
    // upper surface outward normal (up): rotate tangent (tz,ty) by -90deg when the tangent points toward -z
    let nz_ = -ty / L, ny_ = tz / L; if (ny_ < 0) { nz_ = -nz_; ny_ = -ny_; }
    for (let j = 0; j <= nx; j++) {
      const x = x0 + (x1 - x0) * j / nx;
      pos.push(x, y + ny_ * offset, z + nz_ * offset);
      uv.push(j / nx, 1 - i / nc);
    }
  }
  const cols = nx + 1;
  for (let i = 0; i < nc; i++) for (let j = 0; j < nx; j++) { const a = i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols; idx.push(a, c, b, a, d, c); }
  return { pos, uv, idx };
}

void canopyRow; void TAU; void DEG;
