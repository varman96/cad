// ============================================================================
// fingerprint.mjs — order-sensitive hash of everything the §8 verification reads
// from a built model (ids, kinematics, masses, every vertex and index).  The page
// compares its own model's fingerprint with the one the verification workers
// built, so a worker can never certify geometry other than what is on screen.
// ============================================================================
export function modelFingerprint(model) {
  let h = 0x811c9dc5 | 0, n = 0;
  const mixInt = (v) => { h = Math.imul(h ^ v, 0x01000193); n++; };
  const mix = (x, scale = 1e3) => mixInt(Math.round((Number.isFinite(x) ? x : 0) * scale) | 0);
  const mixStr = (s) => { s = String(s ?? ''); for (let i = 0; i < s.length; i++) mixInt(s.charCodeAt(i)); mixInt(0x7f); };
  const mixVec = (a, scale) => { if (!a) { mixInt(-1); return; } for (let i = 0; i < a.length; i++) mix(a[i], scale); };
  for (const b of model.bodies) {
    mixStr(b.id); mixStr(b.base); mix(b.side ?? 0); mixInt(b.mirror ? 1 : 0); mixStr(b.stage);
    mixVec(b.win, 1e6); mixVec(b.dB, 1e6); mixVec(b.com, 1e3); mix(b.mass, 1e6);
    for (const p of b.parts) {
      mixStr(p.name); mixStr(p.mat); mixInt(p.open ? 1 : 0); mixInt(p.drs ? 1 : 0);
      mixVec(p.mesh.p, 1e3);
      const ix = p.mesh.i; mixInt(ix.length); for (let i = 0; i < ix.length; i++) mixInt(ix[i] | 0);
    }
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}:${n}`;
}
