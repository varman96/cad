# RB7 Three.js build — handoff note

> **Superseded (2026-10-15).** This note describes the first build: 10/11 asserts, with conflicts C1–C10 open. Those conflicts were ruled on in [RB7_SPEC_CORRECTIONS.md](RB7_SPEC_CORRECTIONS.md) and applied to both [rb7_math_spec.md](rb7_math_spec.md) and [rb7_threejs.html](rb7_threejs.html). The page now shows **"§8: 11/11 asserts · 0 flagged (0 interferences)"**. Use this note only for the build history and the controls listed below. Assert results, clearances, conflicts and open questions below are out of date.

**Deliverable:** [rb7_threejs.html](rb7_threejs.html) — one file, Three.js r160 + three-mesh-bvh 0.7.3 through a CDN importmap (needs network on first load).
**Built only from** [rb7_math_spec.md](rb7_math_spec.md). No hardpoint, station, dimension or regulation value was changed; every [CHOICE] is as printed.

Controls: `Space` play/pause · `R` reverse (assembly = same law backwards) · slider scrubs · `D` DRS · `F` frame all · top-right badge opens the §8 report (flagged items, asserts, measured clearances, sweep, interpretation log). Console carries the same pass/fail lines.

## 1. Outcome

- 20 rigid bodies (`_xp`/`_xn` by sign, mirrored with `scale.x = −1`), one raked root (`M_rake`, §7.1 option 2), teardown A1→C2 with the exact §7.2 windows and smoothstep, scrub bar + play, DRS toggle, camera target follows the §6.4 CoM drift, ground = fade by e(s_C2) **or** root lift Λ = 1.20 m (switchable).
- **10 of 11 runtime asserts pass.** The failing one (A4s) is a conflict inside the spec. The pairwise sweep runs for all 190 body pairs and **finds 4 interference groups, 3 sub-2 mm near-misses and 5 clearances below the spec's table** — all flagged in red, none fixed by me (§4).
- Because several of these are contradictions between spec values, per the prime directive I did **not** move any hardpoint or resize anything. Decisions needed are in §4 and at the end of §5.

## 2. §8 assert results (as run on load)

| ID | Check | Result | Measured |
|---|---|---|---|
| A1 | `M_rake·(0,0,−3300,1).y = 103.643 ± 0.001`; pivot fixed | PASS | 103.6432 mm |
| A2 | wheel centres in W; every tyre lowest point y_W = −25 ± 0.01 | PASS | (±725, 305, 0), (±700, 305, −3300); lowest y_W −25.000 |
| A3 | envelope at t=0 | PASS | max\|x\| 900.000 · max y 950.0000 · max z 1175.000 (≤ 1189.63) · max z at \|x\|>200 985.000 (≤ 989.63) · min z −3890.000 (≥ −3908.74) |
| A3b | **dedicated** y ≤ 950.0 (double *and* float32 render buffers) | PASS | 950.000000000; float32 949.999988. Zero-margin surfaces: cover ridge, shark-fin top, **rear endplate top** (also 950) |
| A4 | diffuser roof y_r ≤ H_D = 125; every z-section one connected polyline | PASS | max y_r 125.000000; 1 component in all 21 slices (raster flood-fill of the built mesh) |
| **A4s** | strict R9: highest diffuser panel surface ≤ 125 | **FAIL** | **133.000** (roof top = y_r + 8, spec's own bbox) — see C1 |
| A5 | members: m̂·Ŷ = 0, chord ≤ 100, AR ≤ 3.5, wishbones ≤ 5° | PASS | 0 · 60 · 3.00 · 3.93° |
| A6 | nose section at z=1125 ≥ 9000 mm² (sliced from the built mesh) | PASS | 11 286 mm² |
| A7 | DRS gap(0)=12±1, gap(δ_open)=50±0.5, flap y ≤ 950 | PASS | gap(0) 11.845 · **δ_open 17.808°** by bisection on the tessellated surfaces (the spec's first-order estimate 15.1° is 2.7° low) · flap max y 927.7 |
| A8 | Σm = 216.9 kg, CoM_B = (0, 292.6, −1486.3) | PASS | 216.900 kg · (0, 292.593, −1486.278) |
| A0 | d_B = R_x(−θ)·d_W reproduces the §7.2 d_B column | PASS | worst 7.2e-6 m (printed exhaust d_B,z −0.60912 is a truncation of −0.609127) |

## 3. Measured clearances (§8.9) — all computed at runtime from the built meshes (mm)

| Pair | Spec | Measured | When | Note |
|---|---|---|---|---|
| Rim barrel ↔ front UW rear leg | 2.8 | **0.00 — intersects** | t = 0.44 | C5 |
| Exhaust lip ↔ panel top | 8.9 | 8.93 (pipe+collector vs panel) · **6.49 as built** | static | spec ignores the 2 mm F4 sleeve and 0.5 mm F2 foil |
| Floor ↔ rear tyre | 15.5 | 15.34 | static | |
| Exhaust ↔ exploded rear LW leg | 14 | **12.68** | t = 0.674 (e≈0.15: 12.78) | audit item 3: not 14. Also 13.35 at t = 0.559 (B1: legs slide past the exit — not considered by the spec) |
| Exhaust ↔ pod lower edge | 19.8 | 20.53 | static, A4 | |
| Radiator ↔ pod undercut | 21.2 | **16.33** | static | spec: vertical gap to the *outer* surface; built shell has the 3 mm wall and this is a normal distance |
| Radiator ↔ monocoque | 26.2 | 26.10 | static | |
| Exhaust lip ↔ rear tyre | 26.3 | 34.76 | static | spec value is an in-plane z-gap |
| Cover skirt ↔ rear UW pickup | 28.9 | **17.82** | static | spec value is to the hardpoint centre; the 60-chord member end is 14.5 mm closer |
| _xp ↔ _xn exhaust | 32.6 | 36.39 | t = 1 | spec bbox x_min 96, built 98.2 |
| Rear LW ↔ diffuser roof | 54.9 | **51.17** | static | spec: vertical gap to roof top |
| FW flap 2 ↔ front tyre | 87.6 | 87.47 | static | |

**Sweep:** 190 pairs × 201 samples (Δt = 0.005) with BVH `intersectsGeometry` + `closestPointToGeometry`; the intervals *between* samples are certified by the Lipschitz bound (relative motion is pure translation) and refined where it could not certify. Contacts at t=0 that the spec describes as by-design (nose joint, cover skirts on pod tops, monocoque underside/strip box, plank under the strip, ball-joint ends in the upright) are listed in an allow-list **that is my interpretation** and shown in the report. Everything else touching is "UNEXPLAINED" (C3–C6).
Static part-level scan at t=0 under 2 mm (not touching): `lw_front_leg↔disc` front 1.06 · `lw_rear_leg↔disc` rear 1.31 · `trackrod↔rim` front 1.63. Also monocoque↔pod 2.32 (C9). Per the brief's rule these are flagged "stop" — hardpoints not moved.

## 4. Spec conflicts that need a decision

| # | Where | Finding (measured on the built geometry) | Decision needed |
|---|---|---|---|
| C1 | §5.6 vs R9 / audit #1 | Roof lower surface hits exactly 125, but the 8 mm panel is "offset upward" so the physical top is **133** (the spec's own bbox says 133). | Is the 125 cap on the airflow surface (leave) or on any bodywork (thickness must go down, or y_r max = 117)? |
| C2 | §5.2 vs R11 | Elements stop at \|x\|=840; the toed-out plate's inner face is at 829.9 + 0.110·(985−z). Aft of z≈894 element tips float: main TE **22.8**, flap 1 **42.6**, flap 2 **53.8**, C1 17.8, C2 24.1 mm off the plate. Extending them breaks R11 literally. | Extend to the plate (relax R11 reading) or move the plate plan line? |
| C3 | §5.3 vs §5.1 | Cover skirt bottom dips **below** the monocoque skin: −1.0 mm at z=−1250 (airbox face), −6.8 at −1375, **−7.0 at −1400**, −6.2 at −1450. The spec only checks z=−1500 (+7.8). | Which stations to change (y_bot of the cover or y_top of the monocoque)? |
| C4 | §5.8 chassis openings | (a) The pushrod centreline meets the skin at **(199.7, 547.3, −71.7)**, not (197, 561, −73.5); a r=25 slot about the stated segment still intersects the rod (r=30 clears by 2.6; r=25 about the true locus clears by 4.9). (b) Track-rod hole is centred correctly but 30×30 < rod chord 36 (36×36 intersects; 40×40 clears by 1.5). | Slot centre/radius and hole size. |
| C5 | §5.8 | UW rear leg centreline radius at the rim inboard edge (x=572.5) is **160.6**, not 157.2 (front leg 152.1); with the 60×20 section the outer radius is **173.0** vs barrel 160/165 and flange 177. Legs intersect the rim until the wheel has slid ≈ 63 mm (t≈0.48). | Hardpoints, member sections or rim radii. |
| C6 | §5.9 vs §4.7/§5.10 | UBJ_R is **190** from the axle — inside the tyre section (bore radius 179.9 at that x). Rear UW legs ✕ tyre, LW front leg ✕ disc, pullrod ✕ rim, toe link ✕ rim, until ≈ 78 mm of relative travel (t≈0.485). The spec makes no rear clearance claim. | Same as C5, rear. |
| C7 | §7.3 | Exhaust ↔ rear LW leg is 12.68 mm in C1 (not 14), 13.35 in B1. Not under the 2 mm stop. | Informational. |
| C8 | §5.6/§5.9 | Intra-body (visible, not in the sweep): caliper block r∈[95,165] pokes through the 160 barrel; upright slab reaches r≈180 and overlaps the disc volume. Built literally. | Informational. |
| C9 | §5.4 | Pod inboard *lower* edge is 2.32 mm from the monocoque at the inlet (z=−1150); the spec only checks the top edge (22.5). | Informational. |
| C10 | R15 | RW endplates (down to y=330) and beam wing (390–426) lie below the 730 box — flagged by the spec itself as [EST]. | Informational. |

## 5. Ambiguities hit and what I did (flagged, built the most literal reading — not silently resolved)

| Item | Spec says | Built | Question |
|---|---|---|---|
| Cockpit / rod openings | "remove every face…", "within 25 mm of the segment" | triangles clipped exactly along the stated implicit boundary (not whole faces); 4 mm local refinement only at the rod openings | OK? |
| Nose tip cap | half-axes (62k, 52.5k) | exponent n = 2.2 of the z=1135 station | n=2 intended? |
| Pylons (FW) | z 800–1000, "y≈127 … y≈308" | between the actual neutral-section surface (flat y=110 ahead of its LE) and the actual nose underside at \|x\|=80 (**337.6**, not 308) | follow surfaces (done) or literal 127–308? |
| Cascade struts | "spanning the element chords… to C2", "6 thick at \|x\|=620, 835" | polygon through C1/C2 chord points and the main-plane upper surface; plates centred on x | outline / centred or face at x? |
| Footplate | 60 wide inboard | measured along the plate normal | |
| Pod wall & lip | wall 3 mm inward, lip radius 8 | inner skin offset along the normal; **lip radius not modelled** (no consistent geometry) | |
| Floor details | walls at \|x\|=150, fences, trough, slot | wall thickness 6 assumed, centred; sidewall inside 490; trough = 8 mm recess + 2 mm floor plate, through-slot with a 3.4 mm jog where they meet; F1/F2 foils as a 2 mm raster of the stated regions | wall thickness / foil as polygons? |
| **F3 foil** | "belongs to §5.4" | **not built** — §5.4 gives no definition | define F3 |
| Exhaust | optional collector; F4 sleeve "+2 mm" | collector **included** (bbox and 32.6 mm assume it); sleeve = last 250 mm of arc grown 2 mm radially; single sheet, ends open | |
| Suspension | "clevis brackets ≤ 35", "free-standing brackets" | **not modelled** (no dimensions); members hardpoint-to-hardpoint, flat caps | |
| Wheels | flange / spokes / arms | flange 5 mm (=barrel wall), spokes 10 mm, arm 20×20, no hub body; centres from the §2.1 formulas, not the rounded table | |
| Rear wing pylon | z −3720…−3600, beam top → main underside | beam wing ends at −3705; flat extension behind it | |
| Plank | 10×10 chamfer, mass 11.4 | chamfer removes the whole 10 mm front face; spec mass ignores it (8 773 061 vs 8 787 300 mm³) | |
| DRS | bisection 10–20° | 17.808° (see A7) | |
| Tessellation | N_φ = 64, ≥ 8 rings between stations | lofts N_φ = 64 with 10 segments per station (9 interior rings); tyre 64×48 with its phase rotated by π−θ so a vertex sits at the world-lowest point (needed for A2); monocoque columns/rings are denser only around the two rod openings | |
| Camber option, §6.3 inertia | optional | not exposed | |
| Livery | stylised decals | generic bull silhouettes (not the trademark artwork), two-tone "Red Bull", red/yellow Pirelli bar, plain text for RENAULT/RAUCH/Infiniti, TOTAL blocks, yellow tip band / endplate faces / cover leading edge | |
| Materials outside the livery list | — | tyres black, rims/discs metal, calipers muted red, exhaust Inconel grey, foils gold, gearbox proxy hidden by default | |

Source note: the HTML is an unminified esbuild bundle of eight small modules (core, spec, bodies, verify, surfaces, livery, app, main); spec-section comments are preserved so it can be edited in place. `H_D`, `h_F`, hardpoints etc. live in the `spec.mjs` section (`K`, `FSUS`, `RSUS`…).

## 6. Provisional values (not verified against the FIA text)

R14–R20 as listed in §3 of the spec (FW height window, RW box, DRS gaps, 1400 floor width, brake disc Ø278×28, nose ≥ 9 000 mm², 640 kg and 291/342 kg — R20 is not load-bearing here); plank hole count/diameter (6 × Ø50) and density; NACA 0010 as the neutral-section stand-in; the 1800 limit reading for tyres (camber option, not exposed); RW endplate/beam-wing extension below 730 [EST]; "50 mm opening" interpretation (§9). **No [REG-CHECK] value remains** (H_D locked at 125).

## 7. Audit corrections applied

1. H_D = 125, hedge removed. 2. Dedicated A3b for y = 950.0 (also reports that the rear endplate top sits at 950.0). 3. §7.3 exhaust clearance not trusted — measured 12.68 mm (above the ~2 mm stop). 4. R14–R20 listed as provisional (§6).

## 8. Open questions

C1 (which surface R9 caps), C2 (elements vs plate vs R11), C3 (cover vs monocoque stations), C4 (slot/hole sizing), C5/C6 (front/rear wheel envelope — hardpoints vs sections vs rim), F3 definition, and whether the contact allow-list in the report is the intended meaning of "designed contact".
