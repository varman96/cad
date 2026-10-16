// ============================================================================
// bodies.mjs — builds every rigid body of the RB7 model from the §5 recipes.
// Geometry in mm, frame B, right (+X) side authored; _xn bodies share meshes + mirror flag.
// ============================================================================
import {
  DEG, TAU, sgnPow, lerp, clamp, v3, Mesh, addGrid, stitchGrid, triangulate2D, pointInPoly,
  extrudePolygon, clipTriangles, superPoint, ringZs, loftSection, loftSuperellipse, lathe, orientedBox, axisBox, cylinder,
  nacaLoop, placeAirfoil, extrudeZYAlongX, plateZY, sweptMember, bezier, bezierD, bezierFrame, dSection,
  bezierSweepD, tyreTorus, rasterPatch, stationInterp,
} from './core.mjs';
import * as S from './spec.mjs';

const { K } = S;
export const NOTES = []; // interpretation log -> handoff
const note = (id, where, text) => NOTES.push({ id, where, text });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const mirrorPart = (m, name) => m.clone(name).mirrorX();
function polylineLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += v3.len(v3.sub(pts[i], pts[i - 1])); return L; }

/** offset an open polyline (x,z) by +-hw using mitred joins. returns {left,right} */
function offsetPolyline(pts, hw) {
  const n = pts.length; const left = [], right = [];
  const dirs = []; for (let i = 0; i < n - 1; i++) { const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]; const l = Math.hypot(...d); dirs.push([d[0] / l, d[1] / l]); }
  const nrm = (d) => [-d[1], d[0]];            // left normal in the (x,z) plane
  for (let i = 0; i < n; i++) {
    let nv;
    if (i === 0) nv = nrm(dirs[0]); else if (i === n - 1) nv = nrm(dirs[n - 2]);
    else {
      const n1 = nrm(dirs[i - 1]), n2 = nrm(dirs[i]); const sx = n1[0] + n2[0], sz = n1[1] + n2[1]; const sl = Math.hypot(sx, sz);
      const k = 1 / Math.max(0.2, (sx / sl) * n1[0] + (sz / sl) * n1[1]);
      nv = [sx / sl * k, sz / sl * k];
    }
    left.push([pts[i][0] + nv[0] * hw, pts[i][1] + nv[1] * hw]);
    right.push([pts[i][0] - nv[0] * hw, pts[i][1] - nv[1] * hw]);
  }
  return { left, right };
}

// ---------------------------------------------------------------------------
// §5.1 monocoque
// ---------------------------------------------------------------------------
function buildMonocoque() {
  const phiSet = new Set();
  const addPhi = (p) => { p = ((p % TAU) + TAU) % TAU; phiSet.add(Math.round(p * 1e7) / 1e7); };
  for (let k = 0; k < 64; k++) addPhi(TAU * k / 64);                   // spec N_phi = 64 baseline
  const addY = (zRef, y0, y1, step) => {                               // local refinement around the §5.8 chassis openings
    const s = loftSection(S.MONO_ST, zRef);
    for (let y = y0; y <= y1; y += step) {
      const eta = (y - s.yc) / s.b; if (Math.abs(eta) >= 0.999) continue;
      const ph = Math.asin(sgnPow(eta, s.n / 2)); addPhi(ph); addPhi(Math.PI - ph);
    }
  };
  addY(-75, 515, 655, 4); addY(110, 375, 445, 4);
  const phis = [...phiSet].sort((a, b) => a - b);
  const extraZ = [];
  for (let z = -125; z <= -30; z += 4) extraZ.push(z);
  for (let z = 75; z <= 145; z += 4) extraZ.push(z);
  const lf = loftSuperellipse(S.MONO_ST, { phis, extraZ, name: 'monocoque_skin' });
  const m = lf.mesh;
  const C = S.COCKPIT, sl = S.FSUS.slot, ho = S.FSUS.hole;
  const segDist = (p, a, b) => {
    const ab = v3.sub(b, a), t = clamp(v3.dot(v3.sub(p, a), ab) / v3.dot(ab, ab), 0, 1);
    return v3.len(v3.sub(p, v3.madd(a, ab, t)));
  };
  // exact cuts (F < 0 is removed).  cockpit: plan superellipse on the upper skin (y > 520).
  clipTriangles(m, (x, y, z) => {
    if (y <= C.yMin) return 1;
    return Math.pow(Math.abs((z - C.zc) / C.hz), C.p) + Math.pow(Math.abs(x / C.hx), C.p) - 1;
  });
  clipTriangles(m, (x, y, z) => (Math.abs(x) > 100 && y > 380 && y < 700 && z > -150 && z < 0) ? segDist([Math.abs(x), y, z], sl.a, sl.b) - sl.r : 1);   // pushrod slot (both sides)
  clipTriangles(m, (x, y, z) => (Math.abs(x) > 120) ? Math.max(Math.abs(y - ho.c[1]) - ho.hy, Math.abs(z - ho.c[2]) - ho.hz) : 1);                          // CORR-4 track-rod 50 (z) x 30 (y) hole
  note('N-MONO-OPEN', '§5.1/§5.8', 'Cockpit opening, pushrod slots and track-rod holes are cut exactly (triangles clipped along the stated implicit boundary); the skin is locally refined (4 mm rings/columns) only around the two rod openings. N_phi = 64 elsewhere.');
  return [{ name: 'skin', mesh: m, mat: 'paint', open: true }];
}

// ---------------------------------------------------------------------------
// §5.2 nose and front wing cascade
// ---------------------------------------------------------------------------
const planN = (() => { const [x0, z0] = S.FW_PLATE.p0, [x1, z1] = S.FW_PLATE.p1; const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  return { L, d: [dx / L, dz / L], nOut: [-dz / L, dx / L], x0, z0 }; })();
/** x of the endplate inner face at station z (plane through the plan line offset `thick` inboard) */
export const endplateInnerX = (z) => planN.x0 + (-S.FW_PLATE.thick - planN.nOut[1] * (z - planN.z0)) / planN.nOut[0];
const endplateOuterX = (z) => planN.x0 + (-planN.nOut[1] * (z - planN.z0)) / planN.nOut[0];

function airfoilUpperY(def, z) { // y of the upper (numerically higher) surface of a placed airfoil at station z
  const loop = nacaLoop(def.code, def.inverted !== false, 40);
  const placed = placeAirfoil(loop, def.LE[0], def.LE[1], def.C, def.alpha);
  // find all crossings of z; take max y
  let best = -Infinity;
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i], b = placed[(i + 1) % placed.length];
    if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) { const t = (z - a[0]) / (b[0] - a[0]); best = Math.max(best, a[1] + (b[1] - a[1]) * t); }
  }
  return best;
}

function buildNoseAndWing() {
  const parts = [];
  // ---- nose cone: closed superellipse loft + tip cap -----------------------
  const nPhi = 64;
  const zs = ringZs(S.NOSE_ST.map((s) => s.z), 10);
  const rows = zs.map((z) => ({ z, ...loftSection(S.NOSE_ST, z) }));
  const T = S.NOSE_TIP, J = 12;
  for (let j = 1; j < J; j++) {                                    // tip cap rings: zeta = 40 sin(t), k = cos(t)
    const t = (Math.PI / 2) * j / J; rows.push({ z: T.z0 + T.len * Math.sin(t), yc: T.yc, a: T.a * Math.cos(t), b: T.b * Math.cos(t), n: S.NOSE_ST[3].n });
  }
  const nose = new Mesh('nose_cone');
  const idx = addGrid(nose, rows.length, nPhi, (r, c) => { const s = rows[r]; const q = superPoint(s.a, s.b, s.n, TAU * c / nPhi); return [q[0], s.yc + q[1], s.z]; });
  stitchGrid(nose, idx, rows.length, nPhi, { wrap: true });          // increasing z => outward
  const tip = nose.v(0, T.yc, T.z0 + T.len);
  for (let c = 0; c < nPhi; c++) nose.tri(idx(rows.length - 1, c), idx(rows.length - 1, (c + 1) % nPhi), tip);
  const cr = nose.v(0, (S.NOSE_ST[0].yb + S.NOSE_ST[0].yt) / 2, S.NOSE_ST[0].z);   // rear cap (joint plane z = 350)
  for (let c = 0; c < nPhi; c++) nose.tri(cr, idx(0, (c + 1) % nPhi), idx(0, c));
  nose.orientManifold();
  parts.push({ name: 'nose_cone', mesh: nose, mat: 'paint' });
  note('N-NOSE-CAP', '§5.2', 'Tip cap uses the section half-axes (62k, 52.5k) with the exponent n=2.2 of the z=1135 station (spec gives only the half-axes).');

  // ---- wing elements --------------------------------------------------------
  const xEnd = (z) => Math.min(840, endplateInnerX(z));      // span end 840, trimmed at the slanted endplate inner face
  const mkEl = (key, def) => {
    const loop = nacaLoop(def.code, def.inverted !== false, 40);
    const poly = placeAirfoil(loop, def.LE[0], def.LE[1], def.C, def.alpha);
    return { poly, x0: def.x[0], def: def, key };
  };
  const neutral = mkEl('neutral', S.FW.neutral);
  parts.push({ name: 'fw_neutral', mesh: extrudeZYAlongX(neutral.poly, -250, 250, 'fw_neutral'), mat: 'paint' });
  for (const key of ['main', 'flap1', 'flap2', 'c1', 'c2']) {
    const e = mkEl(key, S.FW[key]);
    const xp = extrudeZYAlongX(e.poly, e.def.x[0], xEnd, `fw_${key}_xp`);
    parts.push({ name: `fw_${key}_xp`, mesh: xp, mat: 'paint' });
    parts.push({ name: `fw_${key}_xn`, mesh: mirrorPart(xp, `fw_${key}_xn`), mat: 'paint' });
  }
  note('A-FW-TRIM', '§5.2 / R11', 'Elements are extruded |x| 250..840 (cascades 620..840); x_end(z)=min(840, x_inner(z)). The endplate is now parallel to Z with its inner face at x=840 (spec correction 2), so every element tip meets the plate along its whole chord.');

  // ---- endplates ------------------------------------------------------------
  const P = S.FW_PLATE;
  const epOutline = [[0, P.y0], [0, P.y1], [planN.L, P.y1], [planN.L, P.yTE], [P.sChamfer, P.y0]];
  const frame = { o: [planN.x0, 0, planN.z0], U: [planN.d[0], 0, planN.d[1]], V: [0, 1, 0], W: [-planN.nOut[0], 0, -planN.nOut[1]] };
  const ep = extrudePolygon(epOutline, [], frame, P.thick, 'fw_endplate_xp');
  parts.push({ name: 'fw_endplate_xp', mesh: ep, mat: 'paint', decal: 'endplate' });
  parts.push({ name: 'fw_endplate_xn', mesh: mirrorPart(ep, 'fw_endplate_xn'), mat: 'paint', decal: 'endplate' });

  // ---- footplates: 60 wide inboard of the endplate (measured along the plate normal), y 75..80, z 700..985 ----
  const F = S.FW_FOOT;
  {
    const inn = (z, off) => [endplateInnerX(z) - off / planN.nOut[0], z];   // offset along -x scaled so the width is measured perpendicular
    const poly = [inn(F.z1, 0), inn(F.z0, 0), inn(F.z0, F.width), inn(F.z1, F.width)];
    const fp = extrudePolygon(poly.map(([x, z]) => [x, z]), [], { o: [0, F.y0, 0], U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] }, F.y1 - F.y0, 'fw_footplate_xp');
    parts.push({ name: 'fw_footplate_xp', mesh: fp, mat: 'paint' });
    parts.push({ name: 'fw_footplate_xn', mesh: mirrorPart(fp, 'fw_footplate_xn'), mat: 'paint' });
  }

  // ---- pylons: |x| 75..85, outline z 800..1000, neutral upper surface -> nose underside ----
  {
    const Y = S.FW_PYLON; const lower = [], upper = [];
    const noseBot = (z) => { const s = loftSection(S.NOSE_ST, z); const xm = (Y.x0 + Y.x1) / 2; return s.yc - s.b * Math.pow(1 - Math.pow(xm / s.a, s.n), 1 / s.n); };
    const neutralUp = (z) => (z > 985 ? 110 : airfoilUpperY({ ...S.FW.neutral, inverted: false }, z));
    for (let z = Y.z0; z <= Y.z1 + 1e-6; z += 5) { lower.push([z, neutralUp(z)]); upper.push([z, noseBot(z)]); }
    const poly = [...lower, ...upper.slice().reverse()];
    const py = plateZY(poly, Y.x0, Y.x1, 'fw_pylon_xp');
    parts.push({ name: 'fw_pylon_xp', mesh: py, mat: 'paint' });
    parts.push({ name: 'fw_pylon_xn', mesh: mirrorPart(py, 'fw_pylon_xn'), mat: 'paint' });
    note('A-PYLON', '§5.2', 'Pylon outline is not dimensioned beyond "z 800..1000, neutral-section upper surface (y≈127) to nose underside (y≈308)". Built as the region between the actual neutral-section upper surface (flat y=110 ahead of its LE at z=985) and the actual nose underside at |x|=80 (≈338 there, not 308, because the underside rises away from the centreline). Questions raised in handoff.');
  }

  // ---- cascade struts: two 6 mm plates centred at |x| = 620 and 835 ----------
  {
    const main = S.FW.main;
    const yMain = (z) => airfoilUpperY(main, z);
    const c1 = S.FW.c1, c2 = S.FW.c2;
    const te = (d) => { const a = d.alpha * DEG; return [d.LE[0] - d.C * Math.cos(a), d.LE[1] + d.C * Math.sin(a)]; };
    const c1TE = te(c1), c2TE = te(c2), mTE = te(main);
    const poly = [[830, yMain(830)], [c1.LE[0], c1.LE[1]], c1TE, [c2.LE[0], c2.LE[1]], c2TE, mTE];
    for (let z = mTE[0] + 8; z < 830; z += 8) poly.push([z, yMain(z)]);          // lower boundary along main-plane upper surface
    // order: A, C1LE, C1TE, C2LE, C2TE, mainTE, then points along main upper surface back toward z=830
    const ordered = [poly[0], poly[1], poly[2], poly[3], poly[4], poly[5], ...poly.slice(6)];
    for (const x of S.FW_STRUT.xs) {
      const h = S.FW_STRUT.thick / 2;
      const pl = plateZY(ordered, x - h, x + h, `fw_strut_${x}_xp`);
      parts.push({ name: `fw_strut_${x}_xp`, mesh: pl, mat: 'paint' });
      parts.push({ name: `fw_strut_${x}_xn`, mesh: mirrorPart(pl, `fw_strut_${x}_xn`), mat: 'paint' });
    }
    note('A-STRUT', '§5.2', 'Strut outline ("spanning the element chords, from the main-plane upper surface to C2") is not given as a polygon; built as the polygon through C1 LE, C1 TE, C2 LE, C2 TE, main-plane TE and back along the main-plane upper surface. Plates are centred on |x|=620 and 835 (thickness 6).');
  }
  return parts;
}

// ---------------------------------------------------------------------------
// §5.3 engine cover and shark fin
// ---------------------------------------------------------------------------
export function canopySection(z) {
  const g = (f) => stationInterp(S.COVER_ST, 'z', z, f);
  return { a: g('a'), ys: g('ys'), yb: g('yb'), yt: g('yt'), n: g('n') };
}
/** canopy cross-section polyline for station params: skirt bottom (right) -> roof phi 0..pi -> skirt bottom (left) */
export function canopyRow(sec, nRoof = 32) {
  const pts = [[sec.a, sec.yb]];
  for (let k = 0; k <= nRoof; k++) {
    const ph = Math.PI * k / nRoof;
    pts.push([sec.a * sgnPow(Math.cos(ph), 2 / sec.n), sec.ys + (sec.yt - sec.ys) * Math.pow(Math.abs(Math.sin(ph)), 2 / sec.n)]);
  }
  pts.push([-sec.a, sec.yb]);
  return pts;
}
function buildCover() {
  note('N-COVER', '§5.3', 'Engine cover is a single sheet (no wall thickness is given): roof superellipse + vertical skirts, open underneath, open tail at z=-3450; front face at z=-1250 closed except the 70x75 n=2.5 inlet hole. Shark fin is an 8 mm plate.');
  const parts = [];
  const zs = ringZs(S.COVER_ST.map((s) => s.z), 10);
  const m = new Mesh('canopy');
  const nRoof = 32;
  const rows = zs.map((z) => canopyRow(canopySection(z), nRoof));
  const nc = rows[0].length;
  const idx = addGrid(m, zs.length, nc, (r, c) => [rows[r][c][0], rows[r][c][1], zs[r]]);
  stitchGrid(m, idx, zs.length, nc, { wrap: false, flip: true });
  parts.push({ name: 'canopy', mesh: m, mat: 'paint', open: true });
  // airbox face at the front station with the inlet hole
  {
    const sec = canopySection(S.AIRBOX.zFace);
    const contour = canopyRow(sec, nRoof).map((p) => [p[0], p[1]]);
    // contour order: (a,yb) -> roof (a..-a) -> (-a,yb): a simple polygon (open underneath => closed by the straight bottom edge)
    const A = S.AIRBOX; const hole = [];
    const nH = 48;
    for (let k = 0; k < nH; k++) { const q = superPoint(A.hx, A.hy, A.p, TAU * k / nH); hole.push([q[0], A.yc + q[1]]); }
    const { pts, tris } = triangulate2D(contour, [hole]);
    const f = new Mesh('airbox_face');
    const ids = pts.map((p) => f.v(p[0], p[1], A.zFace));
    for (const t of tris) f.tri(ids[t[0]], ids[t[2]], ids[t[1]]);   // orientation fixed below
    // face the front (+z): ensure the first triangle's normal has +z
    const p = f.p, t0 = f.i; const ux = p[t0[1] * 3] - p[t0[0] * 3], uy = p[t0[1] * 3 + 1] - p[t0[0] * 3 + 1], wx = p[t0[2] * 3] - p[t0[0] * 3], wy = p[t0[2] * 3 + 1] - p[t0[0] * 3 + 1];
    if (ux * wy - uy * wx < 0) f.flip();
    parts.push({ name: 'airbox_face', mesh: f, mat: 'paint', open: true });
  }
  // shark fin
  {
    const Fn = S.FIN;
    const yTop = (z) => { const sec = canopySection(z); return sec.yt; };
    const stationZ = S.COVER_ST.map((s) => s.z).filter((z) => z < Fn.zFront && z > Fn.zRear);
    const lower = [[Fn.zFront, yTop(Fn.zFront)], ...stationZ.map((z) => [z, yTop(z)]), [Fn.zRear, yTop(Fn.zRear)]];
    const upper = [[Fn.zRear, Fn.yRear], [Fn.zKnee, Fn.yTop], [Fn.zFront, Fn.yTop]];
    const poly = [...lower, ...upper];
    const fin = plateZY(poly, -Fn.half, Fn.half, 'shark_fin');
    parts.push({ name: 'shark_fin', mesh: fin, mat: 'paint', decal: 'fin' });
    note('A-FIN', '§5.3', 'Fin lower edge = canopy centreline y_top(z) with vertices at each cover station; leading edge at z=-1350 is a 0.8 mm sliver (y_top(-1350)=949.2 to 950) exactly as the spec outline implies.');
  }
  return parts;
}

// ---------------------------------------------------------------------------
// §5.4 sidepod C-shell (x_p authored)
// ---------------------------------------------------------------------------
export function podSection(z) {
  const g = (f) => stationInterp(S.POD_ST, 'z', z, f);
  return { xi: g('xi'), Xo: g('Xo'), Yb: g('Yb'), Ym: g('Ym'), Yt: g('Yt') };
}
/** point on outer pod surface at (z, phi in [-pi/2, pi/2]) */
export function podPoint(z, phi) {
  const s = podSection(z); const up = phi >= 0; const n = up ? S.POD.nu : S.POD.nl;
  const B = up ? s.Yt - s.Ym : s.Ym - s.Yb;
  return [s.xi + (s.Xo - s.xi) * Math.pow(Math.max(0, Math.cos(phi)), 2 / n), s.Ym + B * sgnPow(Math.sin(phi), 2 / n), z];
}
function buildPod() {
  const zs = ringZs(S.POD_ST.map((s) => s.z), 10);
  const nPhi = 32;                                        // 32 segments over the half loop (= 64 per full loop)
  const phiAt = (c) => -Math.PI / 2 + Math.PI * c / nPhi;
  const nc = nPhi + 1;
  const outer = (r, c) => podPoint(zs[r], phiAt(c));
  // inward unit normal by finite differences of the parametric surface
  const normalAt = (r, c) => {
    const dz = 1.0, dp = 1e-3;
    const z = zs[r], ph = clamp(phiAt(c), -Math.PI / 2 + dp, Math.PI / 2 - dp);
    const pz1 = podPoint(Math.min(z + dz, zs[0] > zs[zs.length - 1] ? zs[0] : zs[zs.length - 1]), ph);
    const pz0 = podPoint(z, ph);
    const zOther = z - dz;
    const dPz = v3.sub(podPoint(clamp(z + dz, zs[zs.length - 1], zs[0]), ph), podPoint(clamp(z - dz, zs[zs.length - 1], zs[0]), ph));
    const dPp = v3.sub(podPoint(z, ph + dp), podPoint(z, ph - dp));
    void pz1; void pz0; void zOther;
    let n = v3.norm(v3.cross(dPp, dPz));
    // outward is +x at phi=0 (outer middle): make n point outward at (any) point by comparing with the direction from the section centre
    const s = podSection(z); const centre = [s.xi, s.Ym, z];
    const P = podPoint(z, ph); const outDir = v3.sub(P, centre);
    if (v3.dot(n, outDir) < 0) n = v3.mul(n, -1);
    return n;                                              // outward
  };
  const m = new Mesh('pod_shell');
  const o = addGrid(m, zs.length, nc, (r, c) => outer(r, c));
  const w = S.POD.wall;
  const inn = addGrid(m, zs.length, nc, (r, c) => { const P = outer(r, c), n = normalAt(r, c); return v3.madd(P, n, -w); });
  stitchGrid(m, o, zs.length, nc, { flip: true });         // z decreasing along rows
  stitchGrid(m, inn, zs.length, nc, { flip: false });
  // edge strips: inlet row, tail row, top edge (phi=+pi/2), bottom edge (phi=-pi/2)
  const R = zs.length;
  for (let c = 0; c < nc - 1; c++) { m.quad(o(0, c), o(0, c + 1), inn(0, c + 1), inn(0, c)); m.quad(o(R - 1, c + 1), o(R - 1, c), inn(R - 1, c), inn(R - 1, c + 1)); }
  for (let r = 0; r < R - 1; r++) { m.quad(o(r, 0), o(r + 1, 0), inn(r + 1, 0), inn(r, 0)); m.quad(o(r + 1, nc - 1), o(r, nc - 1), inn(r, nc - 1), inn(r + 1, nc - 1)); }
  m.orientManifold();
  // CORR-6 F3 foil: lower lobe (phi in [-pi/2, 0]) for z in [-2300, -2750], 0.5 mm outward of the outer surface; owned by the pod
  const f3 = new Mesh('foil_F3');
  const zs3 = ringZs([-2300, -2550, -2750], 10), n3 = 16;
  const f3i = addGrid(f3, zs3.length, n3 + 1, (r, c) => {
    const z = zs3[r], ph = -Math.PI / 2 + (Math.PI / 2) * c / n3;
    const phc = clamp(ph, -Math.PI / 2 + 1e-3, -1e-3);
    const P = podPoint(z, ph);
    const dPp = v3.sub(podPoint(z, phc + 1e-3), podPoint(z, phc - 1e-3));
    const dPz = v3.sub(podPoint(z + 1, phc), podPoint(z - 1, phc));
    let n = v3.norm(v3.cross(dPp, dPz)); const s = podSection(z);
    if (v3.dot(n, v3.sub(P, [s.xi, s.Ym, z])) < 0) n = v3.mul(n, -1);
    return v3.madd(P, n, 0.5);
  });
  stitchGrid(f3, f3i, zs3.length, n3 + 1, {});
  note('N-POD-WALL', '§5.4', 'Pod wall: outer surface = stated C-shell; inner surface offset 3 mm along the surface normal; the four open edges (inlet, tail, top, bottom) are closed with strips. "Lip radius 8" on a 3 mm wall is not modelled as a separate fillet (no consistent geometry given) — asked in handoff.');
  return [{ name: 'shell', mesh: m, mat: 'paint', decal: 'pod' }, { name: 'foil_F3', mesh: f3, mat: 'gold', open: true }];
}

// ---------------------------------------------------------------------------
// §5.5 radiator internals
// ---------------------------------------------------------------------------
export function radiatorFrame() {
  const R = S.RAD, psi = R.psiDeg * DEG, lam = R.lamDeg * DEG;
  const w0 = [Math.cos(psi), 0, -Math.sin(psi)];
  const v = v3.add(v3.mul([0, 1, 0], Math.cos(lam)), v3.mul(w0, Math.sin(lam)));
  const w = v3.sub(v3.mul(w0, Math.cos(lam)), v3.mul([0, 1, 0], Math.sin(lam)));
  const n = v3.cross(w, v);
  return { w, v, n, C: R.C };
}
function buildRadiator() {
  note('N-RAD', '§5.5', 'Radiator = core box 50x300x560 + two end-tank boxes 50x300x30, oriented by the stated yaw 20° / lean 12° basis (det +1). No fins/pipework modelled.');
  const { w, v, n, C } = radiatorFrame();
  const R = S.RAD, hx = R.thick / 2, hy = R.height / 2;
  const core = orientedBox(C, w, v, n, [hx, hy, R.coreLen / 2], 'rad_core');
  const off = R.coreLen / 2 + R.tankLen / 2;
  const t1 = orientedBox(v3.madd(C, n, off), w, v, n, [hx, hy, R.tankLen / 2], 'rad_tank_front');
  const t2 = orientedBox(v3.madd(C, n, -off), w, v, n, [hx, hy, R.tankLen / 2], 'rad_tank_rear');
  return [{ name: 'core', mesh: core, mat: 'radiator' }, { name: 'tank_front', mesh: t1, mat: 'alloy' }, { name: 'tank_rear', mesh: t2, mat: 'alloy' }];
}

// ---------------------------------------------------------------------------
// §5.6 floor and blown diffuser
// ---------------------------------------------------------------------------
export const rho = (s) => 2 * s * s - s * s * s;
export function diffuserRoofY(x, z) {      // lower (airflow) surface y_r(x,z) — §5.6
  const s = clamp((K.Z_RA - z) / S.FLOOR.diffLen, 0, 1);
  const ax = Math.abs(x); const y0 = ax <= 150 ? 0 : 50;
  return y0 + (K.HD - S.FLOOR.roofThick - y0) * rho(s);   // CORR-1: panel top y_r + 8 <= H_D
}
function heightFieldSlab(xs, zs, yFn, thick, name) {
  const m = new Mesh(name); const nx = xs.length, nz = zs.length;
  const lo = addGrid(m, nz, nx, (r, c) => [xs[c], yFn(xs[c], zs[r]), zs[r]]);
  const hi = addGrid(m, nz, nx, (r, c) => [xs[c], yFn(xs[c], zs[r]) + thick, zs[r]]);
  stitchGrid(m, lo, nz, nx, {}); stitchGrid(m, hi, nz, nx, { flip: true });
  for (let c = 0; c < nx - 1; c++) { m.quad(lo(0, c), lo(0, c + 1), hi(0, c + 1), hi(0, c)); m.quad(lo(nz - 1, c + 1), lo(nz - 1, c), hi(nz - 1, c), hi(nz - 1, c + 1)); }
  for (let r = 0; r < nz - 1; r++) { m.quad(lo(r + 1, 0), lo(r, 0), hi(r, 0), hi(r + 1, 0)); m.quad(lo(r, nx - 1), lo(r + 1, nx - 1), hi(r + 1, nx - 1), hi(r, nx - 1)); }
  return m.orientManifold();
}
export function exhaustPlanProjection(nPts = 40) {   // plan (x,z) of the exhaust centreline for u in [0.35, 1]
  const P = S.EXH.P; const out = [];
  for (let k = 0; k <= nPts; k++) { const u = S.FLOOR.foil.bandU0 + (1 - S.FLOOR.foil.bandU0) * k / nPts; const b = bezier(P[0], P[1], P[2], P[3], u); out.push([b[0], b[2]]); }
  return out;
}
function buildFloor() {
  const F = S.FLOOR, parts = [];
  const zStart = K.Z_FA - 330;                             // -340.37 (true axle datum)
  const outline = F.outline(zStart, K.Z_RA);               // (z, x_f)
  // right-half plan contour in (x, z)
  const contour = [[150, zStart], ...outline.map(([z, x]) => [x, z]), [150, K.Z_RA]];
  // trough + slot hole polygon
  const T = F.trough, hw = T.w / 2;
  const path = T.path.map((p) => [p[0], p[1]]);
  // clip the trough path at z = slot.z[1] (=-3180) along the last segment
  const zc = F.slot.z[1];
  const [p1, p2] = [path[1], path[2]];
  const tc = (zc - p1[1]) / (p2[1] - p1[1]);
  const pEnd = [p1[0] + (p2[0] - p1[0]) * tc, zc];
  const trPath = [path[0], path[1], pEnd];
  const { left, right } = offsetPolyline(trPath, hw);            // left = +x side for a -z heading
  const trough = [...left, ...right.slice().reverse()];
  const slot = [[F.slot.x[0], F.slot.z[1]], [F.slot.x[0], F.slot.z[0]], [F.slot.x[1], F.slot.z[0]], [F.slot.x[1], F.slot.z[1]]];
  // hole = right boundary (E0..end) -> slot corners -> left boundary (end..E0)
  const hole = [...right, slot[0], slot[1], slot[2], slot[3], ...left.slice().reverse()];
  const frameY = (y) => ({ o: [0, y, 0], U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] });
  const panel = extrudePolygon(contour, [hole], frameY(F.stepY0), F.stepY1 - F.stepY0, 'step_panel_xp');
  parts.push({ name: 'step_panel_xp', mesh: panel, mat: 'carbon' });
  parts.push({ name: 'step_panel_xn', mesh: mirrorPart(panel, 'step_panel_xn'), mat: 'carbon' });
  const troughFloor = extrudePolygon(trough, [], frameY(F.stepY0), (F.stepY1 - F.trough.depth) - F.stepY0, 'trough_floor_xp');
  parts.push({ name: 'trough_floor_xp', mesh: troughFloor, mat: 'carbon' });
  parts.push({ name: 'trough_floor_xn', mesh: mirrorPart(troughFloor, 'trough_floor_xn'), mat: 'carbon' });

  // reference-strip walls |x| = 150 (centred), y 0..50
  const wall = axisBox(150 - F.wallThick / 2, 150 + F.wallThick / 2, F.wallY[0], F.wallY[1], K.Z_RA, zStart, 'strip_wall_xp');
  parts.push({ name: 'strip_wall_xp', mesh: wall, mat: 'carbon' });
  parts.push({ name: 'strip_wall_xn', mesh: mirrorPart(wall, 'strip_wall_xn'), mat: 'carbon' });
  // 10 mm top plate behind z=-2000, y 50..60, |x| <= 150
  parts.push({ name: 'strip_top_plate', mesh: axisBox(-150, 150, F.stepY0, F.stepY1, K.Z_RA, F.topPlateZ, 'strip_top_plate'), mat: 'carbon' });

  // diffuser: roof slabs (central, outer xp, outer xn) + fences + sidewalls
  const z0 = K.Z_RA, z1 = K.Z_RA - F.diffLen;
  const nz = 36;
  const zsD = Array.from({ length: nz + 1 }, (_, k) => z0 + (z1 - z0) * k / nz);
  const xsC = Array.from({ length: 13 }, (_, k) => -150 + 300 * k / 12);
  const xsO = Array.from({ length: 15 }, (_, k) => 150 + (F.diffHalf - 150) * k / 14);
  parts.push({ name: 'diffuser_roof_c', mesh: heightFieldSlab(xsC, zsD, diffuserRoofY, F.roofThick, 'diffuser_roof_c'), mat: 'carbon' });
  const roofO = heightFieldSlab(xsO, zsD, (x, z) => diffuserRoofY(Math.max(x, 150.0001), z), F.roofThick, 'diffuser_roof_xp');   // outer side of the 150 mm step
  parts.push({ name: 'diffuser_roof_xp', mesh: roofO, mat: 'carbon' });
  parts.push({ name: 'diffuser_roof_xn', mesh: mirrorPart(roofO, 'diffuser_roof_xn'), mat: 'carbon' });
  const fenceAt = (xc, hw2, name) => {
    const poly = []; const top = [];
    for (let k = 0; k <= nz; k++) { const z = zsD[k]; const xr = Math.max(Math.abs(xc), 150.0001); top.push([z, diffuserRoofY(xr, z)]); }
    poly.push([z0, 0], ...top.map(([z, y]) => [z, y]), [z1, 0]);
    // polygon: bottom edge z0 -> z1 at y=0, then top edge back
    const bottom = [[z0, 0], [z1, 0]];
    const ring = [...bottom, ...top.slice().reverse()];
    return plateZY(ring, xc - hw2, xc + hw2, name);
  };
  const ft = F.fenceThick / 2;
  for (const xc of F.fenceX) {
    const f = fenceAt(xc, ft, `fence_${xc}_xp`);
    parts.push({ name: `fence_${xc}_xp`, mesh: f, mat: 'carbon' });
    parts.push({ name: `fence_${xc}_xn`, mesh: mirrorPart(f, `fence_${xc}_xn`), mat: 'carbon' });
  }
  const sw = fenceAt(F.sideX - ft, ft, 'sidewall_xp');
  parts.push({ name: 'sidewall_xp', mesh: sw, mat: 'carbon' });
  parts.push({ name: 'sidewall_xn', mesh: mirrorPart(sw, 'sidewall_xn'), mat: 'carbon' });
  note('N-FLOOR-THICK', '§5.6', 'Reference-strip wall thickness is not given; 6 mm (the fence thickness) used, centred on |x|=150. Fences are centred on |x|=150/320; the outer sidewall sits inside the |x|<=490 limit (x 484..490).');
  note('A-DIFF-TOP', '§5.6 / R9', 'R9 caps the diffuser panel top (spec correction 1): airflow surface y_r = y0 + (H_D − t_D − y0)·ρ(s) reaches 117, the 8 mm panel offset upward tops out at exactly 125 at the exit.');

  // gold foil F1 band + F2 fan (raster patches 0.5 above the panel top)
  const foilY = F.stepY1 + F.foil.lift;
  const proj = exhaustPlanProjection(60);
  const distToPoly = (x, z) => { let d = Infinity; for (let i = 0; i < proj.length - 1; i++) { const a = proj[i], b = proj[i + 1]; const abx = b[0] - a[0], abz = b[1] - a[1]; const t = clamp(((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz), 0, 1); d = Math.min(d, Math.hypot(x - a[0] - abx * t, z - a[1] - abz * t)); } return d; };
  const inPanel = (x, z) => x >= 150 && pointInPoly([x, z], contour) && !pointInPoly([x, z], hole);
  const f1 = rasterPatch((x, z) => inPanel(x, z) && distToPoly(x, z) <= F.foil.band, 380, 700, -3000, -2650, 2.0, foilY, 'foil_F1_xp');
  const ap = F.foil.fanApex, dir = F.foil.fanDir, cosH = Math.cos(F.foil.fanHalfDeg * DEG);
  const f2 = rasterPatch((x, z) => {
    if (!inPanel(x, z)) return false;
    const dx = x - ap[0], dz = z - ap[1], r = Math.hypot(dx, dz); if (r > F.foil.fanR) return false; if (r < 1e-9) return true;
    return (dx * dir[0] + dz * dir[1]) / r >= cosH;
  }, 560, 740, -3080, -2800, 2.0, foilY + 0.0, 'foil_F2_xp');
  parts.push({ name: 'foil_F1_xp', mesh: f1, mat: 'gold', open: true });
  parts.push({ name: 'foil_F1_xn', mesh: mirrorPart(f1, 'foil_F1_xn'), mat: 'gold', open: true });
  parts.push({ name: 'foil_F2_xp', mesh: f2, mat: 'gold', open: true });
  parts.push({ name: 'foil_F2_xn', mesh: mirrorPart(f2, 'foil_F2_xn'), mat: 'gold', open: true });
  note('A-FOIL-F3', '§5.4 / §5.6', 'F1, F2 (§5.6) are floor-owned; F3 is built with the pod (§5.4, spec correction 6: lower lobe, z −2300..−2750, 0.5 mm outward); F4 with the exhaust (§5.7).');
  note('N-FOIL-RASTER', '§5.6', 'Foil patches F1/F2 are built as a 2 mm raster of the stated plan regions clipped to the outline (stair-stepped edge, 2 mm).');
  return parts;
}

// ---------------------------------------------------------------------------
// §5.7 exhaust (x_p authored)
// ---------------------------------------------------------------------------
export function exhaustArcLength(n = 400) {
  const P = S.EXH.P; let L = 0, prev = bezier(P[0], P[1], P[2], P[3], 0);
  const Lu = [0];
  for (let k = 1; k <= n; k++) { const b = bezier(P[0], P[1], P[2], P[3], k / n); L += v3.len(v3.sub(b, prev)); Lu.push(L); prev = b; }
  return { L, Lu, n };
}
function buildExhaust() {
  note('N-EXH', '§5.7', 'Exhaust modelled as a single-sheet D-section tube (1 mm wall not modelled), optional collector INCLUDED (the spec bbox and the 32.6 mm expectation include it), F4 sleeve = last 250 mm of arc length grown 2 mm radially. Pipe exit left open.');
  const E = S.EXH, [P0, P1, P2, P3] = E.P, parts = [];
  const pipe = bezierSweepD(P0, P1, P2, P3, { a: E.a, bt: E.bt, bb: E.bb, nU: 64, nA: 48, name: 'exhaust_pipe' });
  parts.push({ name: 'pipe', mesh: pipe, mat: 'inconel', open: true });
  // optional collector (included: the spec bbox and the 32.6 mm expectation include it)
  {
    const t0 = v3.norm(bezierD(P0, P1, P2, P3, 0));
    const fr = bezierFrame(P0, P1, P2, P3, 0);
    const c0 = v3.madd(P0, t0, -E.collectorBack);
    const nU = 12, nA = 48; const m = new Mesh('exhaust_collector');
    const idx = addGrid(m, nU + 1, nA, (r, c) => {
      const u = r / nU, al = TAU * c / nA;
      const circ = v3.add(c0, v3.add(v3.mul(fr.m, E.collectorR * Math.cos(al)), v3.mul(fr.n, E.collectorR * Math.sin(al))));
      const [dm, dn] = dSection(al, E.a, E.bt, E.bb);
      const dpt = v3.add(P0, v3.add(v3.mul(fr.m, dm), v3.mul(fr.n, dn)));
      return v3.lerp(circ, dpt, u);
    });
    stitchGrid(m, idx, nU + 1, nA, { wrap: true });
    parts.push({ name: 'collector', mesh: m, mat: 'inconel', open: true });
  }
  // F4 foil sleeve: last 250 mm of arc length, +2 mm offset
  {
    const { L, Lu, n } = exhaustArcLength(800);
    const target = L - E.sleeveLen; let k = 0; while (k < n && Lu[k] < target) k++;
    const u0 = k / n;
    const sl = bezierSweepD(P0, P1, P2, P3, { a: E.a, bt: E.bt, bb: E.bb, nU: 24, nA: 48, u0, u1: 1, offset: E.sleeveOff, name: 'exhaust_sleeve_F4' });
    parts.push({ name: 'sleeve_F4', mesh: sl, mat: 'gold', open: true });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// §5.8 / §5.9 suspension (x_p authored)
// ---------------------------------------------------------------------------
function buildFrontSuspension() {
  note('N-SUSP', '§5.8/§5.9', 'Members are built from hardpoint to hardpoint with flat end caps (60x20, 40x16, 36x14 sections). The "clevis brackets <= 35 mm", free-standing rear pickups, rockers and dampers have no dimensions and are NOT modelled.');
  const H = S.FSUS, parts = [];
  const add = (name, A, B, sec) => parts.push({ name, mesh: sweptMember(A, B, sec.C, sec.tau, name), mat: 'susp', member: { A, B, ...sec } });
  add('uw_front_leg', H.UBJ, H.UF, H.wb); add('uw_rear_leg', H.UBJ, H.UR, H.wb);
  add('lw_front_leg', H.LBJ, H.LF, H.wb); add('lw_rear_leg', H.LBJ, H.LR, H.wb);
  add('pushrod', H.PRo, H.PRi, H.push); add('trackrod', H.TRo, H.TRi, H.track);
  return parts;
}
function buildRearSuspension() {
  const H = S.RSUS, parts = [];
  const add = (name, A, B, sec) => parts.push({ name, mesh: sweptMember(A, B, sec.C, sec.tau, name), mat: 'susp', member: { A, B, ...sec } });
  add('uw_front_leg', H.UBJ, H.UF, H.wb); add('uw_rear_leg', H.UBJ, H.UR, H.wb);
  add('lw_front_leg', H.LBJ, H.LF, H.wb); add('lw_rear_leg', H.LBJ, H.LR, H.wb);
  add('pullrod', H.PLo, H.PLi, H.pull); add('toelink', H.TLo, H.TLi, H.toe);
  return parts;
}

// ---------------------------------------------------------------------------
// §5.10 wheel assembly (x_p authored). `kind` = 'front' | 'rear'
// ---------------------------------------------------------------------------
function parallelepiped(o, e1, e2, e3, name) {
  const m = new Mesh(name); const ids = [];
  for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) ids.push(m.v(...v3.add(o, v3.add(v3.mul(e1, a), v3.add(v3.mul(e2, b), v3.mul(e3, c))))));
  const I = (a, b, c) => ids[a * 4 + b * 2 + c];
  m.quad(I(0, 0, 0), I(0, 0, 1), I(0, 1, 1), I(0, 1, 0)); m.quad(I(1, 0, 0), I(1, 1, 0), I(1, 1, 1), I(1, 0, 1));
  m.quad(I(0, 0, 0), I(1, 0, 0), I(1, 0, 1), I(0, 0, 1)); m.quad(I(0, 1, 0), I(0, 1, 1), I(1, 1, 1), I(1, 1, 0));
  m.quad(I(0, 0, 0), I(0, 1, 0), I(1, 1, 0), I(1, 0, 0)); m.quad(I(0, 0, 1), I(1, 0, 1), I(1, 1, 1), I(0, 1, 1));
  return m.orientManifold();
}
function buildWheel(kind) {
  const W = S.WHEEL, parts = [];
  const isF = kind === 'front';
  const wc = isF ? [K.Tf / 2, K.Y_FA, K.Z_FA] : [K.Tr / 2, K.Y_RA, K.Z_RA];
  const spec = isF ? W.front : W.rear;
  // tyre
  parts.push({ name: 'tyre', mesh: tyreTorus(wc, spec.W, K.Rw, K.Rrim, { nPhi: 64, nAlpha: 48, name: 'tyre', phase: Math.PI - K.theta }), mat: 'tyre', decal: 'tyre' });
  // rim: barrel (160..165) with flanges to 177 at wc.x +- rimW/2 (flange axial thickness not given -> 5 mm assumed)
  const hw = spec.rimW / 2, tf = 5;
  const prof = [[-hw, W.barrelIn], [hw, W.barrelIn], [hw, W.flangeR], [hw - tf, W.flangeR], [hw - tf, W.barrelOut], [-hw + tf, W.barrelOut], [-hw + tf, W.flangeR], [-hw, W.flangeR]];
  parts.push({ name: 'rim', mesh: lathe(prof, wc, 96, 'rim'), mat: 'alloy' });
  // spokes: outboard dish, 10 spokes 18 wide, r 40..160, plane 35 inboard of the outer flange (thickness assumed 10)
  {
    const sp = W.spokes, xPlane = wc[0] + hw - sp.inboardOfFlange, th = 10;
    const m = new Mesh('spokes');
    for (let k = 0; k < sp.n; k++) {
      const a = TAU * k / sp.n; const rv = [0, Math.cos(a), Math.sin(a)], tv = [0, -Math.sin(a), Math.cos(a)];
      const c = v3.add([xPlane, wc[1], wc[2]], v3.mul(rv, (sp.r0 + sp.r1) / 2));
      m.append(orientedBox(c, [1, 0, 0], rv, tv, [th / 2, (sp.r1 - sp.r0) / 2, sp.w / 2]));
    }
    parts.push({ name: 'spokes', mesh: m, mat: 'alloy' });
  }
  // brake disc
  {
    const D = W.disc, xd = wc[0] + spec.discDx;
    const prof2 = [[-D.t / 2, D.r0], [D.t / 2, D.r0], [D.t / 2, D.r1], [-D.t / 2, D.r1]];
    parts.push({ name: 'disc', mesh: lathe(prof2, [xd, wc[1], wc[2]], 64, 'disc'), mat: 'disc' });
    // caliper block at the disc's rear-upper 45 deg position
    const Cl = W.caliper, ang = Cl.angDeg * DEG;
    const rv = [0, Math.cos(ang), -Math.sin(ang)], tv = [0, Math.sin(ang), Math.cos(ang)];
    const rc = (Cl.r0 + Cl.r1) / 2;
    const c = v3.add([xd, wc[1], wc[2]], v3.mul(rv, rc));
    parts.push({ name: 'caliper', mesh: orientedBox(c, [1, 0, 0], rv, tv, [Cl.x / 2, Cl.rad / 2, Cl.tang / 2], 'caliper'), mat: 'caliper' });
  }
  // upright slab + arm
  {
    const H = isF ? S.FSUS : S.RSUS; const U = W.upright;
    const LBJ = H.LBJ, UBJ = H.UBJ;
    const kv = v3.sub(UBJ, LBJ); const Lk = v3.len(kv); const k = v3.norm(kv);
    let nu = v3.norm(v3.cross(k, [0, 0, 1]));                    // normal of the plane through LBJ, UBJ parallel to Z
    if (nu[0] < 0) nu = v3.mul(nu, -1);                          // outboard (+x)
    const origin = v3.add(v3.add(v3.madd(LBJ, k, -U.beyond), v3.mul(nu, U.offset)), [0, 0, -U.zWidth / 2]);
    const slab = parallelepiped(origin, v3.mul(k, Lk + 2 * U.beyond), [0, 0, U.zWidth], v3.mul(nu, U.thick), 'upright');
    parts.push({ name: 'upright', mesh: slab, mat: 'susp' });
    // steering / toe arm: bar from the slab edge to the track-rod / toe-link outer node, material at x >= x_joint + 5
    const node = isF ? H.TRo : H.TLo;
    const s = (node[1] - LBJ[1]) / k[1]; const onLine = v3.madd(LBJ, k, s);
    const zEdge = isF ? onLine[2] + U.zWidth / 2 : onLine[2] - U.zWidth / 2;
    const zFar = isF ? node[2] + 10 : node[2] - 10;
    const x0 = node[0] + U.offset;
    const arm = axisBox(x0, x0 + 20, node[1] - 10, node[1] + 10, Math.min(zEdge, zFar), Math.max(zEdge, zFar), 'steer_arm');
    parts.push({ name: isF ? 'steering_arm' : 'toe_arm', mesh: arm, mat: 'susp' });
  }
  note('N-WHEEL', '§5.10', 'Not dimensioned in the spec and therefore assumed (all intra-body, visual only): rim flange axial thickness 5 mm (= barrel wall), spoke thickness 10 mm, steering/toe arm 20x20 mm, no hub body. Upright slab built as the parallelepiped (kingpin axis x Z-width x normal) exactly as described; caliper block built literally with r in [95,165] although the barrel inner radius is 160 (accepted as proxy geometry: intra-body, hidden inside the tyre — spec correction C8).');
  return parts;
}

// ---------------------------------------------------------------------------
// §5.11 rear wing and DRS
// ---------------------------------------------------------------------------
export function rwElementPoly(def) { return placeAirfoil(nacaLoop(def.code, true, 40), def.LE[0], def.LE[1], def.C, def.alpha); }
function buildRearWing() {
  const R = S.RW, parts = [];
  const main = extrudeZYAlongX(rwElementPoly(R.main), -R.half, R.half, 'rw_main');
  const flap = extrudeZYAlongX(rwElementPoly(R.flap), -R.half, R.half, 'rw_flap');
  const beam = extrudeZYAlongX(rwElementPoly(R.beam), -R.half, R.half, 'rw_beam');
  parts.push({ name: 'main_plane', mesh: main, mat: 'paint' });
  parts.push({ name: 'drs_flap', mesh: flap, mat: 'paint', drs: true });
  parts.push({ name: 'beam_wing', mesh: beam, mat: 'paint' });
  const ep = plateZY(R.plate.outline, R.plate.x[0], R.plate.x[1], 'rw_endplate_xp');
  parts.push({ name: 'endplate_xp', mesh: ep, mat: 'paint', decal: 'rwplate' });
  parts.push({ name: 'endplate_xn', mesh: mirrorPart(ep, 'endplate_xn'), mat: 'paint', decal: 'rwplate' });
  // central pylon: from beam-wing top surface to main-plane underside (z -3720..-3600)
  {
    const P = R.pylon; const zs = []; for (let z = P.z[1]; z >= P.z[0] - 1e-6; z -= 5) zs.push(z);   // -3600 .. -3720
    const beamTop = (z) => {
      const poly = rwElementPoly(R.beam); let best = -Infinity;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) { const t = (z - a[0]) / (b[0] - a[0]); best = Math.max(best, a[1] + (b[1] - a[1]) * t); } }
      return best === -Infinity ? null : best;
    };
    const mainBot = (z) => {
      const poly = rwElementPoly(R.main); let best = Infinity;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) { const t = (z - a[0]) / (b[0] - a[0]); best = Math.min(best, a[1] + (b[1] - a[1]) * t); } }
      return best;
    };
    const teBeam = R.beam.LE[1] + R.beam.C * Math.sin(R.beam.alpha * DEG);
    const lower = zs.map((z) => [z, beamTop(z) ?? teBeam]);
    const upper = zs.map((z) => [z, mainBot(z)]);
    const poly = [...lower, ...upper.slice().reverse()];
    parts.push({ name: 'pylon', mesh: plateZY(poly, P.x[0], P.x[1], 'rw_pylon'), mat: 'paint' });
    note('A-RW-PYLON', '§5.11', 'Pylon z range (-3720..-3600) is longer than the beam wing (TE at z=-3705.2); behind that the lower edge is held flat at the beam-wing TE height. Plate outline otherwise follows beam-wing top and main-plane underside.');
  }
  return parts;
}
/** DRS pivot (z,y) = flap LE + 0.85 * 170 * c-hat, c-hat = (-cos a, +sin a) */
export function drsPivot() {
  const f = S.RW.flap, a = f.alpha * DEG;
  return [f.LE[0] + S.RW.drsPivotFrac * f.C * -Math.cos(a), f.LE[1] + S.RW.drsPivotFrac * f.C * Math.sin(a)];
}

// ---------------------------------------------------------------------------
// §5.12 plank
// ---------------------------------------------------------------------------
function buildPlank() {
  const P = S.PLANK, zF = K.Z_FA - 330, zR = K.Z_RA;
  // body: extrusion along X of the side outline with the 10x10 leading underside chamfer; holes cut with earcut caps
  const m = new Mesh('plank');
  const [y0, y1] = P.y;
  const nH = 32, r = P.holeD / 2;
  // top (y1) and bottom (y0) faces with holes: polygon in (x,z)
  const zB0 = zF - P.chamfer;                            // bottom face starts 10 behind the front (chamfer)
  const topC = [[-P.half, zF], [P.half, zF], [P.half, zR], [-P.half, zR]];
  const botC = [[-P.half, zB0], [P.half, zB0], [P.half, zR], [-P.half, zR]];
  const holes = P.holeZ.map((z) => Array.from({ length: nH }, (_, k) => [r * Math.cos(TAU * k / nH), z + r * Math.sin(TAU * k / nH)]));
  const mk = (contour, y, faceUp) => {
    const { pts, tris } = triangulate2D(contour, holes);
    const ids = pts.map((p) => m.v(p[0], y, p[1]));
    for (const t of tris) { if (faceUp) m.tri(ids[t[0]], ids[t[1]], ids[t[2]]); else m.tri(ids[t[0]], ids[t[2]], ids[t[1]]); }
    return { ids, n: contour.length };
  };
  const top = mk(topC, y1, true), bot = mk(botC, y0, true);
  // sides: use shared vertices where rings coincide -> build with fresh vertices for walls
  const wall = (a, b, ya, yb, za, zb) => {
    const A0 = m.v(a[0], ya, a[1]), A1 = m.v(b[0], ya, b[1]), B1 = m.v(b[0], yb, b[1]), B0 = m.v(a[0], yb, a[1]);
    m.quad(A0, A1, B1, B0);
  };
  void wall;
  // side walls (+x, -x), rear (z=zR), front chamfer (slope)
  const quadV = (p0, p1, p2, p3) => { const a = m.v(...p0), b = m.v(...p1), c = m.v(...p2), d = m.v(...p3); m.quad(a, b, c, d); };
  quadV([P.half, y0, zB0], [P.half, y0, zR], [P.half, y1, zR], [P.half, y1, zF]);            // +x side (trapezoid via two tris)
  quadV([-P.half, y0, zB0], [-P.half, y1, zF], [-P.half, y1, zR], [-P.half, y0, zR]);       // -x side
  quadV([-P.half, y0, zR], [-P.half, y1, zR], [P.half, y1, zR], [P.half, y0, zR]);           // rear face
  quadV([-P.half, y0, zB0], [P.half, y0, zB0], [P.half, y1, zF], [-P.half, y1, zF]);        // chamfer
  // hole walls
  for (const z of P.holeZ) {
    for (let k = 0; k < nH; k++) {
      const a0 = TAU * k / nH, a1 = TAU * (k + 1) / nH;
      quadV([r * Math.cos(a0), y0, z + r * Math.sin(a0)], [r * Math.cos(a0), y1, z + r * Math.sin(a0)], [r * Math.cos(a1), y1, z + r * Math.sin(a1)], [r * Math.cos(a1), y0, z + r * Math.sin(a1)]);
    }
  }
  void top; void bot;
  // vertices of walls are not welded to the caps (separate vertex sets) -> orient each coherently by volume per whole mesh is not reliable;
  // therefore rebuild welded: weld by position then orientManifold.
  const welded = weld(m, 1e-6);
  welded.orientManifold();
  note('N-PLANK', '§5.12', 'Plank built as a 300x10 box with the 10x10 leading underside chamfer (removes the full 10 mm front face; wedge-shaped nose) and six Ø50 through-holes at x=0, z=-700..-3100. The spec volume/mass (11.4 kg) ignores the chamfer.');
  return [{ name: 'plank', mesh: welded, mat: 'carbonDark' }];
}
/** merge coincident vertices */
export function weld(m, eps = 1e-6) {
  const map = new Map(); const out = new Mesh(m.name); const remap = new Int32Array(m.nv);
  const key = (x, y, z) => `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
  for (let i = 0; i < m.nv; i++) {
    const k = key(m.p[3 * i], m.p[3 * i + 1], m.p[3 * i + 2]);
    let id = map.get(k); if (id === undefined) { id = out.v(m.p[3 * i], m.p[3 * i + 1], m.p[3 * i + 2]); map.set(k, id); }
    remap[i] = id;
  }
  for (let t = 0; t < m.i.length; t += 3) { const a = remap[m.i[t]], b = remap[m.i[t + 1]], c = remap[m.i[t + 2]]; if (a !== b && b !== c && a !== c) out.tri(a, b, c); }
  return out;
}

function buildGearboxProxy() {
  const G = S.GEARBOX;
  return [{ name: 'gearbox', mesh: axisBox(G.x[0], G.x[1], G.y[0], G.y[1], G.z[0], G.z[1], 'gearbox_proxy'), mat: 'carbonDark' }];
}

// ============================================================================
// Model assembly
// ============================================================================
const CTRL = {}; // stage metadata
export function buildModel({ withGearbox = true } = {}) {
  const parts = {
    monocoque: buildMonocoque(), nose: buildNoseAndWing(), cover: buildCover(), pod: buildPod(), rad: buildRadiator(),
    floor: buildFloor(), exhaust: buildExhaust(), fsus: buildFrontSuspension(), rsus: buildRearSuspension(),
    wheelF: buildWheel('front'), wheelR: buildWheel('rear'), rw: buildRearWing(), plank: buildPlank(),
  };
  const dBof = (dW) => [dW[0], K.c * dW[1] + K.s * dW[2], -K.s * dW[1] + K.c * dW[2]];   // d_B = R_x(-theta) d_W
  const bodies = [];
  const push = (id, base, side, ps, massKey, expKey, extra = {}) => {
    const ex = S.EXPLODE.find((e) => e.body === expKey);
    const massRec = S.MASS[massKey];
    const dWp = ex.dW; const dW = side < 0 ? [-dWp[0], dWp[1], dWp[2]] : dWp;
    const comP = massRec.com; const com = side < 0 ? [-comP[0], comP[1], comP[2]] : comP;
    bodies.push({ id, base, side, parts: ps, mass: massRec.m, com, dW, dB: dBof(dW), win: ex.win, stage: ex.stage, mirror: side < 0, ...extra });
  };
  push('monocoque_survival_cell', 'monocoque_survival_cell', 0, parts.monocoque, 'monocoque_survival_cell', 'monocoque_survival_cell');
  push('nose_and_front_wing_cascade', 'nose_and_front_wing_cascade', 0, parts.nose, 'nose_and_front_wing_cascade', 'nose_and_front_wing_cascade');
  push('engine_cover_and_sharkfin', 'engine_cover_and_sharkfin', 0, parts.cover, 'engine_cover_and_sharkfin', 'engine_cover_and_sharkfin');
  push('sidepod_pods_xp', 'sidepod_pods', +1, parts.pod, 'sidepod_pods', 'sidepod_pods');
  push('sidepod_pods_xn', 'sidepod_pods', -1, parts.pod, 'sidepod_pods', 'sidepod_pods');
  push('radiator_internals_xp', 'radiator_internals', +1, parts.rad, 'radiator_internals', 'radiator_internals');
  push('radiator_internals_xn', 'radiator_internals', -1, parts.rad, 'radiator_internals', 'radiator_internals');
  push('floor_and_blown_diffuser', 'floor_and_blown_diffuser', 0, parts.floor, 'floor_and_blown_diffuser', 'floor_and_blown_diffuser');
  push('exhaust_system_xp', 'exhaust_system', +1, parts.exhaust, 'exhaust_system', 'exhaust_system');
  push('exhaust_system_xn', 'exhaust_system', -1, parts.exhaust, 'exhaust_system', 'exhaust_system');
  push('front_suspension_pushrod_xp', 'front_suspension_pushrod', +1, parts.fsus, 'front_suspension_pushrod', 'front_suspension_pushrod');
  push('front_suspension_pushrod_xn', 'front_suspension_pushrod', -1, parts.fsus, 'front_suspension_pushrod', 'front_suspension_pushrod');
  push('rear_suspension_pullrod_xp', 'rear_suspension_pullrod', +1, parts.rsus, 'rear_suspension_pullrod', 'rear_suspension_pullrod');
  push('rear_suspension_pullrod_xn', 'rear_suspension_pullrod', -1, parts.rsus, 'rear_suspension_pullrod', 'rear_suspension_pullrod');
  push('wheel_fxp', 'wheel_front', +1, parts.wheelF, 'wheel_front', 'wheel_front');
  push('wheel_fxn', 'wheel_front', -1, parts.wheelF, 'wheel_front', 'wheel_front');
  push('wheel_rxp', 'wheel_rear', +1, parts.wheelR, 'wheel_rear', 'wheel_rear');
  push('wheel_rxn', 'wheel_rear', -1, parts.wheelR, 'wheel_rear', 'wheel_rear');
  push('rear_wing_DRS', 'rear_wing_DRS', 0, parts.rw, 'rear_wing_DRS', 'rear_wing_DRS');
  push('reference_plank', 'reference_plank', 0, parts.plank, 'reference_plank', 'reference_plank');
  const extras = withGearbox ? [{ id: 'gearbox_proxy', parts: buildGearboxProxy(), optional: true }] : [];
  return { K, bodies, extras, notes: NOTES, parts, dBof };
}
void CTRL;
