// ============================================================================
// app.mjs — Three.js scene, explosion kinematics (§7), DRS (§5.11), ground (§7.5),
// camera follow (§6.4), HUD and verification wiring.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildModel, NOTES, drsPivot } from './bodies.mjs';
import * as S from './spec.mjs';
import { buildWorld, runAsserts, namedClearances, PairSweep, regChecks, rakeMatrix, DESIGNED_CONTACT, partScan } from './verify.mjs';
import { buildLivery } from './livery.mjs';
import { smoothstep, DEG } from './core.mjs';
import { modelFingerprint } from './fingerprint.mjs';

// The verification worker's source is injected by build.mjs (esbuild `define`); undefined when run unbundled.
const VERIFY_WORKER_SRC = typeof __RB7_VERIFY_WORKER__ === 'string' ? __RB7_VERIFY_WORKER__ : null;
// ?verify=inline forces the in-thread fallback path (for comparison / testing); default is the verification worker
const VERIFY_MODE = new URLSearchParams(location.search).get('verify');

const K = S.K;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const state = { t: 0, playing: false, dir: +1, speed: 1, drsTarget: 0, drs: 0, ground: 'fade', wire: false, decals: true, gearbox: false, conflicts: false };
const PLAY_SECONDS = 16;                 // 1x: full teardown in 16 s
let drsOpen = 15.1 * DEG;                // replaced by the bisected angle from assert A7

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;   // the key light is fixed: re-render the shadow map only when a caster moved (see `sceneDirty`)
renderer.setClearColor(0x000000, 0);

// Render on demand.  `sceneDirty`: something that casts or receives shadow changed (re-render shadow map + image).
// `needsRender`: image only (camera, UI state).  A frame that sets neither is skipped entirely.
let sceneDirty = true, needsRender = true;
const invalidate = (shadow = false) => { needsRender = true; if (shadow) sceneDirty = true; };
// OrbitControls' 'change' event has a ~1 mrad (~2 px) dead band, and even a 0.002 px pose error flips MSAA samples along edges,
// so the drawn pose is tracked separately and rendered until it has stopped moving: the resting image is exactly the resting
// camera (a few seconds of tail frames after a drag, then zero renders).
const drawnPose = new Float64Array(10).fill(1e9), curPose = new Float64Array(10);
const readPose = (out, cam, tgt) => { cam.position.toArray(out, 0); cam.quaternion.toArray(out, 3); tgt.toArray(out, 7); };
const poseMoved = (cam, tgt) => { readPose(curPose, cam, tgt); for (let i = 0; i < 10; i++) if (Math.abs(curPose[i] - drawnPose[i]) > 1e-12) return true; return false; };

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1124, 14, 42);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.2, 120);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 0.8; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI * 0.98;

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(6, 10, 7); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
key.target.position.set(0, 0.3, -1.5);
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x8fb1ff, 0.7); fill.position.set(-7, 4, -5); scene.add(fill);
scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x10131c, 0.55));

// ground (world frame: contact plane y = -h_F)
const GROUND_Y = -K.hF * 1e-3;
const grid = new THREE.GridHelper(40, 80, 0x4a5d86, 0x26334f);
grid.position.y = GROUND_Y; grid.material.transparent = true; grid.material.depthWrite = false;
scene.add(grid);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.38 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = GROUND_Y + 0.0006; shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------
const NAVY = 0x0B1F4B;
const MAT = {
  paint: new THREE.MeshPhysicalMaterial({ color: NAVY, metalness: 0.35, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.9 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x0a1a3c, metalness: 0.2, roughness: 0.55, envMapIntensity: 0.7 }),
  carbonDark: new THREE.MeshStandardMaterial({ color: 0x0c142b, metalness: 0.1, roughness: 0.7 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x0f1013, metalness: 0.0, roughness: 0.92 }),
  alloy: new THREE.MeshStandardMaterial({ color: 0x8c929c, metalness: 0.9, roughness: 0.35 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 1.0, roughness: 0.42 }),
  caliper: new THREE.MeshStandardMaterial({ color: 0xa3262d, metalness: 0.2, roughness: 0.4 }),
  susp: new THREE.MeshStandardMaterial({ color: 0x101c3a, metalness: 0.3, roughness: 0.45 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc08a1c, metalness: 0.9, roughness: 0.38, envMapIntensity: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  inconel: new THREE.MeshStandardMaterial({ color: 0x8a8378, metalness: 0.85, roughness: 0.45 }),
  radiator: new THREE.MeshStandardMaterial({ color: 0x6f757e, metalness: 0.65, roughness: 0.55 }),
};
const openMat = new Map(); // double-sided clones
const materialFor = (key_, open) => {
  const m = MAT[key_] || MAT.paint;
  if (!open) return m;
  if (!openMat.has(key_)) { const c = m.clone(); c.side = THREE.DoubleSide; openMat.set(key_, c); }
  return openMat.get(key_);
};
const HILITE = new THREE.MeshStandardMaterial({ color: 0xff2a3d, emissive: 0xff0020, emissiveIntensity: 0.8, metalness: 0.1, roughness: 0.4, side: THREE.DoubleSide });

// ---------------------------------------------------------------------------
// geometry conversion (mm authored -> metres, creased normals)
// ---------------------------------------------------------------------------
function toGeometry(mesh, crease = 38 * DEG) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(mesh.p.length); for (let i = 0; i < pos.length; i++) pos[i] = mesh.p[i] * 1e-3;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.i), 1));
  const out = toCreasedNormals(g, crease);
  g.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------
let model, world, livery;
const bodyNodes = new Map();       // id -> { wrapper, mirror, meshes, decals }
let rakedRoot, liftGroup, flapPivot = null;
let totalMass = 0, com0W = new THREE.Vector3();

function buildScene() {
  model = buildModel({ withGearbox: true });
  livery = buildLivery();
  liftGroup = new THREE.Group(); scene.add(liftGroup);
  rakedRoot = new THREE.Group(); rakedRoot.matrixAutoUpdate = false;
  const M = rakeMatrix(); M.elements[13] *= 1e-3; M.elements[14] *= 1e-3;             // translation mm -> m
  rakedRoot.matrix.copy(M); rakedRoot.matrixWorldNeedsUpdate = true;
  liftGroup.add(rakedRoot);

  const geomCache = new Map();
  const geomOf = (mesh) => { if (!geomCache.has(mesh)) geomCache.set(mesh, toGeometry(mesh)); return geomCache.get(mesh); };
  const [pz, py] = drsPivot();

  for (const b of model.bodies) {
    const wrapper = new THREE.Group(); wrapper.name = b.id;
    const mirror = new THREE.Group(); if (b.mirror) mirror.scale.x = -1;
    wrapper.add(mirror);
    const node = { wrapper, mirror, meshes: [], decals: [], body: b };
    for (const p of b.parts) {
      const mesh = new THREE.Mesh(geomOf(p.mesh), materialFor(p.mat, p.open));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `${b.id}/${p.name}`; mesh.userData.mat = mesh.material;
      if (p.drs) {
        flapPivot = new THREE.Group(); flapPivot.position.set(0, py * 1e-3, pz * 1e-3);
        mesh.position.set(0, -py * 1e-3, -pz * 1e-3); flapPivot.add(mesh); mirror.add(flapPivot);
      } else mirror.add(mesh);
      node.meshes.push(mesh);
    }
    for (const d of (livery[b.base] || livery[b.id] || [])) {
      const g = b.mirror && d.geomFlip ? d.geomFlip : d.geom;
      const m = new THREE.Mesh(g, d.mat); m.renderOrder = 2; m.name = `${b.id}/decal:${d.name}`;
      mirror.add(m); node.decals.push(m);
    }
    rakedRoot.add(wrapper);
    bodyNodes.set(b.id, node);
  }
  // optional gearbox proxy (static, §5.9) — hidden by default, not in the brief
  for (const e of model.extras) {
    const wrapper = new THREE.Group(); wrapper.name = e.id; wrapper.visible = false;
    for (const p of e.parts) { const m = new THREE.Mesh(geomOf(p.mesh), materialFor(p.mat, false)); m.castShadow = m.receiveShadow = true; wrapper.add(m); }
    rakedRoot.add(wrapper); bodyNodes.set(e.id, { wrapper, mirror: wrapper, meshes: [], decals: [], body: e });
  }
  totalMass = model.bodies.reduce((a, b) => a + b.mass, 0);
  const cB = [0, 0, 0]; for (const b of model.bodies) for (let a = 0; a < 3; a++) cB[a] += b.mass * b.com[a] / totalMass;
  const cp = new THREE.Vector3(cB[0], cB[1], cB[2]).multiplyScalar(1e-3).applyMatrix4(M);
  com0W.copy(cp);
}

// ---------------------------------------------------------------------------
// kinematics
// ---------------------------------------------------------------------------
const easeOf = (b, t) => (b.win ? smoothstep((t - b.win[0]) / (b.win[1] - b.win[0])) : 0);
const tmpV = new THREE.Vector3();
function comAt(t) {
  const c = com0W.clone();
  for (const b of model.bodies) { const e = easeOf(b, t); c.x += b.mass * e * b.dW[0] / totalMass; c.y += b.mass * e * b.dW[1] / totalMass; c.z += b.mass * e * b.dW[2] / totalMass; }
  return c;
}
let lastTarget = new THREE.Vector3();
function applyT(t, { follow = true } = {}) {
  invalidate(true);
  state.t = Math.min(1, Math.max(0, t));
  for (const b of model.bodies) {
    const e = easeOf(b, state.t); const w = bodyNodes.get(b.id).wrapper;
    w.position.set(b.dB[0] * e, b.dB[1] * e, b.dB[2] * e);            // d_B inside the raked root (§7.1 option 2)
  }
  const eC2 = smoothstep((state.t - 0.80) / 0.20);                      // e(s_C2)
  if (state.ground === 'fade') { liftGroup.position.y = 0; grid.material.opacity = 1 - eC2; shadowCatcher.material.opacity = 0.38 * (1 - eC2); grid.visible = eC2 < 0.999; }
  else { liftGroup.position.y = S.GROUND_LIFT * eC2; grid.material.opacity = 1; shadowCatcher.material.opacity = 0.38; grid.visible = true; }
  if (follow) {
    const c = comAt(state.t); c.y += liftGroup.position.y;
    const d = c.clone().sub(lastTarget);
    camera.position.add(d); controls.target.copy(c); lastTarget.copy(c);
  }
  updateHud();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const STAGES = [['A1', 0.00, 0.16], ['A2', 0.06, 0.22], ['A3', 0.10, 0.26], ['A4', 0.20, 0.36], ['A5', 0.26, 0.42], ['B1', 0.44, 0.62], ['C1', 0.64, 0.78], ['C2', 0.80, 1.00]];
function buildHud() {
  $('hud').innerHTML = `
  <div class="title"><b>RB7</b> · 2011 · exploded parametric CAD<small>metres · frame W/B · raked root · smoothstep teardown A1→C2</small></div>
  <div class="right">
    <button id="badge" class="badge pending" title="Open verification report">§8 verification — running…</button>
    <div class="panel">
      <label><input type="checkbox" id="optDrs"> DRS flap open <span class="muted" id="drsDeg"></span></label>
      <label>Ground
        <select id="optGround"><option value="fade">fade grid by e(s<sub>C2</sub>)</option><option value="lift">lift root Λ = 1.20 m</option></select></label>
      <label><input type="checkbox" id="optDecals" checked> livery decals</label>
      <label><input type="checkbox" id="optWire"> wireframe</label>
      <label><input type="checkbox" id="optGear"> gearbox proxy (optional, static)</label>
      <label><input type="checkbox" id="optHot"> highlight conflicts</label>
      <div class="views"><button id="btnFrame" title="Fit every body in view (F)">⤢ frame</button><button data-view="iso">3/4</button><button data-view="side">+x side</button><button data-view="sideR">−x side</button><button data-view="top">top</button><button data-view="front">front</button><button data-view="rear">rear</button></div>
    </div>
  </div>
  <div class="bar">
    <div class="row">
      <button id="btnReset" title="Assembled (t=0)">⏮</button>
      <button id="btnPlay" class="primary" title="Play / pause (Space)">▶ explode</button>
      <button id="btnDir" title="Toggle direction (R)">⇄</button>
      <input id="slider" type="range" min="0" max="1000" value="0" step="1">
      <span class="tval" id="tVal">t = 0.000</span>
      <select id="optSpeed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
    </div>
    <div class="stages" id="stages">${STAGES.map(([n, a, b]) => `<span class="stage" data-a="${a}" data-b="${b}" style="left:${a * 100}%;width:${(b - a) * 100}%"><i>${n}</i></span>`).join('')}</div>
  </div>
  <div id="loading"><div><div class="spin"></div>Building parametric model…</div></div>
  <aside id="report" class="report hidden"></aside>`;
}
let stageEls = null;
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };   // rewriting identical text still invalidates layout
function updateHud() {
  const sl = $('slider'), v = Math.round(state.t * 1000);
  if (+sl.value !== v) sl.value = v;
  setText($('tVal'), 't = ' + state.t.toFixed(3));
  stageEls = stageEls || [...document.querySelectorAll('.stage')];
  for (const el of stageEls) {
    const a = +el.dataset.a, b = +el.dataset.b; el.classList.toggle('on', state.t > a && state.t < b); el.classList.toggle('done', state.t >= b);
  }
  setText($('btnPlay'), (state.playing ? '❚❚ pause' : (state.dir > 0 ? '▶ explode' : '◀ assemble')));
}

const VIEWS = { iso: [4.6, 2.9, 6.4], side: [8.5, 1.3, 0.001], sideR: [-8.5, 1.3, 0.001], top: [0.001, 9.5, 0.001], front: [0, 1.6, 8.5], rear: [0, 1.8, -8.5], isoR: [-4.6, 2.9, -6.4] };
function frameAll() {
  const box = new THREE.Box3(); box.setFromObject(rakedRoot);
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.62;
  controls.target.copy(c); lastTarget.copy(c);
  camera.position.copy(c).addScaledVector(dir, Math.max(4, dist)); controls.update(); invalidate();
}
function setView(name) {
  const o = VIEWS[name], c = controls.target;
  camera.position.set(c.x + o[0], c.y + o[1], c.z + o[2]); controls.update(); invalidate();
}

// ---------------------------------------------------------------------------
// verification report
// ---------------------------------------------------------------------------
const V = { asserts: [], named: [], parts: [], sweep: null, reg: [], conflicts: [], done: false, timing: {} };
function setBadge(cls, text) { const b = $('badge'); b.className = 'badge ' + cls; b.textContent = text; document.title = (cls === 'fail' ? '⚠ ' : '') + 'RB7 2011 — exploded parametric CAD'; }
function logAsserts() {
  console.groupCollapsed('%cRB7 §8 verification', 'font-weight:700');
  for (const r of V.asserts) console.log(`%c${r.pass ? '✔ PASS' : '✘ FAIL'}%c ${r.id} ${r.title}\n      ${r.detail}`, `color:${r.pass ? '#3fb950' : '#ff4d4f'};font-weight:700`, 'color:inherit');
  console.groupEnd();
}
function computeConflicts() {
  const raw = [];
  for (const r of V.asserts) if (!r.pass) raw.push({ kind: r.specConflict ? 'spec conflict' : 'assert', text: `${r.id}: ${r.title}`, detail: r.detail, bodies: [] });
  for (const r of V.reg) if (!r.pass) raw.push({ kind: 'envelope', text: `${r.id} [${r.tag}] ${r.text}`, detail: r.val, bodies: [] });
  for (const r of V.named) if (r.kind === 'min' && Number.isFinite(r.measured) && r.measured < r.expected - 1) raw.push({ kind: 'clearance', text: `${r.label}`, detail: `measured ${f2(r.measured)} mm vs spec ${r.expected} mm${r.measured < 2 ? ' — UNDER 2 mm: stop and flag, hardpoints NOT moved' : ''}${r.note ? ' · ' + r.note : ''}`, bodies: [] });
  if (V.sweep) for (const r of V.sweep.results) if (r.unexplained) {
    const ps = [...new Set(r.violations.map((v) => `${v.a} ✕ ${v.b}`))];
    const maxDisp = Math.max(...r.violations.map((v) => v.disp));
    raw.push({ kind: 'interference', text: `${r.a} ✕ ${r.b}`, detail: `parts: ${ps.join('; ')} · touching at t=${f2(r.contacts[0].t, 3)}…${f2(r.contacts[r.contacts.length - 1].t, 3)} (relative travel while touching ≤ ${f2(maxDisp, 1)} mm)`, bodies: [r.a, r.b] });
  }
  for (const r of V.parts) if (r.d > 1e-3 && r.d < 2) raw.push({ kind: 'near-miss', text: `${r.a}/${r.pa} ↔ ${r.b}/${r.pb}`, detail: `static clearance ${f2(r.d)} mm (< 2 mm: stop and flag; hardpoints NOT moved)`, bodies: [r.a, r.b] });
  // collapse mirrored _xn / fxn / rxn duplicates into their _xp twin
  const hasXn = (s) => /xn(?![a-z])/.test(s), hasXp = (s) => /xp(?![a-z])/.test(s), toXp = (s) => s.replace(/xn(?![a-z])/g, 'xp');
  const out = [], seen = new Map();
  for (const c of raw) {
    const key = c.kind + '|' + toXp(c.text);
    if (hasXn(c.text) && !hasXp(c.text) && seen.has(key)) { const s = seen.get(key); s.detail += ' · mirrored on the _xn side'; s.bodies = [...new Set([...s.bodies, ...c.bodies])]; continue; }
    seen.set(key, c); out.push(c);
  }
  return out;
}
function tag(t) { return `<span class="tag ${t.replace(/[^A-Z]/g, '')}">${t}</span>`; }
function renderReport() {
  const ok = V.asserts.filter((r) => r.pass).length, bad = V.asserts.length - ok;
  const sw = V.sweep;
  const conflicts = V.conflicts;
  const rows = (arr) => arr.join('');
  const assertRows = V.asserts.map((r) => `<tr class="${r.pass ? 'ok' : 'bad'}"><td>${r.pass ? '✔' : '✘'}</td><td><b>${r.id}</b></td><td>${esc(r.title)}<div class="d">${esc(r.detail)}${r.lines ? '<br>' + r.lines.map(esc).join('<br>') : ''}</div></td></tr>`);
  const namedRows = V.named.map((r) => {
    const d = Number.isFinite(r.measured) ? r.measured - r.expected : NaN;
    const cls = !Number.isFinite(r.measured) ? 'ok' : r.measured < 2 ? 'bad' : r.measured < r.expected - 1 ? 'warn' : 'ok';
    return `<tr class="${cls}"><td>${esc(r.label)}${r.note ? `<div class="d">${esc(r.note)}</div>` : ''}</td><td class="n">${r.expected}</td><td class="n">${Number.isFinite(r.measured) ? f2(r.measured) : '> 400'}</td><td class="n">${Number.isFinite(d) ? (d >= 0 ? '+' : '') + f2(d, 1) : '—'}</td><td class="n">${r.at === null ? '' : f2(r.at, 3)}</td></tr>`;
  });
  const sweepSmall = sw ? sw.results.filter((r) => r.contacts.length || r.min <= sw.report).sort((a, b) => a.min - b.min) : [];
  const sweepRows = sweepSmall.map((r) => {
    const cls = r.unexplained ? 'bad' : (r.contacts.length ? 'designed' : (r.min < 5 ? 'warn' : 'ok'));
    const tt = r.contacts.length ? `contact t = ${f2(r.contacts[0].t, 3)}…${f2(r.contacts[r.contacts.length - 1].t, 3)}` : `at t = ${r.tMin === null ? '—' : f2(r.tMin, 3)}`;
    return `<tr class="${cls}"><td>${esc(r.a)} <span class="muted">×</span> ${esc(r.b)}</td><td class="n">${r.min <= 1e-3 ? '0 (touch/intersect)' : f2(r.min)}</td><td>${tt}</td><td>${r.unexplained ? 'UNEXPLAINED: ' + esc([...new Set(r.violations.map((v) => v.a + ' ✕ ' + v.b))].join('; ')) : (r.designed ? 'designed: ' + esc(r.designed) : '')}</td></tr>`;
  });
  const designedSet = (r) => DESIGNED_CONTACT.some((d) => ((r.a.startsWith(d.a) && r.b.startsWith(d.b)) || (r.a.startsWith(d.b) && r.b.startsWith(d.a))) && d.parts.some(([x, y]) => (new RegExp('^' + x.replace('*', '.*') + '$').test(r.pa) && new RegExp('^' + y.replace('*', '.*') + '$').test(r.pb)) || (new RegExp('^' + x.replace('*', '.*') + '$').test(r.pb) && new RegExp('^' + y.replace('*', '.*') + '$').test(r.pa))));
  const partRows = V.parts.filter((r) => { const s = r.a + ' ' + r.b; return !(/xn(?![a-z])/.test(s) && !/xp(?![a-z])/.test(s)); }).map((r) => {
    const cls = r.d <= 1e-3 ? (designedSet(r) ? 'designed' : 'bad') : (r.d < 2 ? 'bad' : 'warn');
    return `<tr class="${cls}"><td>${esc(r.a)}/${esc(r.pa)} <span class="muted">×</span> ${esc(r.b)}/${esc(r.pb)}</td><td class="n">${r.d <= 1e-3 ? '0 (touch/intersect)' : f2(r.d)}</td><td>${r.d <= 1e-3 ? (designedSet(r) ? 'designed contact' : 'UNEXPLAINED') : (r.d < 2 ? 'under 2 mm' : '')}</td></tr>`;
  });
  const regRows = V.reg.map((r) => `<tr class="${r.pass ? 'ok' : 'bad'}"><td>${r.pass ? '✔' : '✘'}</td><td><b>${r.id}</b> ${tag(r.tag)}</td><td>${esc(r.text)}<div class="d">${esc(r.val)}</div></td></tr>`);
  const confRows = conflicts.map((c, i) => `<tr class="bad" data-conf="${i}"><td><span class="tag KIND">${esc(c.kind)}</span></td><td><b>${esc(c.text)}</b><div class="d">${esc(c.detail)}</div></td></tr>`);
  const prov = [
    ['R14', 'FW bodywork 75 ≤ y ≤ 275 outboard of the central 500', 'REG-RECALL'], ['R15', 'RW box 730 ≤ y ≤ 950, |x| ≤ 375', 'REG-RECALL'], ['R16', 'DRS slot gap 10–15 closed / ≤ 50 open', 'REG-RECALL'],
    ['R17', 'floor |x| ≤ 700 between the axles', 'REG-RECALL'], ['R18', 'brake disc Ø ≤ 278, thickness ≤ 28', 'REG-RECALL'], ['R19', 'nose ≥ 9 000 mm² 50 mm behind the tip', 'REG-RECALL'],
    ['R20', 'mass ≥ 640 kg incl. driver; axle minimums 291 / 342 kg', 'REG-RECALL'], ['R6 (plank 300×10, holes Ø50 ×6, ρ)', 'hole count/diameter recalled; positions [EST]', 'REG-RECALL'],
    ['R15 endplate/beam below 730', 'extension below 730 and beam-wing window', 'EST / REG-RECALL'], ['R1 (tyres incl. in 1800 limit)', 'camber option only; default γ=0', 'REG-RECALL'],
  ].map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td><td>${tag(c)}</td></tr>`);
  const notes = NOTES.map((n) => `<tr><td><b>${esc(n.id)}</b></td><td>${esc(n.where)}</td><td>${esc(n.text)}</td></tr>`);
  const designed = DESIGNED_CONTACT.map((d) => `<tr><td>${esc(d.a)} × ${esc(d.b)}</td><td>${esc(d.parts.map((p) => p.join(' ~ ')).join(', '))}</td><td>${esc(d.why)}</td></tr>`);
  $('report').innerHTML = `
    <header><b>§8 verification report</b><button id="repClose" title="Close (Esc)">×</button></header>
    <div class="sum ${bad || conflicts.length ? 'bad' : 'ok'}">
      ${ok}/${V.asserts.length} asserts pass · ${bad} fail · pairwise sweep: ${sw ? `${sw.pairs.length} pairs × 201 samples, intervals between samples certified by the Lipschitz bound (${sw.queries} BVH queries, ${(sw.elapsed / 1000).toFixed(1)} s CPU)` : 'running'} ·
      ${conflicts.length} flagged item${conflicts.length === 1 ? '' : 's'} (none silently fixed)
    </div>
    <h4>Flagged — spec values that conflict or fall short</h4><table class="t">${confRows.join('') || '<tr><td>none</td></tr>'}</table>
    <h4>§8 asserts</h4><table class="t">${rows(assertRows)}</table>
    <h4>§8.9 expected minimum clearances — measured, not assumed (mm)</h4>
    <table class="t"><tr><th>pair</th><th>spec</th><th>measured</th><th>Δ</th><th>t</th></tr>${rows(namedRows)}</table>
    <h4>§8.9 body-pair sweep — pairs in contact or ≤ ${sw ? sw.report : 15} mm (t = 0…1, step 0.005, certified between samples)</h4>
    <table class="t"><tr><th>pair</th><th>min (mm)</th><th>when</th><th>status</th></tr>${rows(sweepRows)}</table>
    <h4>Static part-level scan at t = 0 — part pairs within 5 mm (_xn bodies mirror _xp)</h4>
    <table class="t"><tr><th>part pair</th><th>distance (mm)</th><th>status</th></tr>${rows(partRows)}</table>
    <h4>Designed-contact allow-list (spec §8.10, confirmed by the spec corrections)</h4><table class="t">${rows(designed)}</table>
    <h4>Regulatory envelope (informational)</h4><table class="t">${rows(regRows)}</table>
    <h4>Provisional values (not verified against the FIA text)</h4><table class="t">${rows(prov)}</table>
    <h4>Interpretation log</h4><table class="t">${rows(notes)}</table>`;
  $('repClose').onclick = () => $('report').classList.add('hidden');
  for (const tr of document.querySelectorAll('#report tr[data-conf]')) tr.onclick = () => { const c = conflicts[+tr.dataset.conf]; highlight(c.bodies); };
}
function highlight(ids, ms = 4000) {
  for (const n of bodyNodes.values()) for (const m of n.meshes) m.material = m.userData.mat;
  invalidate(true);                    // material.side feeds the shadow depth material, so the shadow map is stale too
  if (!ids || !ids.length) return;
  for (const id of ids) { const n = bodyNodes.get(id); if (n) for (const m of n.meshes) m.material = HILITE; }
  invalidate(true);
  if (ms) setTimeout(() => { if (!state.conflicts) { for (const n of bodyNodes.values()) for (const m of n.meshes) m.material = m.userData.mat; invalidate(true); } }, ms);
}

// ---------------------------------------------------------------------------
// verification pipeline
// ---------------------------------------------------------------------------
// Preferred path: one Web Worker (vworker.mjs) runs the same verify.mjs code, in the original order, off the main
// thread, so the page renders and responds while the §8 self-check runs.  Fallback, if workers are unavailable or
// anything about them is off: the original in-thread path (runVerificationInline), unchanged.
let sweep = null;                      // in-thread PairSweep (fallback path only)
let vw = null;                         // worker pipeline state

function onAsserts() {                 // shared by both paths, runs when V.asserts is available
  const a7 = V.asserts.find((r) => r.id === 'A7'); if (a7 && a7.dOpen) { drsOpen = a7.dOpen; invalidate(true); }
  $('drsDeg').textContent = `(δ = ${(drsOpen / DEG).toFixed(2)}°)`;
  logAsserts();
  const bad = V.asserts.filter((r) => !r.pass).length;
  setBadge(bad ? 'fail' : 'pass', `§8: ${V.asserts.length - bad}/${V.asserts.length} asserts · sweep 0 %`);
}
function logNamed() {
  console.groupCollapsed('%cRB7 §8.9 expected minima vs measured', 'font-weight:700');
  for (const r of V.named) console.log(`${r.label}: spec ${r.expected} mm, measured ${Number.isFinite(r.measured) ? r.measured.toFixed(2) : '>400'} mm`);
  console.groupEnd();
}
function setSweepBadge() {
  const sw = V.sweep; if (!sw || sw.done || !V.asserts.length) return;
  const pct = Math.round(sw.progress * 100); if (pct === setSweepBadge.last) return; setSweepBadge.last = pct;
  const bad = V.asserts.filter((r) => !r.pass).length;
  setBadge(bad ? 'fail' : 'pass', `§8: ${V.asserts.length - bad}/${V.asserts.length} asserts · sweep ${pct} %`);
}
function finishVerification() {        // everything has arrived: conflicts, final badge, report
  const sw = V.sweep; if (!sw.done) sw.done = true; V.done = true;   // (PairSweep.done is a getter, already true there)
  const bad = V.asserts.filter((r) => !r.pass).length;
  V.conflicts = computeConflicts();
  const nI = V.conflicts.filter((c) => c.kind === 'interference').length;
  setBadge(bad || V.conflicts.length ? 'fail' : 'pass', `§8: ${V.asserts.length - bad}/${V.asserts.length} asserts · ${V.conflicts.length} flagged (${nI} interferences)`);
  console.groupCollapsed('%cRB7 §8.9 pairwise sweep', 'font-weight:700;color:' + (V.conflicts.length ? '#ff4d4f' : '#3fb950'));
  console.log(`${sw.pairs.length} pairs, ${sw.queries} BVH queries, ${(sw.elapsed / 1000).toFixed(1)} s${vw ? ' (verification worker)' : ''}`);
  console.log('timing ms', JSON.stringify(V.timing));
  for (const c of V.conflicts) console.log(`%c${c.kind.toUpperCase()}%c ${c.text} — ${c.detail}`, 'color:#ff4d4f;font-weight:700', 'color:inherit');
  console.groupEnd();
  renderReport();
  if (vw) { vw.worker.terminate(); URL.revokeObjectURL(vw.url); vw = null; }
}

function runVerificationWorkers() {
  const url = URL.createObjectURL(new Blob([VERIFY_WORKER_SRC], { type: 'text/javascript' }));
  const pageFp = modelFingerprint(model);
  const worker = new Worker(url);
  const st = vw = { worker, url, dead: false };
  const abort = (why, err) => {        // stop the worker and verify in-thread instead: the self-check must never silently vanish
    if (st.dead) return; st.dead = true;
    worker.terminate(); URL.revokeObjectURL(url); vw = null;
    console.error('RB7: verification worker abandoned (' + why + ') — verifying on the main thread', err || '');
    Object.assign(V, { asserts: [], reg: [], named: [], parts: [], sweep: null, conflicts: [], done: false, timing: { scene: V.timing.scene } });
    runVerificationInline();
  };
  worker.onmessage = (ev) => {
    const m = ev.data; if (st.dead) return;
    switch (m.type) {
      case 'ready':
        if (m.fingerprint !== pageFp) return abort(`model fingerprint mismatch: page ${pageFp}, worker ${m.fingerprint}`);
        V.timing.world = m.timing.world; V.timing.workerModel = m.timing.model;
        break;
      case 'asserts': V.asserts = m.asserts; V.timing.asserts = m.ms; onAsserts(); renderReport(); break;
      case 'reg': V.reg = m.reg; renderReport(); break;
      case 'named': V.named = m.named; V.timing.named = m.ms; logNamed(); renderReport(); break;
      case 'parts': V.parts = m.parts; V.timing.parts = m.ms; renderReport(); break;
      case 'sweepStart':
        V.sweep = { pairs: m.pairs, results: [], queries: 0, elapsed: 0, report: m.report, step: m.step, thr: m.thr, cursor: 0, done: false, get progress() { return this.cursor / this.pairs.length; } };
        break;
      case 'sweepProgress': Object.assign(V.sweep, { cursor: m.cursor, queries: m.queries, elapsed: m.elapsed }); break;
      case 'sweepDone': Object.assign(V.sweep, { results: m.results, queries: m.queries, elapsed: m.elapsed, cursor: V.sweep.pairs.length }); finishVerification(); break;
      case 'error': abort('worker threw', m.message); break;
    }
  };
  worker.onerror = (e) => abort(`worker error: ${e.message || 'failed to load'}`, e);
  worker.onmessageerror = (e) => abort('worker message error', e);
  worker.postMessage({ type: 'start' });
}

function runVerificationInline() {     // original behaviour: world + asserts now, named clearances next tick, sweep in time slices
  let t0 = performance.now();
  world = buildWorld(model); V.timing.world = performance.now() - t0; t0 = performance.now();
  V.asserts = runAsserts(model, world); V.timing.asserts = performance.now() - t0;
  V.reg = regChecks(model);
  onAsserts();
  renderReport();
  setTimeout(() => {
    const tn = performance.now(); V.named = namedClearances(world); V.timing.named = performance.now() - tn;
    V.parts = partScan(world, 5);
    logNamed();
    renderReport();
    sweep = new PairSweep(world, { step: 0.005, thr: 15, report: 15 });
    V.sweep = sweep;
  }, 30);
}
function runVerification() {           // true: the worker has the job.  false: caller runs runVerificationInline() after first paint
  if (VERIFY_WORKER_SRC && typeof Worker === 'function' && VERIFY_MODE !== 'inline') {
    try { runVerificationWorkers(); return true; } catch (e) {
      console.warn('RB7: could not start the verification worker; verifying on the main thread.', e);
      if (vw) { vw.worker.terminate(); vw = null; }
    }
  }
  return false;
}
function stepSweep() {                 // fallback path only: `sweep` stays null when the workers are in charge
  if (!sweep || sweep.done) return;
  sweep.run(12);
  if (sweep.done) finishVerification(); else setSweepBadge();
}

// ---------------------------------------------------------------------------
// controls wiring
// ---------------------------------------------------------------------------
function wire() {
  $('slider').addEventListener('input', (e) => { state.playing = false; applyT(+e.target.value / 1000); });
  $('btnPlay').onclick = () => { if (!state.playing && ((state.dir > 0 && state.t >= 1) || (state.dir < 0 && state.t <= 0))) state.dir *= -1; state.playing = !state.playing; updateHud(); };
  $('btnDir').onclick = () => { state.dir *= -1; updateHud(); };
  $('btnReset').onclick = () => { state.playing = false; state.dir = 1; applyT(0); };
  $('optSpeed').onchange = (e) => { state.speed = +e.target.value; };
  $('optDrs').onchange = (e) => { state.drsTarget = e.target.checked ? 1 : 0; };
  $('optGround').onchange = (e) => { state.ground = e.target.value; applyT(state.t); };
  $('optDecals').onchange = (e) => { state.decals = e.target.checked; for (const n of bodyNodes.values()) for (const m of n.decals) m.visible = state.decals; invalidate(); };
  $('optWire').onchange = (e) => { state.wire = e.target.checked; for (const m of [...Object.values(MAT), ...openMat.values()]) m.wireframe = state.wire; invalidate(true); };   // depth material copies .wireframe
  $('optGear').onchange = (e) => { const n = bodyNodes.get('gearbox_proxy'); if (n) n.wrapper.visible = e.target.checked; invalidate(true); };
  controls.addEventListener('change', () => invalidate());   // OrbitControls' own handlers call update(), so listen for the event, not update()'s return value
  $('optHot').onchange = (e) => { state.conflicts = e.target.checked; if (e.target.checked) highlight([...new Set(V.conflicts.flatMap((c) => c.bodies))], 0); else highlight([], 0); };
  for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => setView(b.dataset.view);
  $('btnFrame').onclick = frameAll;
  $('badge').onclick = () => { $('report').classList.toggle('hidden'); };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); $('btnPlay').click(); }
    else if (e.key === 'r' || e.key === 'R') $('btnDir').click();
    else if (e.key === 'd' || e.key === 'D') { $('optDrs').checked = !$('optDrs').checked; state.drsTarget = $('optDrs').checked ? 1 : 0; }
    else if (e.key === 'f' || e.key === 'F') frameAll();
    else if (e.key === 'Escape') $('report').classList.add('hidden');
  });
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  invalidate();                        // setSize clears the drawing buffer
}
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (state.playing) {
    let t = state.t + state.dir * dt * state.speed / PLAY_SECONDS;
    if (t >= 1) { t = 1; state.playing = false; } else if (t <= 0) { t = 0; state.playing = false; }
    applyT(t);
  }
  // DRS secondary animation (independent of the explosion): exponential approach, rotation R_x(-delta) about the flap pivot
  if (state.drs !== state.drsTarget) {
    const k = 1 - Math.exp(-dt * 6);
    state.drs += (state.drsTarget - state.drs) * k; if (Math.abs(state.drs - state.drsTarget) < 1e-4) state.drs = state.drsTarget;
  }
  const flapRot = -state.drs * drsOpen;
  if (flapPivot && flapPivot.rotation.x !== flapRot) { flapPivot.rotation.x = flapRot; invalidate(true); }
  stepSweep();
  if (vw) setSweepBadge();
  controls.update();                   // dispatches 'change' (-> needsRender) when the camera moved, incl. damping
  if (!needsRender && poseMoved(camera, controls.target)) needsRender = true;
  if (needsRender) {                   // nothing moved => no render, no GPU work
    if (sceneDirty) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    readPose(drawnPose, camera, controls.target);
    needsRender = sceneDirty = false;
  }
  requestAnimationFrame(frame);
}

export async function start() {
  buildHud();
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  await nextFrame(); await nextFrame();
  resize(); addEventListener('resize', resize);
  const tb = performance.now(); buildScene(); V.timing.scene = performance.now() - tb;
  wire();
  controls.target.copy(comAt(0)); lastTarget.copy(controls.target);
  const o = VIEWS.iso; camera.position.set(controls.target.x + o[0], controls.target.y + o[1], controls.target.z + o[2]);
  applyT(0, { follow: false });
  const inWorker = runVerification();  // the worker starts now and runs alongside the shader compile below
  // compile every program in parallel (KHR_parallel_shader_compile) rather than stalling the first frame on them
  const tc = performance.now();
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('RB7: compileAsync failed, compiling on first render', e); }
  V.timing.compile = performance.now() - tc;
  $('loading').classList.add('hidden');
  requestAnimationFrame(frame);
  if (!inWorker) requestAnimationFrame(() => setTimeout(runVerificationInline, 50));   // fallback: first paint, then the in-thread work
  window.RB7 = { state, applyT, model, get world() { return world || (world = buildWorld(model)); }, V, scene, camera, controls, bodyNodes, setView, highlight, frameAll, THREE };
}
