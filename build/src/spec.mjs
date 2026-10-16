// ============================================================================
// spec.mjs — every number transcribed from rb7_math_spec.md (mm, deg unless stated)
// Tags: [BRIEF] [DERIVED] [EST] [CHOICE] [REG-RECALL] [REG-CHECK] as in the spec.
// CORR-n comments mark the values changed by RB7_SPEC_CORRECTIONS.md (2026-10-15).
// ============================================================================
import { DEG } from './core.mjs';

export const K = {
  L: 3300,            // [BRIEF] wheelbase, horizontal on ground
  Tf: 1450, Tr: 1400, // [BRIEF] track
  Rw: 330,            // [BRIEF] tyre radius
  WF: 345, WR: 375,   // [EST] tyre widths
  Rrim: 177,          // [EST ±5] rim flange radius (§4.7)
  thetaDeg: 1.8,      // [BRIEF] rake
  hF: 25,             // [EST ±10]
  HD: 125,            // [BRIEF] diffuser roof cap — locked at 125 by audit correction #1
};
K.theta = K.thetaDeg * DEG;
K.s = Math.sin(K.theta);
K.c = Math.cos(K.theta);
// §2.1 datums (B frame) [DERIVED]
K.Z_FA = -K.Rw * K.s;
K.Y_FA = K.Rw * K.c - K.hF;
K.Z_RA = -K.Rw * K.s - K.L * K.c;
K.Y_RA = K.Rw * K.c - K.L * K.s - K.hF;

// ---- §5.1 monocoque -------------------------------------------------------
export const MONO_ST = [
  { z: 350, yb: 300, yt: 640, a: 140, n: 3.0 },
  { z: 100, yb: 205, yt: 660, a: 185, n: 4.0 },
  { z: -330, yb: 60, yt: 660, a: 235, n: 4.0 },
  { z: -700, yb: 60, yt: 650, a: 285, n: 4.0 },
  { z: -1100, yb: 60, yt: 640, a: 300, n: 4.0 },
  { z: -1450, yb: 60, yt: 665, a: 300, n: 4.0 },
  { z: -2000, yb: 60, yt: 600, a: 260, n: 4.0 },
];
export const COCKPIT = { yMin: 520, zc: -850, hz: 425, hx: 225, p: 2.5 }; // |(z+850)/425|^2.5 + |x/225|^2.5 <= 1

// ---- §5.2 nose / front wing ----------------------------------------------
export const NOSE_ST = [
  { z: 350, yb: 300, yt: 640, a: 140, n: 3.0 },
  { z: 700, yb: 312, yt: 560, a: 120, n: 2.6 },
  { z: 980, yb: 305, yt: 470, a: 90, n: 2.3 },
  { z: 1135, yb: 315, yt: 420, a: 62, n: 2.2 },
];
export const NOSE_TIP = { z0: 1135, len: 40, a: 62, b: 52.5, yc: 367.5 }; // tip at z = 1175
// [CHOICE] elements: |x| span, LE(z,y), chord, alpha, NACA code (inverted)
export const FW = {
  neutral: { x: [0, 250], LE: [985, 110], C: 340, alpha: 0, code: '0010', inverted: false },
  main: { x: [250, 840], LE: [985, 105], C: 300, alpha: 6, code: '6412' },
  flap1: { x: [250, 840], LE: [696.6, 148.4], C: 200, alpha: 18, code: '4410' },
  flap2: { x: [250, 840], LE: [516.4, 222.2], C: 120, alpha: 22, code: '4408' },
  c1: { x: [620, 840], LE: [830, 215], C: 100, alpha: 10, code: '4409' },
  c2: { x: [620, 840], LE: [741.5, 244.4], C: 70, alpha: 18, code: '4409' },
};
export const FW_PLATE = { p0: [850, 985], p1: [850, 400], thick: 10, y0: 75, y1: 275, yTE: 140, sChamfer: 516.7 }; // CORR-2
export const FW_FOOT = { y0: 75, y1: 80, width: 60, z0: 700, z1: 985 };
export const FW_PYLON = { x0: 75, x1: 85, z0: 800, z1: 1000 };
export const FW_STRUT = { xs: [620, 835], thick: 6 };

// ---- §5.3 cover ----------------------------------------------------------
export const COVER_ST = [
  { z: -1250, a: 150, ys: 700, yb: 659, yt: 950, n: 2.5 },   // CORR-3 yb 645 -> 659
  { z: -1500, a: 230, ys: 660, yb: 651, yt: 948, n: 3.0 },   // CORR-3 yb 635 -> 651
  { z: -2000, a: 270, ys: 560, yb: 530, yt: 860, n: 3.5 },
  { z: -2300, a: 250, ys: 515, yb: 490, yt: 790, n: 3.5 },
  { z: -2550, a: 225, ys: 465, yb: 440, yt: 700, n: 3.5 },
  { z: -2850, a: 180, ys: 370, yb: 340, yt: 600, n: 3.0 },
  { z: -3000, a: 115, ys: 360, yb: 330, yt: 560, n: 2.5 },
  { z: -3450, a: 80, ys: 340, yb: 320, yt: 430, n: 2.2 },
];
export const AIRBOX = { hx: 70, hy: 75, yc: 850, p: 2.5, zFace: -1250 };
export const FIN = { half: 4, zFront: -1350, zRear: -3300, yTop: 950, zKnee: -2700, yRear: 880 };

// ---- §5.4 pods -----------------------------------------------------------
export const POD_ST = [
  { z: -1150, xi: 300, Xo: 600, Yb: 230, Ym: 400, Yt: 560 },
  { z: -1400, xi: 300, Xo: 680, Yb: 120, Ym: 330, Yt: 580 },
  { z: -1800, xi: 280, Xo: 660, Yb: 80, Ym: 300, Yt: 560 },
  { z: -2050, xi: 265, Xo: 590, Yb: 75, Ym: 280, Yt: 525 },
  { z: -2300, xi: 250, Xo: 510, Yb: 215, Ym: 300, Yt: 490 },
  { z: -2550, xi: 225, Xo: 420, Yb: 225, Ym: 295, Yt: 440 },
  { z: -2850, xi: 180, Xo: 260, Yb: 240, Ym: 275, Yt: 340 },
];
export const POD = { nu: 3.5, nl: 2.2, wall: 3, lipR: 8 };

// ---- §5.5 radiators ------------------------------------------------------
export const RAD = { C: [440, 330, -1720], psiDeg: 20, lamDeg: 12, thick: 50, height: 300, coreLen: 560, tankLen: 30 };

// ---- §5.6 floor ----------------------------------------------------------
export const FLOOR = {
  // right half plan polyline (z, x_f); start station uses the true axle datum
  outline: (zStart, zRA) => [[zStart, 250], [-650, 560], [-950, 700], [-2500, 700], [-2900, 620], [-2995, 620], [-3005, 490], [zRA, 490]],
  stripHalf: 150, stepY0: 50, stepY1: 60,
  wallY: [0, 50], wallThick: 6,                   // wall thickness not given: 6 = fence thickness (assumed)
  topPlateZ: -2000,
  diffLen: 350, diffHalf: 490, roofThick: 8, fenceThick: 6, fenceX: [150, 320], sideX: 490,
  trough: { w: 50, depth: 8, path: [[560, -2935], [455, -2990], [445, -3280]] },
  slot: { x: [420, 470], z: [-3300, -3180] },
  foil: { lift: 0.5, band: 110, bandU0: 0.35, fanApex: [580, -2925], fanDir: [0.7880, -0.6157], fanHalfDeg: 25, fanR: 150 },
};

// ---- §5.7 exhaust --------------------------------------------------------
export const EXH = {
  P: [[170, 185, -2350], [230, 175, -2550], [420, 150, -2800], [580, 100, -2925]],
  a: 55, bt: 18, bb: 32, collectorR: 45, collectorBack: 100, sleeveLen: 250, sleeveOff: 2,
};

// ---- §5.8 front suspension (xp) -----------------------------------------
export const FSUS = {
  WC: [725, 304.84, -10.37],
  UBJ: [625, 424.84, -30.0], LBJ: [645, 232.0, -5.0],                                   // CORR-5 upper wishbone -30 in y
  UF: [200, 440, 200], UR: [240, 445, -250], LF: [175, 265, 170], LR: [245, 265, -270],
  PRo: [628, 248, -32], PRi: [110, 610, -80], TRo: [630, 394.8, 89.6], TRi: [170, 410, 110], // CORR-5 TRo -5,-5
  wb: { C: 60, tau: 20 }, push: { C: 40, tau: 16 }, track: { C: 36, tau: 14 },
  slot: { a: [199.7, 547.3, -71.7], b: [179.5, 610, -80], r: 26 },                      // CORR-4
  hole: { c: [183, 410, 110], hz: 25, hy: 15 },                                          // CORR-4 50 (z) x 30 (y)
};
// ---- §5.9 rear suspension (xp) ------------------------------------------
export const RSUS = {
  WC: [700, 201.18, -3308.74],
  UBJ: [610, 326.18, -3308.74], LBJ: [620, 121.18, -3298.74],                            // CORR-5 upper wishbone + PLo -65 in y
  UF: [140, 335, -3050], UR: [130, 340, -3420], LF: [135, 150, -2950], LR: [125, 150, -3480],
  PLo: [600, 301.18, -3318.74], PLi: [115, 105, -3060], TLo: [615, 151.18, -3413.74], TLi: [125, 165, -3540], // CORR-5 TLo, TLi
  wb: { C: 60, tau: 20 }, pull: { C: 40, tau: 16 }, toe: { C: 36, tau: 14 },
};
export const GEARBOX = { x: [-120, 120], y: [90, 310], z: [-3550, -2550] };

// ---- §5.10 wheels --------------------------------------------------------
export const WHEEL = {
  front: { W: 345, rimW: 305, discDx: -50 },   // CORR-5 -60 -> -50
  rear: { W: 375, rimW: 343, discDx: -40 },    // CORR-5 -55 -> -40
  barrelIn: 160, barrelOut: 165, flangeR: 177,
  spokes: { n: 10, w: 18, r0: 40, r1: 160, inboardOfFlange: 35 },
  disc: { r0: 85, r1: 139, t: 28 },
  caliper: { x: 60, tang: 120, rad: 70, r0: 95, r1: 165, angDeg: 45 },
  upright: { offset: 5, thick: 60, zWidth: 100, beyond: 30 },
};

// ---- §5.11 rear wing -----------------------------------------------------
export const RW = {
  half: 365,
  main: { LE: [-3525, 775], C: 230, alpha: 12, code: '6409' },
  flap: { LE: [-3739.98, 834.82], C: 170, alpha: 36, code: '4408' },
  beam: { LE: [-3570, 390], C: 140, alpha: 15, code: '4412' },
  plate: { x: [365, 375], outline: [[-3490, 600], [-3490, 950], [-3890, 950], [-3890, 330], [-3600, 330]] },
  pylon: { x: [-5, 5], z: [-3720, -3600] },
  drsPivotFrac: 0.85,
};

// ---- §5.12 plank ---------------------------------------------------------
export const PLANK = { half: 150, y: [-10, 0], chamfer: 10, holeD: 50, holeZ: [-700, -1200, -1700, -2200, -2700, -3100], rho: 1.3 };

// ---- §6.1 body table (m in kg, CoM in mm; right-side CoM for sided bodies) ---
export const MASS = {
  monocoque_survival_cell: { m: 55.0, com: [0, 360, -850] },
  nose_and_front_wing_cascade: { m: 14.5, com: [0, 287, 727] },
  engine_cover_and_sharkfin: { m: 8.0, com: [0, 700, -2150] },
  sidepod_pods: { m: 2.5, com: [470, 350, -1800] },
  radiator_internals: { m: 6.0, com: [440, 330, -1720] },
  floor_and_blown_diffuser: { m: 14.0, com: [0, 55, -1975] },
  exhaust_system: { m: 2.5, com: [337.5, 157.5, -2665.6] },
  front_suspension_pushrod: { m: 2.6, com: [411, 365, -18] },     // CORR-5 re-derived
  rear_suspension_pullrod: { m: 2.9, com: [370, 220, -3271] },    // CORR-5 re-derived
  wheel_front: { m: 17.0, com: [698.2, 304.84, -10.37] },
  wheel_rear: { m: 20.0, com: [673.8, 201.18, -3308.74] },
  rear_wing_DRS: { m: 7.0, com: [0, 698, -3686] },
  reference_plank: { m: 11.4, com: [0, -5, -1823.1] },
};
export const MODELLED_TOTAL = { m: 216.9, com: [0, 291.6, -1486.3] }; // CORR-5

// ---- §7.2 explosion table: d_W in metres (xp sign convention), window [t0,t1] ----
export const EXPLODE = [
  { body: 'engine_cover_and_sharkfin', dW: [0, 1.20, 0], win: [0.00, 0.16], stage: 'A1' },
  { body: 'rear_wing_DRS', dW: [0, 0.50, -1.50], win: [0.06, 0.22], stage: 'A2' },
  { body: 'nose_and_front_wing_cascade', dW: [0, 0, 1.80], win: [0.10, 0.26], stage: 'A3' },
  { body: 'sidepod_pods', dW: [1.40, 0.10, 0], win: [0.20, 0.36], stage: 'A4', sided: true },
  { body: 'radiator_internals', dW: [0.70, 0, 0], win: [0.26, 0.42], stage: 'A5', sided: true },
  { body: 'wheel_front', dW: [1.00, 0, 0], win: [0.44, 0.62], stage: 'B1', sided: true },
  { body: 'wheel_rear', dW: [1.00, 0, 0], win: [0.44, 0.62], stage: 'B1', sided: true },
  { body: 'front_suspension_pushrod', dW: [0.50, 0, 0], win: [0.44, 0.62], stage: 'B1', sided: true },
  { body: 'rear_suspension_pullrod', dW: [0.50, 0, 0], win: [0.44, 0.62], stage: 'B1', sided: true },
  { body: 'exhaust_system', dW: [-0.08, 0.30, -0.60], win: [0.64, 0.78], stage: 'C1', sided: true },
  { body: 'floor_and_blown_diffuser', dW: [0, -0.80, 0], win: [0.80, 1.00], stage: 'C2' },
  { body: 'reference_plank', dW: [0, -1.20, 0], win: [0.80, 1.00], stage: 'C2' },
  { body: 'monocoque_survival_cell', dW: [0, 0, 0], win: null, stage: 'anchor' },
];
// d_B column of §7.2 as printed (for the table-consistency assert)
export const EXPLODE_dB_PRINTED = {
  engine_cover_and_sharkfin: [0, 1.19941, -0.03769],
  rear_wing_DRS: [0, 0.45264, -1.51497],
  nose_and_front_wing_cascade: [0, 0.05654, 1.79911],
  sidepod_pods: [1.40, 0.09995, -0.00314],
  radiator_internals: [0.70, 0, 0],
  wheel_front: [1.0, 0, 0], wheel_rear: [1.0, 0, 0],
  front_suspension_pushrod: [0.5, 0, 0], rear_suspension_pullrod: [0.5, 0, 0],
  exhaust_system: [-0.08, 0.28100, -0.60912],
  floor_and_blown_diffuser: [0, -0.79961, 0.02513],
  reference_plank: [0, -1.19941, 0.03769],
  monocoque_survival_cell: [0, 0, 0],
};
export const GROUND_LIFT = 1.20; // §7.5 Λ [m]

// ---- §5.x bounding boxes stated by the spec ([minx,miny,minz,maxx,maxy,maxz], mm; sided bodies = _xp) ----
export const BBOX_SPEC = {
  monocoque_survival_cell: [-300, 60, -2000, 300, 665, 350],
  nose_and_front_wing_cascade: [-850, 75, 350, 850, 640, 1175],          // CORR-2
  engine_cover_and_sharkfin: [-270, 320, -3450, 270, 950, -1250],
  sidepod_pods: [180, 75, -2850, 680, 580, -1150],
  radiator_internals: [281.7, 178.1, -2030.3, 598.3, 481.9, -1409.7],
  floor_and_blown_diffuser: [-700, 0, -3658.74, 700, 125, -340.37],      // CORR-1
  exhaust_system: [96, 69, -2968.3, 625, 235, -2254.3],
  front_suspension_pushrod: [105, 222, -295, 662, 617, 227],           // CORR-5
  rear_suspension_pullrod: [105, 97, -3558, 638, 350, -2926],           // CORR-5
  wheel_front: [552.5, -25.16, -340.37, 897.5, 634.84, 319.63],
  wheel_rear: [512.5, -128.82, -3638.74, 887.5, 531.18, -2978.74],
  rear_wing_DRS: [-375, 330, -3890, 375, 950, -3490],
  reference_plank: [-150, -10, -3308.74, 150, 0, -340.37],
};
