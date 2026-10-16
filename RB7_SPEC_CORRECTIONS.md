# RB7 spec corrections — rulings on the handoff conflicts

**Applies to:** [rb7_math_spec.md](rb7_math_spec.md), as built in [rb7_threejs.html](rb7_threejs.html). **Answers:** [RB7_HANDOFF.md](RB7_HANDOFF.md) §4–§8.
**H_D stays locked at 125.** Every value below was applied to a copy of the builder's module sources and re-verified with the builder's own code: the node harness, then the rebuilt page in headless Chrome. Result: **§8: 11/11 asserts · 0 flagged (0 interferences)**. The sweep covers 190 pairs, Δt = 0.005, certified to 0.5 mm, and finds no unexplained contacts (§10).

## 0. Summary of changes

| # | Spec § | Change | Kind |
|---|---|---|---|
| 1 | §5.6, R9, §8.4 | Diffuser airflow surface rescaled to 117. Panel top (y_r + 8) ≤ 125 | regulation reading |
| 2 | §5.2 | FW endplate made parallel to Z: outer face x = 850, inner face x = 840. TE moved to z = 400 | [CHOICE] changed |
| 3 | §5.3 | Cover y_bot 645 → **659** at z = −1250 and 635 → **651** at z = −1500 | [EST] stations |
| 4 | §5.8 | Pushrod slot locus and radius corrected. Track-rod hole 30×30 → **50 (z) × 30 (y)** | derived value fixed |
| 5 | §5.8, §5.9, §5.10 | Front upper wishbone −30 in y, TRo moved. Rear upper wishbone + PLo −65 in y, TLo and TLi moved. Disc offsets −50 / −40 | [CHOICE ±15] hardpoints |
| 6 | §5.4, §5.6 | F3 foil defined | new definition |
| 7 | §8.9 | Designed-contact list confirmed. Suspension tolerance tightened to 12 mm | ruling |
| 8 | §8.9, §7.3 | Expected-clearance table replaced with values measured on the built meshes | table fix |

Nothing else changes: no regulation value, station, section or explosion vector outside this list. The builder's readings of the ambiguities in handoff §5 (pylons, struts, plank, tessellation, etc.) stand as built.

---

## 1. Diffuser roof vs R9 (A4s)

**Ruling: the 125 cap applies to the top of the diffuser bodywork, not to its airflow surface.** A bodywork height limit is a limit on material, and scrutineering measures the part. An 8 mm panel whose top is at 133 puts 8 mm of bodywork above the limit. Note (b) still limits R9's scope to the diffuser zone (|x| ≤ 490, z ∈ [Z_RA − 350, Z_RA]), so the rear wing, crash structure and cover stay outside it.

**Replacement §5.6 diffuser definition**

```
t_D      = 8                                   roof panel thickness (unchanged)
y_r(x,z) = y0(x) + (H_D − t_D − y0(x))·ρ(s),   ρ(s) = 2s² − s³   (airflow surface, max 117)
panel    = [y_r, y_r + t_D]                    still offset upward, so the airflow side stays C¹ with the floor
max top  = H_D = 125 at s = 1 (z = −3658.74)
```

- **Central channel:** rise 117, mean slope 18.5°, maximum 24.0° (was 125 / 19.7° / 25.5°).
- **Outer channels:** rise 67, mean slope 10.8°, maximum 14.3° (was 75 / 12.1° / 15.9°).
- **Fences and sidewall:** rule unchanged (y = 0 up to the local y_r), so their tops are now ≤ 117.
- **Floor bounding box:** y ∈ [0, **125**] (was 133).
- **§2.2 "Diffuser exit roof" row:** the airflow surface is now y = 117, which is 256.9 above ground. The panel top stays at 125 / 264.9.
- **§8 assert 4** becomes: panel top y_r + t_D ≤ H_D (strict R9), plus the existing single-connected-polyline check. The builder's A4s becomes the A4 test. Margin is 0 by construction.

**Re-checks** (measured)

| Check | Before | After |
|---|---|---|
| A4 / A4s | 125.0 / **133.0 FAIL** | y_r max 117.000, panel top 125.000 — **PASS** |
| R10: components per z-section (21 slices) | 1 | 1 |
| LR_R underside 140 vs outer roof top at s = 0.489 (spec's vertical method) | 54.9 | **57.8** (roof top 82.2) |
| Rear LW legs ↔ roof slabs, 3D minimum | 51.17 | **54.67** |
| TLi underside 158 vs outer roof top (TLi now at z = −3540, s = 0.661) | 67.5 | **60.8** vertical; 3D 58.5 |
| Inboard pickups over the central channel | ≥ 74 | **≥ 81.6** |
| Rear suspension ↔ floor body, whole timeline | — | ≥ 37.5 (PLi over the floor top) |
| Rear LW legs ↔ diffuser sidewall during B1 | "59" | 61.8 |
| Exhaust ↔ diffuser during C1 | top ≤ 133 | ≥ 167 |

Remove the "H_D = 175" column from the §5.9 clearance table and the [REG-CHECK] item in §9: H_D is locked.

## 2. Front-wing elements vs endplates (R11)

**Ruling: move the endplate.** R11 is [BRIEF] and stays literal (elements |x| ≤ 840). The 6.28° toe-out was a [CHOICE], and it is what opened the gap. A toed plate cannot meet straight element tips anywhere except at one station. The gap was not designed, so there is no "gap treatment".

**Replacement §5.2 endplate**

| Item | Old | New |
|---|---|---|
| Outer-face plan line | (840, 985) → (900, 440) | **(850, 985) → (850, 400)**, parallel to Z |
| Thickness | 10, inboard | 10, inboard, so the **inner face is x = 840**, coincident with the element tips |
| Outline in (s, y), s from the LE | length 548.3: (0,75)→(0,275)→(548.3,275)→(548.3,140)→(480,75) | **length 585: (0,75)→(0,275)→(585,275)→(585,140)→(516.7,75)** (same 68.3 × 65 chamfer) |
| Footplate (60 wide inboard) | slanted | **x ∈ [780, 840]**, y ∈ [75, 80], z ∈ [700, 985] |
| Elements, cascades, struts | — | unchanged. Tips now meet the plate along the whole chord, so the "trimmed at endplate inner faces" clause is a no-op |

The TE moves from 440 to 400 so the plate covers flap 2's TE (z = 405.1), which used to overhang the plate by 35 mm.

**Re-checks:** element-tip gap (R11x) is **0.0** at all five TEs (was 17.8–53.8). R11: elements 840, endplate 850 (margin 50). R1 / A3: max |x| is now the front tyre at 897.5 (margin 2.5). R4 is unchanged (LE z = 985, margin 4.6). R14 is unchanged (75 ≤ y ≤ 275). Endplate ↔ front tyre is **88.3** (3D, static; was "120 at hub height" against the old TE at 440). Flap 2 ↔ tyre is 87.5, unchanged. Nose body ↔ front wheel minimum over the whole timeline is 87.5, at t = 0 (A3 only opens it). Nose bounding box: x ∈ [**−850, 850**].

## 3. Cover skirts vs monocoque (§5.3)

**Ruling:** two y_bot values change. a, y_s, y_top and n are unchanged, so the roof shape and plan line are untouched.

| z | a | y_s | y_bot | y_top | n | Note |
|---|---|---|---|---|---|---|
| −1250 | 150 | 700 | **659** (was 645) | 950 | 2.5 | airbox face bottom edge 8.3 above the monocoque crown (650.7) |
| −1500 | 230 | 660 | **651** (was 635) | 948 | 3.0 | skirt **23.8** above the skin (627.2 at x = 230; the old text's 626.9 was a slip) |

Don't solve this by adding a station between them. A station on the existing y_top line adds a collinear vertex to the shark-fin outline (§10, note 2).

**Re-checks** (skirt bottom minus monocoque skin at x = a(z), linear interpolation, z every 5 mm over [−1250, −2000]):

| z | −1250 | −1300 | −1350 | −1390 (min) | −1450 | −1500 | −1600 | −1750 |
|---|---|---|---|---|---|---|---|---|
| vertical gap | 13.0 | 10.3 | 8.6 | **8.15** | 9.4 | 23.8 | 21.4 | 27.1 |

- **3D on the built meshes:** canopy ↔ skin **7.77**, airbox face ↔ skin 9.35. The two UNEXPLAINED contacts are gone. A1 is pure +Y, so these only grow.
- **Rear-suspension pickups (§5.3 / §5.9):** cover stations behind −1500 are unchanged. Centre-to-skirt lateral clearances stay 28.9 / 47.7. The member-surface clearance (with item 5's lowered UW) is **16.42** static and 16.40 minimum during A1.
- **Cover ↔ pod designed contact:** still present at z = −2300 / −2550 / −2850, and only at t = 0.
- **Airbox inlet:** unchanged (y 775–925).

## 4. Chassis openings (§5.8)

**Pushrod slot.** Remove the skin (both sides, via |x|) within **26 mm** of the segment:

- **a = (199.7, 547.3, −71.7):** the true δ = 0 crossing of the pushrod centreline. The stated (197, 561, −73.5) is not on the rod line.
- **b = (179.5, 610.0, −80.0):** where PRi crosses the skin after δ = 69.5 mm of +X travel.

Motion is pure +X, so the swept footprint is the rod's (y, z) shadow along the skin curve a→b. Shadow half-width is 19.8. The chord a→b sags up to 3.4 mm from the skin, so r ≥ 19.8 + 3.4 + margin; r = 26 gives ≥ 5. Update §5.8's derived-geometry row to "Pushrod skin crossing (199.7, 547.3, −71.7)".

**Track-rod hole.** A **rectangle 50 (z) × 30 (y)** centred at **(183, 410, 110)**, cut where |x| > 120. With item 5's TRo the centreline crossing is (183.4, 409.6, 109.4), within 0.6 mm of the centre. The rod is within 2.3° of X, so its shadow is constant through the travel: an ellipse 36 (z) × 14 (y), stretched ≈ 0.4 mm by the skin slope. Margins are ≈ 7 in z and 8 in y. The builder's cut uses one half-size; it needs separate hz = 25 and hy = 15.

**Re-checks** (built meshes, t = 0 and every Δt = 0.0005 through B1):

| Opening | Static | Minimum through the +X travel | Before |
|---|---|---|---|
| Pushrod slot (r = 26) | **5.94** | **5.39** at t = 0.4726 (δ ≈ 43 mm) | intersects to 17.1 mm travel |
| (r = 25 for reference) | 4.96 | 4.39 | |
| Track-rod hole 50 × 30 | **6.23** | **6.23** (rod exits after ≈ 13 mm) | 30×30 intersects (36×36 intersects, 40×40 = 1.5) |

After exit, rod points outboard of the skin only move further outboard, because each (y, z) line crosses the skin once per side.

## 5. Wheel envelope vs suspension (§5.8–§5.10)

**Ruling: move hardpoints.** The two alternatives don't work:

- **Larger rim radii:** the 160/165 barrel is already at the 13″ bead-seat radius (165.1).
- **Slimmer sections:** the front UW rear leg's *centreline* is at r = 160.6 and the rear UBJ sits 190 from the axle inside the tyre. No section fixes a centreline outside the barrel.

The upper wishbones are moved as **rigid translations in y**, so the leg inclinations and everything inboard keep their geometry. The disc offset fixes the two LW ↔ disc near-misses.

**Front (§5.8)**, WC_F = (725, 304.84, −10.37):

| Point | Old | **New** |
|---|---|---|
| UBJ | (625, 454.84, −30.0) | **(625, 424.84, −30.0)** (r = 121.6 from the axle) |
| UF / UR | (200, 470, 200) / (240, 475, −250) | **(200, 440, 200) / (240, 445, −250)** |
| TRo | (630, 399.8, 94.6) | **(630, 394.8, 89.6)** (r 141.6 → 134.5) |
| Disc centre (§5.10) | WC.x − 60 | **WC.x − 50** (x = 675) |
| LBJ, LF, LR, PRo, PRi, TRi, all sections | | unchanged |

**Rear (§5.9)**, WC_R = (700, 201.18, −3308.74):

| Point | Old | **New** |
|---|---|---|
| UBJ_R | (610, 391.18, −3308.74) = WC + (−90, +190, 0) | **(610, 326.18, −3308.74)** = WC + (−90, **+125**, 0) |
| UF_R / UR_R | (140, 400, −3050) / (130, 405, −3420) | **(140, 335, −3050) / (130, 340, −3420)** |
| PLo | (600, 366.18, −3318.74) | **(600, 301.18, −3318.74)** (moves with the UW outer node) |
| TLo | (615, 141.18, −3428.74) | **(615, 151.18, −3413.74)** = WC + (−85, −50, −105) |
| TLi | (125, 165, −3500) | **(125, 165, −3540)** (see the intra-body row below) |
| Disc centre (§5.10) | WC.x − 55 | **WC.x − 40** (x = 660) |
| LBJ_R, LF_R, LR_R, PLi, all sections | | unchanged |

**Re-checks: member ↔ own wheel** (BVH, static and over the B1 relative slide δ = 0…150 mm. The B1 minimum equals the static value for every pair, because the wheel only moves away):

| Front pair | Before | **After** | Rear pair | Before | **After** |
|---|---|---|---|---|---|
| UW rear leg ↔ rim | 0 (intersects) | **8.35** | UW front leg ↔ tyre / rim | 0 / 7.3 | 44.4 / **8.27** |
| UW front leg ↔ rim | 0 | **26.2** | UW rear leg ↔ tyre / rim | 0 / 5.8 | 44.6 / 19.3 |
| Track rod ↔ rim | 1.63 | **7.76** | Toe link ↔ rim | 0 | **6.37** |
| LW front leg ↔ disc | 1.06 | **6.66** | Pullrod ↔ rim | 0 | 51.9 |
| LW rear leg ↔ disc | 2.80 | **5.74** | LW front leg ↔ disc | 0 | **8.49** |
| UW rear leg ↔ caliper | 10.3 | **5.12** | LW rear leg ↔ disc | 1.31 | **15.95** |
| | | | Pullrod ↔ upright | — | **6.61** |

- **Maximum member radius inside the rim** (analytic, full elliptical surface and end caps): front **152.2** (track rod at the rim edge), rear **153.5** (toe link), against the 160 barrel. Members between the tyre's inboard face and the rim edge keep ≥ 49.6 (front) / 52.8 (rear) from the tyre bore. Replace §5.8's "radius 157.2" sentence and §7.4 B1's "r ≤ 157.2" with these.
- **Designed member ↔ upright contacts** end after **9.8 mm** of relative travel at both corners. That matches the §5.10 separation-rule bound: 30·max|m̂_x| − 5 = 9.9.

**Re-checks: inside each suspension body** (not covered by the pairwise sweep; the builder could not have seen these):

| Pair | Spec claim | Old build | **New** |
|---|---|---|---|
| Rear LW rear leg ↔ toe link | ≥ 81 | **0 — intersecting** (LR_R and TLi pickups only 25 apart) | **15.6** (fixed by TLi z −3500 → −3540) |
| Front UW front leg ↔ track rod | ≥ 55 | 41.2 | 13.5 (surface) |
| Front pushrod ↔ LW rear leg | — | 0 | 0 — **designed**: PRo is the LW outer node, on top of the rear leg |
| Rear pullrod ↔ UW legs | — | 8.4 | 8.1 (attachment region at the UW outer node) |
| Rear pullrod ↔ LW legs | ≥ 120 | 39.0 | 35.2 (surface; the 120 was pickup-to-pickup) |
| Rear pullrod ↔ toe link | ≥ 110 | 216.9 | 156.6 |
| Front pushrod ↔ UW legs / track rod | ≥ 127 to track rod | 65.9 / 115.1 | 49.9 / 111.6 |

**R12 / A5:** sections are unchanged (60×20, 40×16, 36×14 → maximum chord 60, maximum AR 3.0) and m̂·Ŷ = 0 by construction. The rigid translations leave the wishbone inclinations unchanged:

- Front: UW 1.80° / 2.60°, LW 3.76° / 3.93°.
- Rear: UW 0.94° / 1.61°, LW 2.76° / 3.13°.
- All ≤ 5°. The spec's printed 1.82 / 2.56 / 3.75 / 3.96 were rounding slips in the original as well.

**Replacement derived-geometry rows**

| Quantity | New value |
|---|---|
| Front kingpin LBJ → UBJ | (−20, 192.84, −25): KPI **5.92°**, caster **7.39°** in B (**9.19°** in W) |
| Front kingpin ground point | x = 671.7, z = +28.3 → scrub radius **53.3**, mechanical trail **28.3** |
| Pushrod | length 633.8 (unchanged). At y = 432 it is at z = −56.5, between the UW legs (+111.2 / −179.1) |
| Track rod | length 460.7, 1.89° |
| Rear kingpin LBJ_R → UBJ_R | (−10, 205, −10): KPI **2.79°** |
| Pullrod | length **583.7**, **22.0°** below horizontal in front view (was 28.3°), swept 258.7 forward (28.1°). At y = 135 it passes through the LW A-frame at z = −3099.6 (legs at −2989.0 / −3456.5) |
| Toe link | length 506.2, 1.56°, 14.5° rearward in plan |

**Masses (§5.8, §5.9, §6.1, A8).** The suspension CoMs are [DERIVED] from member midpoints, so they move:

| Body | Old CoM_xp | **New CoM_xp** |
|---|---|---|
| front_suspension_pushrod | (411, 376, −18) | **(411, 365, −18)** (exact 411.35, 365.07, −18.29) |
| rear_suspension_pullrod | (370, 248, −3270) | **(370, 220, −3271)** (exact 370.00, 219.56, −3270.84) |

- **Modelled total:** 216.9 kg, **CoM_B = (0, 291.6, −1486.3)**, with Σm·y = 63 243.8 and Σm·z = −322 379.4. A8 measured (0, 291.580, −1486.304).
- **§6.1 W-frame CoM:** y_W = 338.1 (363.1 above ground), z_W = −1475.6.
- **§6.2:** f = 0.553, unchanged. **§6.4:** drift unchanged (no mass or d change).

**Bounding boxes** (built meshes, _xp):

- Front suspension: x [105, 662], y [222, 617], z [−295, 227].
- Rear suspension: x [105, 638], y [97, 350], z [−3558, −2926].
- Wheels: unchanged.

**Explosion (B1) and neighbours.** Nothing else in the sweep comes within 15 mm of the moved members:

- Exhaust ↔ rear suspension: 13.35 at t = 0.559 (B1) and 12.68 in C1, both unchanged (LW legs unchanged).
- Lowered rear UF_R / UR_R: 15–20 above the optional gearbox proxy top (310), 150 from the beam wing.

## 6. F3 foil

**Ruling: defined (owner §5.4).** Add to §5.4:

> **F3 (pod underside heat shield).** The outer C-shell surface on the lower lobe, φ ∈ [−π/2, 0], for z ∈ [−2300, −2750] (the exhaust tunnel, where the pipe runs under the pod for u ≈ 0.05–0.6). It is offset 0.5 outward along the surface normal (same lift as F1/F2), single sheet, open edges. Owned by `sidepod_pods`, mirrored to `_xn`, and moves with the pod (A4). Mass is inside the pod's [EST ±1].

In §5.6, change the F3 line to "F3 (pod underside, §5.4)".

**Re-checks:**

- Exhaust ↔ pod, static and through A4: **20.05** (was 20.53; the foil takes 0.5). This is the "Exhaust ↔ pod lower edge" row.
- Radiator: unaffected (F3 is outside the shell, ≥ 287 away).
- Pod ↔ floor: 15.0, unchanged (F3 starts at z = −2300, where Y_b ≥ 215).

## 7. Designed contacts (confirmed)

All the listed contacts are as designed. Allowed relative travel before the contact must end:

| Bodies | Parts | Why | Allowed travel | Measured |
|---|---|---|---|---|
| monocoque ↔ nose | skin ~ nose_cone | shared z = 350 station (seamless joint) | 0 | contact only while both static (t ≤ 0.10) |
| cover ↔ pods | canopy ~ shell | skirt = pod top inner edge at z = −2300 / −2550 / −2850 | 0 | t = 0 only |
| floor ↔ plank | strip walls, central roof at s = 0, fence_150 ~ plank | strip underside y = 0 on the plank top | 0 | separates at once in C2 (the plank is faster) |
| monocoque ↔ floor | skin ~ strip_top_plate | monocoque underside y = 60 closes the strip box | 0 | static until C2 |
| suspension ↔ own wheel | member ends ~ upright; trackrod ~ steering_arm; toelink ~ toe_arm | ball joints carried by the upright; the flat end caps overlap the slab | **≤ 12 mm** (tighten from 30) | 9.8 (bound 9.9) |

**Designed proximity, not contact (no flag):**

- **Front UR end cap ↔ skin: 2.82.** Chassis-bracket zone (brackets not modelled); opens in B1.
- **Pod lower lip ↔ monocoque: 2.32** (C9). Static, opens in A4.
- **Pushrod lower end on the LW rear leg at PRo.** Intra-body attachment.

Any other touching pair stays UNEXPLAINED. After these corrections the sweep has none.

## 8. The five clearances below the spec table

| Row | Spec | Measured now | Ruling | New §8.9 value |
|---|---|---|---|---|
| Radiator ↔ pod undercut | 21.2 | 16.33 | **Method.** The spec measured vertically to the outer pod surface at one corner; the built value is the 3D distance to the inner skin (3 mm wall). Geometry correct. | **16.3** |
| Cover skirt ↔ rear UW pickup | 28.9 | 16.42 (17.82 before item 5) | **Method.** 28.9 is pickup centre to skirt plane; the 60-chord end cap reaches 14.5 closer. 28.9 stays as the centre value in §5.3 / §5.9. | **16.4** |
| Rear LW ↔ diffuser roof | 54.9 | 54.67 (51.17 before item 1) | **Method.** 54.9 is a vertical gap at the LR_R station; the 3D minimum to a sloped roof is smaller. Item 1 lowered the roof top by 8ρ(s). | **54.6** (vertical at LR_R: 57.8) |
| Exhaust lip ↔ panel top | 8.9 | 8.93 bare / 6.49 as built | **Method.** 8.9 excludes the F4 sleeve (+2) and the F2 foil (+0.5). | **8.9** bare **and 6.4** as built (two rows) |
| Exhaust ↔ exploded rear LW leg (C1) | 14 | 12.68 at t = 0.674 | **Spec error, not method.** The §7.3 "≥ 14" overstates it. Above the 2 mm stop, so no geometry change; d_x = −0.08 stays. | **12.6.** Add the B1 pass: **13.3** at t = 0.559 |

In §7.3 / §7.4, replace "≥ 14 mm" with "≥ 12.6 (C1); 13.3 as the B1 legs slide past the exit".

**Replacement §8.9 table** (all values are minimum 3D surface distances on the built meshes, rounded down to 0.1 mm):

| Pair | Expected minimum | When |
|---|---|---|
| Rim barrel ↔ front UW rear leg | **8.3** | t = 0.44 (start of B1) |
| Exhaust lip ↔ panel top (pipe + collector) / as built (sleeve + foil) | 8.9 / **6.4** | static |
| Floor ↔ rear tyre | **15.3** | static |
| Exhaust ↔ exploded rear LW leg | **12.6** (12.7 at e ≈ 0.15) | C1, t ≈ 0.674 |
| Exhaust ↔ rear suspension (B1 pass) | **13.3** | t ≈ 0.559 |
| Exhaust ↔ pod lower edge (incl. F3) | **20.0** | static and A4 |
| Radiator ↔ pod undercut | **16.3** | static, then growing |
| Radiator ↔ monocoque | **26.1** | static |
| Exhaust lip ↔ rear tyre | **34.7** (the old 26.3 was an in-plane z-gap) | static |
| Cover skirt ↔ rear UW pickup | **16.4** | static (16.4 during A1) |
| _xp ↔ _xn exhaust | **36.3** (the built collector reaches x = 98.2, not 96) | t = 1 |
| Rear LW ↔ diffuser roof | **54.6** | static |
| FW flap 2 ↔ front tyre | **87.4** | static |
| *new:* cover ↔ monocoque | 7.7 | static |
| *new:* pushrod ↔ chassis slot | 5.9 / 5.3 | static / through B1 |
| *new:* track rod ↔ chassis hole | 6.2 | static and B1 |
| *new:* FW endplate ↔ front tyre | 88.2 | static |
| *new:* closest member ↔ own wheel, front / rear | 5.1 (UW rear leg ↔ caliper) / 6.3 (toe link ↔ rim) | static = B1 minimum |

## 9. Other handoff items (C7–C10)

- **C7.** Resolved by item 8: new values 12.6 / 13.3.
- **C8.** Caliper (r to 165) and upright slab inside the barrel: **accept as proxy geometry.** They are intra-body and sit inside the tyre, so they are invisible. Optional: caliper r ∈ [95, **155**].
- **C9.** Pod lower lip 2.32 from the monocoque at z = −1150: **accept.** It is static, opens in A4 and is above the stop. Add it to §5.4's inboard-gap note.
- **C10.** R15's 730–950 box governs the upper wing elements (main plane and flap) only [REG-RECALL]. The endplates and beam wing are outside it, so **report R15x as INFO, not FAIL.**

## 10. Builder notes and verification

**Code changes beyond constants** (the HTML's spec, bodies and verify sections):

1. `diffuserRoofY`: `y0 + (K.HD − FLOOR.roofThick − y0)·ρ(s)`.
2. Track-rod hole cut: separate `hz = 25`, `hy = 15` (it currently has one `half`).
3. New pod part `foil_F3` per §6.
4. A8 expected CoM read from `MODELLED_TOTAL`, which becomes (0, 291.6, −1486.3).
5. A4 tests the panel top.
6. `DESIGNED_CONTACT` suspension `tol` 30 → 12.
7. R15x → info.
8. The §8.9 expected values above.

**Phantom-distance warning (pre-existing, not a spec issue).** three-mesh-bvh `closestPointToGeometry(shark_fin, skin)` returns **0** whenever maxThreshold ≥ 100. The true gap is ≈ 200 mm; at 15 or 30 it correctly returns "none". The page sweep uses 15, so the report is unaffected. Don't add a large-threshold named clearance involving the fin without a part-level cross-check. The same effect appears if a cover station is added on the existing y_top line, which is why item 3 changes y_bot only.

**Verification log.** These checks were run on a patched copy of the builder's module sources:

- 11/11 asserts.
- R11x gap 0.0.
- Sweep: 190 pairs, 696 queries, no unexplained contacts.
- Rebuilt page in headless Chrome: "§8: 11/11 asserts · 0 flagged (0 interferences)", no console errors.
- Remaining clearances under 5 mm, all above the 2 mm stop: UR end cap ↔ skin 2.82, pod lip ↔ monocoque 2.32.

**Applied 2026-10-15** to both repo files:

- [rb7_math_spec.md](rb7_math_spec.md): surgical edits in §1–§3, §5.2–§5.10, §6.1, §7.3–§7.4, §8 (new §8.10 for designed contacts) and §9, plus a revision note at the top.
- [rb7_threejs.html](rb7_threejs.html): rebuilt with the builder's esbuild pipeline from the patched module sources. The pipeline was confirmed deterministic: the original sources rebuild byte-identical to the previous HTML.

The page also carries the eight code changes above, seven new §8.9 rows, and refreshed interpretation-log notes. Its report heads the allow-list "spec §8.10". In headless Chrome it shows "§8: 11/11 asserts · 0 flagged (0 interferences)", with no console errors.

In the page, the strict-R9 assert is now **A4** (panel top) and the airflow-surface check is **A4a**.
