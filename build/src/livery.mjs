// ============================================================================
// livery.mjs — flat canvas-texture decals (stylised, NOT photographic).
// Base navy ~#0B1F4B [EST].  Brand artwork is simplified; where exact artwork
// geometry is unknown plain text in the brand colours is used (noted in handoff).
// Browser only (uses <canvas>).
// ============================================================================
import * as THREE from 'three';
import * as S from './spec.mjs';
import { buildPatch, airfoilUpperPatch, canopyFlank, canopyRoof, podRow, Row } from './surfaces.mjs';
import { loftSection, superPoint, triangulate2D, TAU } from './core.mjs';
import { endplateInnerX } from './bodies.mjs';

export const COLORS = { navy: '#0B1F4B', yellow: '#FFC20E', red: '#D8173B', white: '#F4F6FA', silver: '#C9CED6', black: '#0b0d12' };

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const texOf = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; };

function fitText(ctx, text, maxW, size, weight = '900', style = 'italic', family = 'Arial Black, Arial, Helvetica, sans-serif') {
  let s = size;
  for (let i = 0; i < 40; i++) { ctx.font = `${style} ${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; s *= 0.94; }
  return s;
}

export function paintWord(text, { w = 1024, h = 192, color = COLORS.white, bg = null, pad = 28, weight = '900', style = 'italic', family } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  const s = fitText(x, text, w - pad * 2, h * 0.78, weight, style, family);
  x.font = `${style} ${weight} ${s}px ${family || 'Arial Black, Arial, Helvetica, sans-serif'}`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
  x.fillText(text, w / 2, h / 2 + s * 0.04);
  return texOf(c);
}
export function paintTwoTone(a, b, ca, cb, { w = 1024, h = 192 } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  const total = a + ' ' + b; const s = fitText(x, total, w - 60, h * 0.8);
  x.font = `italic 900 ${s}px Arial Black, Arial, Helvetica, sans-serif`; x.textBaseline = 'middle';
  const wa = x.measureText(a + ' ').width, wb = x.measureText(b).width, x0 = (w - (wa + wb)) / 2;
  x.fillStyle = ca; x.fillText(a + ' ', x0, h / 2 + s * 0.04); x.fillStyle = cb; x.fillText(b, x0 + wa, h / 2 + s * 0.04);
  return texOf(c);
}
export function paintTotal({ w = 768, h = 256 } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = COLORS.red; x.fillRect(0, 0, w, h);
  x.strokeStyle = COLORS.white; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20);
  const s = fitText(x, 'TOTAL', w - 70, h * 0.62);
  x.font = `italic 900 ${s}px Arial Black, Arial, Helvetica, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = COLORS.white;
  x.fillText('TOTAL', w / 2, h / 2 + s * 0.04);
  return texOf(c);
}
export function paintSolid(color, { w = 64, h = 64 } = {}) { const c = cv(w, h), x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h); return texOf(c); }
export function paintPirelli({ w = 1024, h = 192 } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = COLORS.red; x.fillRect(0, 0, w, h);
  x.fillStyle = COLORS.yellow; x.fillRect(0, h * 0.82, w, h * 0.18);
  const s = fitText(x, 'Pirelli', w - 80, h * 0.64);
  x.font = `italic 900 ${s}px Arial Black, Arial, Helvetica, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = COLORS.yellow;
  x.fillText('Pirelli', w / 2, h * 0.42 + s * 0.04);
  return texOf(c);
}

/** charging-bull silhouette (generic stylised shape, not the trademark artwork), facing +x */
function drawBull(x, ox, oy, sc, flip, fill) {
  x.save(); x.translate(ox, oy); x.scale(flip ? -sc : sc, sc); x.fillStyle = fill; x.strokeStyle = fill; x.lineCap = 'round'; x.lineJoin = 'round';
  // body
  x.beginPath(); x.moveTo(-120, -10); x.bezierCurveTo(-110, -70, -20, -85, 40, -70);                     // back to shoulder hump
  x.bezierCurveTo(90, -90, 130, -60, 150, -20);                                                          // hump to neck
  x.bezierCurveTo(175, -5, 190, 20, 185, 40);                                                            // head lowered
  x.bezierCurveTo(170, 55, 150, 45, 140, 30);                                                            // muzzle
  x.bezierCurveTo(120, 50, 80, 55, 40, 50);                                                              // chest/belly
  x.bezierCurveTo(-20, 60, -80, 55, -115, 35);                                                           // belly to rump
  x.bezierCurveTo(-130, 25, -128, 5, -120, -10); x.closePath(); x.fill();
  // legs
  x.lineWidth = 15;
  x.beginPath(); x.moveTo(110, 40); x.lineTo(150, 78); x.lineTo(185, 70); x.stroke();                    // front near
  x.beginPath(); x.moveTo(85, 45); x.lineTo(105, 95); x.lineTo(138, 100); x.stroke();                    // front far
  x.beginPath(); x.moveTo(-85, 40); x.lineTo(-130, 82); x.lineTo(-165, 70); x.stroke();                  // rear near
  x.beginPath(); x.moveTo(-60, 45); x.lineTo(-90, 100); x.lineTo(-125, 104); x.stroke();                 // rear far
  // horns + tail
  x.lineWidth = 10;
  x.beginPath(); x.moveTo(168, 8); x.bezierCurveTo(190, -20, 205, -40, 225, -42); x.stroke();
  x.beginPath(); x.moveTo(152, 2); x.bezierCurveTo(165, -26, 178, -44, 198, -52); x.stroke();
  x.lineWidth = 8; x.beginPath(); x.moveTo(-118, -20); x.bezierCurveTo(-150, -50, -175, -35, -190, -60); x.stroke();
  x.restore();
}
export function paintEmblem({ w = 1280, h = 600 } = {}) {
  const c = cv(w, h), x = c.getContext('2d');
  // sun
  const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.5);
  g.addColorStop(0, '#FFF19A'); g.addColorStop(0.55, COLORS.yellow); g.addColorStop(1, '#F29A00');
  x.fillStyle = g; x.beginPath(); x.arc(w / 2, h / 2, h * 0.47, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(11,31,75,0.85)'; x.lineWidth = 8; x.beginPath(); x.arc(w / 2, h / 2, h * 0.47, 0, TAU); x.stroke();
  // two bulls charging toward each other
  drawBull(x, w * 0.30, h * 0.56, 1.45, false, '#C4152F');
  drawBull(x, w * 0.70, h * 0.56, 1.45, true, '#C4152F');
  x.fillStyle = 'rgba(255,255,255,0.0)';
  return texOf(c);
}

// ---------------------------------------------------------------------------
// geometry assembly helpers
// ---------------------------------------------------------------------------
function geomFromPatch(p, { flipU = false } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(p.pos.length); for (let i = 0; i < pos.length; i++) pos[i] = p.pos[i] * 1e-3;
  const uv = new Float32Array(p.uv.length); for (let i = 0; i < uv.length; i += 2) { uv[i] = flipU ? 1 - p.uv[i] : p.uv[i]; uv[i + 1] = p.uv[i + 1]; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(p.idx);
  g.computeVertexNormals();
  return g;
}
const decalMat = (map, extra = {}) => new THREE.MeshStandardMaterial({
  map, transparent: true, roughness: 0.38, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra,
});

/** flat polygon in the outer plane of an endplate (s,y) -> 3D */
function endplatePolyGeom(outline, frame, inset = 0) {
  const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length, cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
  const poly = outline.map(([s, y]) => { const dx = s - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1; return [s - dx / L * inset, y - dy / L * inset]; });
  const { pts, tris } = triangulate2D(poly, []);
  const pos = [], uv = [], idx = [];
  const minS = Math.min(...poly.map((p) => p[0])), maxS = Math.max(...poly.map((p) => p[0])), minY = Math.min(...poly.map((p) => p[1])), maxY = Math.max(...poly.map((p) => p[1]));
  for (const [s, y] of pts) {
    pos.push(frame.o[0] + s * frame.U[0] + y * frame.V[0] + frame.n[0] * 0.4, frame.o[1] + s * frame.U[1] + y * frame.V[1] + frame.n[1] * 0.4, frame.o[2] + s * frame.U[2] + y * frame.V[2] + frame.n[2] * 0.4);
    uv.push((s - minS) / (maxS - minS), (y - minY) / (maxY - minY));
  }
  for (const t of tris) idx.push(t[0], t[1], t[2]);
  return { pos, uv, idx };
}

/**
 * Build all decal descriptors.
 * Returns { bodyId: [ {geom, geomFlipped, map, mat, name} ] } keyed by authored body (xp for sided bodies).
 */
export function buildLivery() {
  const D = {};
  const add = (body, name, patch, map, matExtra = {}, sided = false) => {
    (D[body] ||= []).push({ name, geom: geomFromPatch(patch), geomFlip: sided ? geomFromPatch(patch, { flipU: true }) : null, mat: decalMat(map, matExtra) });
  };
  const tEmblem = paintEmblem(), tRenault = paintWord('RENAULT', { color: COLORS.white, h: 160, w: 1024, weight: '800' });
  const tRedBull = paintTwoTone('Red', 'Bull', COLORS.white, COLORS.red);
  const tPirelli = paintPirelli(), tRauch = paintWord('RAUCH', { color: COLORS.white, h: 160 });
  const tInfiniti = paintWord('INFINITI', { color: COLORS.silver, h: 160, weight: '600', style: 'normal', family: 'Arial, Helvetica, sans-serif' });
  const tTotal = paintTotal(), tYellow = paintSolid(COLORS.yellow);

  // ---- engine cover (both flanks explicit; text reads front->rear on +x flank, rear->front on -x) ----
  const cov = 'engine_cover_and_sharkfin';
  for (const side of [+1, -1]) {
    const uFlip = side < 0;
    const mk = (z0, z1, s0, s1, map, nz = 20, ns = 12) => {
      const p = buildPatch((z) => canopyFlank(z, side), z0, z1, s0, s1, { nz, ns, uFlip });
      return p;
    };
    add(cov, `emblem_${side}`, mk(-1540, -2200, 30, 360, tEmblem), tEmblem);
    add(cov, `renault_${side}`, mk(-2260, -2800, 70, 150, tRenault), tRenault);
  }
  { const p = buildPatch((z) => canopyRoof(z), -1252, -1345, -1000, 1000, { nz: 6, ns: 60 }); add(cov, 'yellow_edge', p, tYellow); }

  // ---- sidepods (authored +x; the _xn instance uses flipped U so text stays readable) ----
  const pod = 'sidepod_pods';
  add(pod, 'redbull', buildPatch((z) => podRow(z), -1520, -2160, 25, 150, { nz: 24, ns: 10 }), tRedBull, {}, true);
  add(pod, 'pirelli', buildPatch((z) => podRow(z), -2220, -2580, 12, 70, { nz: 16, ns: 6 }), tPirelli, {}, true);
  add(pod, 'rauch', buildPatch((z) => podRow(z), -1180, -1340, 190, 250, { nz: 10, ns: 8 }), tRauch, {}, true);
  add(pod, 'infiniti', buildPatch((z) => podRow(z), -1165, -1310, 95, 135, { nz: 10, ns: 4 }), tInfiniti, {}, true);

  // ---- nose ----
  const nb = 'nose_and_front_wing_cascade';
  const noseLoop = (z) => {
    const s = loftSection(S.NOSE_ST, z); const N = 200; const pts = [];
    for (let k = 0; k <= N; k++) { const ph = -Math.PI / 2 + TAU * k / N; const q = superPoint(s.a, s.b, s.n, ph); pts.push([q[0], s.yc + q[1]]); }
    const r = new Row(pts, 0, 1);
    // reference = top centre (phi = pi/2) at index N/2
    r.sRef = r.cum[Math.round(N / 2)]; return r;
  };
  const loopLen = (z) => noseLoop(z).length;
  {
    // yellow tip band: whole loop, z 1075..1135
    const p = buildPatch((z) => noseLoop(z), 1075, 1135, -400, 400, { nz: 6, ns: 80, uFlip: false });
    add(nb, 'nose_tip_band', p, tYellow);
    const q = loopLen(720) / 4;
    for (const side of [+1, -1]) {
      const sc = side > 0 ? q : -q;
      const p2 = buildPatch((z) => noseLoop(z), 640, 820, sc - 32, sc + 32, { nz: 14, ns: 8, uFlip: side < 0 });
      // on +x flank s increases toward -x going over the top? sign: s>0 toward +x
      add(nb, `total_nose_${side}`, p2, tTotal);
    }
    add(nb, 'infiniti_nose', buildPatch((z) => noseLoop(z), 760, 960, -42, 42, { nz: 14, ns: 6, uFlip: true }), tInfiniti);
  }
  // ---- front wing: TOTAL on the main-plane upper surface (both halves) ----
  for (const side of [+1, -1]) {
    const x0 = side * 310, x1 = side * 560;
    const p = airfoilUpperPatch(S.FW.main, x0, x1, 0.28, 0.58, { nx: 8, nc: 6, offset: 0.4 });
    add(nb, `total_fw_${side}`, p, tTotal);
  }
  // ---- front wing endplates: yellow outer faces ----
  {
    const P = S.FW_PLATE; const L = Math.hypot(P.p1[0] - P.p0[0], P.p1[1] - P.p0[1]);
    const d = [(P.p1[0] - P.p0[0]) / L, (P.p1[1] - P.p0[1]) / L]; const nOut = [-d[1], d[0]];
    const outline = [[0, P.y0], [0, P.y1], [L, P.y1], [L, P.yTE], [P.sChamfer, P.y0]];
    for (const side of [+1, -1]) {
      const frame = { o: [side * P.p0[0], 0, P.p0[1]], U: [side * d[0], 0, d[1]], V: [0, 1, 0], n: [side * nOut[0], 0, nOut[1]] };
      const g = endplatePolyGeom(outline, frame, 6);
      add(nb, `ep_yellow_${side}`, g, tYellow);
    }
  }
  // ---- rear-wing endplates: TOTAL block on outer faces ----
  {
    const rw = 'rear_wing_DRS';
    for (const side of [+1, -1]) {
      const xo = side * (S.RW.plate.x[1] + 0.4);
      const z0 = -3560, z1 = -3860, y0 = 800, y1 = 900;
      const pos = [], uv = [], idx = [];
      const corners = [[z0, y0, 0, 0], [z1, y0, 1, 0], [z1, y1, 1, 1], [z0, y1, 0, 1]];
      for (const [z, y, u, v] of corners) { pos.push(xo, y, z); uv.push(side > 0 ? u : 1 - u, v); }
      idx.push(0, 1, 2, 0, 2, 3);
      add(rw, `total_rw_${side}`, { pos, uv, idx }, tTotal);
    }
  }
  return D;
}
