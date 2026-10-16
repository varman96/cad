# RB7 (2011) — Parametric Geometry & Rigid-Body Derivation

Spec for the Three.js implementation stage. Math and construction recipes only — no code, materials or rendering.

**Revision 2026-10-15.** Corrections 1–8 from [RB7_SPEC_CORRECTIONS.md](RB7_SPEC_CORRECTIONS.md) are applied (diffuser panel top under R9, straight FW endplates, cover skirt stations, chassis openings, front/rear hardpoints and disc offsets, F3 foil, designed contacts, §8.9 table). Every value they touch was re-measured on the built meshes.

## 0. Legend and conventions

| Tag | Meaning |
|---|---|
| **[BRIEF]** | Hard constraint taken verbatim from the brief (not re-verified against the FIA text) |
| **[REG-RECALL]** | 2011 regulation value from memory, used where the brief is silent — verify before relying on it |
| **[EST ±r]** | Engineering estimate, uncertainty ±r. No public RB7 drawing exists for it |
| **[DERIVED]** | Follows exactly from other values |
| **[CHOICE]** | Free design choice made to satisfy constraints. Change it, then re-run the §8 asserts |

- Lengths in mm, angles in degrees, explosion vectors in m (as the brief asks). If the scene is in metres, multiply every mm value by 10⁻³.
- **Frame B (body):** origin, axes and units as the brief. All component geometry is authored in B.
- **Frame W (world):** ground-fixed. It coincides with B when θ = 0. Ground plane: `y_W = −h_F`.
- **Sided bodies:** every left/right pair is two rigid bodies (they explode in opposite directions). The right (+X) body is authored. The left one is its mirror `S = diag(−1, 1, 1)` with triangle winding flipped (Three.js flips `frontFace` itself for negative-determinant matrices).

### 0.1 Handedness (labels only)

With +Y up and +Z forward, a right-handed frame (Three.js) puts +X on the car's **left**: `right = forward × up = Z × Y = −X`. So the brief's "+X = starboard" is a mirrored *label*. Every component is symmetric about x = 0, so no geometry changes. **Name sided bodies by sign (`_xp`, `_xn`), not port/starboard.** All matrices below use the standard right-handed convention (`Matrix4.makeRotationX`).

## 1. Global parameters

| Symbol | Value | Tag / note |
|---|---|---|
| L (wheelbase, horizontal on ground) | 3300 | [BRIEF] |
| T_F, T_R (track) | 1450, 1400 → wheel planes at x = ±725, ±700 | [BRIEF] |
| R_w (tyre radius, undeformed) | 330 | [BRIEF] D ≤ 660, at the limit |
| W_F (front complete-wheel width) | 345 | [EST ±10] in the 305–355 band; chosen so 725 + 172.5 = 897.5 ≤ 900 |
| W_R (rear) | 375 | [EST ±5] in the 365–380 band → outer face 887.5 |
| θ (rake) | 1.8° = 0.0314159265 rad | [BRIEF] |
| s, c | sin θ = 0.0314107591, cos θ = 0.9995065604 | [DERIVED] |
| h_F | 25 | [EST ±10] reference-plane height above ground at the front contact-patch station |
| Reference / step plane | y = 0 / y = 50 | [BRIEF] |
| Skid plank | \|x\| ≤ 150, y ∈ [−10, 0] | [BRIEF] |
| Camber, toe, steer | 0 | [CHOICE] see §5.10 for camber as an option |
| H_D (diffuser roof cap) | 125 | [BRIEF] — caps the diffuser panel top; airflow surface ≤ H_D − t_D = 117. See §3 note (b) |

## 2. Rake pre-transform

**Pivot line** (front contact patch): `p = (0, −h_F, 0)`, axis ∥ X.

```
M_rake = T(p) · R_x(θ) · T(−p)

R_x(θ) = | 1  0   0  |        M_rake = | 1  0   0   0             |
         | 0  c  −s  |                 | 0  c  −s  −h_F(1−c)      |
         | 0  s   c  |                 | 0  s   c   h_F·s         |
                                       | 0  0   0   1             |
```

Numeric (mm, row-major — the argument order of `Matrix4.set`):

```
| 1  0            0            0           |
| 0  0.99950656  −0.03141076  −0.01233599  |
| 0  0.03141076   0.99950656   0.78526898  |
| 0  0            0            1           |
```

In metres the last column becomes (0, −1.233599e−5, 7.852690e−4).

Inverse: `M_rake⁻¹ = T(p)·R_x(−θ)·T(−p)`. The rotation block becomes `[[1,0,0],[0,c,s],[0,−s,c]]` and the translation becomes `(0, −h_F(1−c), −h_F·s)`.

**Sign check (brief's test).** A reference-plane point at the rear station, B = (0, 0, −3300), maps to `y_W = −s·(−3300) − 0.0123 = +103.643`. The rear rises **L·s = 103.656 mm** relative to the front (≈ 104 ✓). A point at z = +1200 drops by 37.7 mm.

**Height above ground** of any body point [DERIVED]:

  `h(y_B, z_B) = c·(y_B + h_F) − s·z_B`
  `z_W(y_B, z_B) = s·y_B + c·z_B + h_F·s`

### 2.1 Keeping the wheels on the ground (reconciling the brief's two front datums)

Rotating *everything* rigidly about the contact patch would lift the rear tyres 103.7 mm off the ground and move the front wheel centre 10.4 mm forward. The fix: keep the single global pre-transform, but author the wheel centres in B at their **inverse-raked** positions. Then all four contact patches land on `y_W = −h_F` and the ground wheelbase is exactly L. Wheels are axisymmetric about X, so the 1.8° rotation they inherit is invisible.

| Datum (B frame) | Formula | Value |
|---|---|---|
| Z_FA (front wheel-centre station) | −R_w·s | **−10.366** |
| Y_FA (front wheel-centre height) | R_w·c − h_F | **304.837** |
| Z_RA (rear wheel-centre station) | −R_w·s − L·c | **−3308.737** |
| Y_RA (rear wheel-centre height) | R_w·c − L·s − h_F | **201.182** |
| Body-frame wheelbase along Z | L·c | 3298.372 |

In W these are (±725, 305, 0) and (±700, 305, −3300).

**Consequence.** The brief's "origin = front axle centreline" and "pivot = front contact patch" agree only to within R_w·s = 10.37 mm. I keep the contact patch as the invariant, as the brief specifies. **Every "from the wheel centre line" regulatory distance is therefore measured from Z_FA / Z_RA**, along B's Z (parallel to the reference plane). Unregulated geometry uses round numbers. This is also how real hardpoints are defined: at the static raked attitude.

### 2.2 Static ride heights [DERIVED, with h_F = 25]

| Point (B frame) | y_B | z_B | Height above ground |
|---|---|---|---|
| Reference plane at the front station | 0 | 0 | 24.99 |
| Plank underside, front end | −10 | −340.37 | 25.68 |
| Plank underside, rear end | −10 | −3308.74 | 118.92 |
| Front-wing lowest point (endplate foot, LE) | 75 | 985 | 69.0 |
| Diffuser exit roof, airflow surface (panel top 125 → 264.85) | 117 | −3658.74 | 256.85 |
| Rear-wing flap TE | 935 | −3877.5 | 1081.3 |

### 2.3 Physics side-effect

Rake moves every point forward in W by s·y_B. For the car CoM (y_B ≈ 290) the static front-axle load fraction rises by s·y_cg/L ≈ **+0.28 %**. §6 uses W-frame horizontal distances for axle loads.

## 3. Regulatory envelope as assertions

Margins are measured in B. "Axle" means Z_FA / Z_RA from §2.1.

| ID | Constraint | Tag | Model value | Margin |
|---|---|---|---|---|
| R1 | \|x\| ≤ 900, all parts including tyres | [BRIEF] | FW endplate 850.0; front tyre 897.5 | 50 / 2.5 |
| R2 | y ≤ 950 | [BRIEF] | airbox and fin 950.0; RW ≤ 936 | 0 |
| R3 | z ≤ Z_FA + 1200 | [BRIEF] | nose tip 1175.0 (1185.4 from axle) | 14.6 |
| R4 | z ≤ Z_FA + 1000 where \|x\| > 200 | [BRIEF] | FW LE / endplate LE 985.0 (995.4) | 4.6 |
| R5 | z ≥ Z_RA − 600 | [BRIEF] | RW endplate TE −3890 (581.3 behind) | 18.7 |
| R6 | Plank 300 × 10 from Z_FA − 330 to Z_RA | [BRIEF]/[REG-RECALL] | z ∈ [−3308.74, −340.37] | exact |
| R7 | Step plane at y = 50 outboard of \|x\| = 150 | [BRIEF] | exact | — |
| R8 | Behind Z_RA and y < 150: \|x\| ≤ 500 | [BRIEF] | diffuser \|x\| ≤ 490 | 10 |
| R9 | Diffuser bodywork y ≤ H_D for z ∈ [Z_RA − 350, Z_RA] | [BRIEF], note (b) | panel top 125 (airflow surface 117) | 0 |
| R10 | Diffuser region: every vertical section one continuous line | [BRIEF] | roof is a single-valued y = f(x, z); fences are vertical spurs; no slots behind Z_RA | ✓ |
| R11 | FW elements \|x\| ≤ 840; endplates \|x\| ≤ 900 | [BRIEF] | 840 / 850 (plate inner face at 840 meets every tip) | 0 / 50 |
| R12 | Suspension section: chord ≤ 100, AR ≤ 3.5, major axis ≤ 5° from horizontal | [BRIEF], note (a) | 60×20 (3.0), 40×16 (2.5), 36×14 (2.6); major axis exactly horizontal | ✓ |
| R13 | Exhaust bodywork aperture ≤ 50 000 mm² combined | [BRIEF] | 2 × 7 840 = 15 680 (§5.7) | 34 320 |
| R14 | FW bodywork 75 ≤ y ≤ 275 outboard of the central 500 | [REG-RECALL] | 75 … 269 | 0 / 6 |
| R15 | RW box: 730 ≤ y ≤ 950, \|x\| ≤ 375 (main plane and flap; endplates and beam wing lie outside this box) | [REG-RECALL] | lowest ≈ 765; \|x\| ≤ 375 | 35 |
| R16 | DRS slot gap 10–15 closed, ≤ 50 open | [REG-RECALL] | 12 / 50 | — |
| R17 | Floor \|x\| ≤ 700 between the axles | [REG-RECALL] | 700 | 0 |
| R18 | Brake disc Ø ≤ 278, thickness ≤ 28 | [REG-RECALL] | 278 × 28 | 0 |
| R19 | Nose: ≥ 9 000 mm² section 50 mm behind the tip | [REG-RECALL] | ≈ 11 300 (§5.2) | 2 300 |
| R20 | Mass ≥ 640 kg incl. driver; axle minimums 291 / 342 kg | [REG-RECALL] | used in §6 | — |

**Interpretation notes**

- **(a)** The "within 5° of horizontal" rule must apply to the **cross-section's major axis**, not the member's centreline. Otherwise every pushrod or pullrod (28–35° inclined) would be illegal. Members are built so that the major axis is exactly ⟂ Y_B (§4.5). Wishbone *centrelines* are additionally kept ≤ 5° as a design target, to meet "near-horizontal".
- **(b)** Read literally, "no bodywork above 125 mm from the rear axle to 350 mm behind it" would forbid the rear wing, the engine-cover tail and the crash structure. I read it as a cap on the **diffuser bodywork (\|x\| ≤ 500)**. A bodywork height limit limits material, so it applies to the **top of the roof panel**: y_r + t_D ≤ H_D, and the airflow surface y_r reaches H_D − t_D = 117 (§5.6). H_D = 125 is locked. It is a single parameter; changing it only rescales ρ(s) in §5.6. If it changes, re-check the clearance to the rear lower wishbones (§5.9).
- **(c)** The floor slot of §5.6 sits *ahead* of Z_RA, so the brief's continuity rule (R10, which covers the diffuser region only) does not apply to it.

## 4. Shared construction primitives

### 4.1 Closed superellipse section and loft

Each station k gives (z_k, y_bot, y_top, a, n). With y_c = (y_top + y_bot)/2 and b = (y_top − y_bot)/2:

  `S(φ) = ( a·sgn(cos φ)·|cos φ|^(2/n) ,  y_c + b·sgn(sin φ)·|sin φ|^(2/n) ,  z ),   φ ∈ [0, 2π)`

- Half-width at height y: `x(y) = a·(1 − |(y − y_c)/b|^n)^(1/n)`.
- Section area: `A = 4ab·Γ(1+1/n)² / Γ(1+2/n)`.
- **Interpolation:** each station parameter is linear in z. *Every clearance in this document was checked with linear interpolation.* If you switch to PCHIP for G1 smoothness, re-run the §8 asserts.
- **Tessellation:** N_φ = 64, at least 8 rings between stations, end faces capped unless stated open.

### 4.2 Open C-shell (sidepods)

Station: (z, x_i, X_o, Y_b, Y_m, Y_t), exponents n_u (upper) and n_l (lower). For φ ∈ [−π/2, π/2]:

  `x = x_i + (X_o − x_i)·(cos φ)^(2/n)`
  `y = Y_m + B·sgn(sin φ)·|sin φ|^(2/n)`

where B = Y_t − Y_m and n = n_u for φ ≥ 0; B = Y_m − Y_b and n = n_l for φ < 0. With ξ = (x − x_i)/(X_o − x_i), the explicit surfaces are:

  `y_up(x) = Y_m + (Y_t − Y_m)·(1 − ξ^n_u)^(1/n_u)`   (decreasing in x)
  `y_lo(x) = Y_m − (Y_m − Y_b)·(1 − ξ^n_l)^(1/n_l)`   (increasing in x)

**Sliding lemma.** The shell is open inboard (no wall at x = x_i), y_up decreases in x and y_lo increases in x. So translating the shell by +δ·X̂ (δ ≥ 0) can never intersect a body that lay strictly inside it at δ = 0. §7 uses this for the radiators.

### 4.3 Canopy section (engine cover)

Station: (z, a, y_s, y_bot, y_top, n). The roof is the upper half-superellipse for φ ∈ [0, π]:

  `( a·sgn(cos φ)·|cos φ|^(2/n) ,  y_s + (y_top − y_s)·|sin φ|^(2/n) )`

It is completed by two vertical skirts at x = ±a for y ∈ [y_bot, y_s]. The section is open underneath.

### 4.4 Airfoils (NACA 4-digit, inverted for downforce)

The digits give m = d₁/100, p = d₂/10, t = d₃d₄/100. x ∈ [0, 1] uses cosine spacing `x_k = (1 − cos(πk/N))/2`, N = 40.

```
y_t = 5t·[0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1036x⁴]      (closed TE)
y_c = (m/p²)(2px − x²),                 dy_c/dx = (2m/p²)(p − x),         x < p
y_c = (m/(1−p)²)(1 − 2p + 2px − x²),     dy_c/dx = (2m/(1−p)²)(p − x),     x ≥ p
ψ = atan(dy_c/dx)
upper = (x − y_t sinψ, y_c + y_t cosψ)      lower = (x + y_t sinψ, y_c − y_t cosψ)
```

**Inverted** means m → −m.

**Placement in B.** Given the leading edge (z_LE, y_LE), chord C and angle α (positive = TE higher, i.e. downforce attitude), the (z, y) unit vectors are

  `ĉ = (−cos α, +sin α)`,  `n̂ = (+sin α, +cos α)`,

and a profile point (X, Y) maps to `(z, y) = (z_LE, y_LE) + C·(X·ĉ + Y·n̂)`, so the TE sits at `(z_LE − C cos α, y_LE + C sin α)`. The span is an extrusion along X between the stated |x| limits, trimmed at endplate inner faces.

### 4.5 Swept suspension member

From A to B with an elliptical section of chord C and thickness τ:

  `ê = (B − A)/|B − A|`,  `m̂ = (Ŷ × ê)/|Ŷ × ê|`,  `n̂ = ê × m̂`
  `P(u, ω) = A + u(B − A) + (C/2)cos ω·m̂ + (τ/2) sin ω·n̂`,   u ∈ [0, 1]

m̂ ⟂ Ŷ_B holds by construction, so the major axis is exactly horizontal in B and R12 holds. It stays within 1.8° in W. This is well defined because every member here is ≤ 35° from horizontal (|ê·Ŷ| ≤ 0.58).

### 4.6 Bézier sweep with a flat-top "D" section (exhaust)

```
B(u) = (1−u)³P0 + 3(1−u)²u P1 + 3(1−u)u² P2 + u³ P3
B'(u) = 3(1−u)²(P1−P0) + 6(1−u)u(P2−P1) + 3u²(P3−P2)
t̂ = B'/|B'|,   m̂ = normalize(Ŷ × t̂),   n̂ = t̂ × m̂        (the flat top stays up)
```

Section D(α) in (m, n):
- Upper (α ∈ [0, π]): `( a·sgn(cos α)|cos α|^(1/4) ,  b_t·|sin α|^(1/4) )` — superellipse n = 8, near-flat top.
- Lower (α ∈ (π, 2π)): `( a·cos α ,  b_b·sin α )` — half-ellipse.

Point = `B(u) + D_m·m̂ + D_n·n̂`.

Area = π·a·b_b/2 + 2·a·b_t·Γ(1.125)²/Γ(1.25) = π·a·b_b/2 + 1.95690·a·b_t.

### 4.7 Tyre (superellipse torus)

Wheel centre C, axle X̂, φ around the axle, α around the section:

  `ξ(α) = (W/2)·sgn(cos α)|cos α|^(2/3)`
  `ρ(α) = r_m + (H/2)·sgn(sin α)|sin α|^(2/3)`
  `P(φ, α) = C + ξ(α)·X̂ + ρ(α)·(cos φ·Ŷ + sin φ·Ẑ)`

with R_rim = 177 [EST ±5] (rim flange radius), H = R_w − R_rim = 153 and r_m = R_rim + H/2 = 253.5. So ρ ∈ [177, 330]: the tread radius is exactly R_w.

### 4.8 Mirroring

Left body = `S·(right body)` with `S = diag(−1, 1, 1)`. Left explosion vector = `S·d_right`. Left CoM = `S·CoM_right`.

---

## 5. Rigid bodies

Each entry lists the construction, nominal position (B), bounding box (B, right body for sided parts), mass, CoM and the displacement. Displacements are summarised and justified in §7. d_W is the world-frame vector; d_B = R_x(−θ)·d_W is what you add when the group sits *inside* the raked root.

### 5.1 `monocoque_survival_cell` (anchor)

Closed superellipse loft (§4.1) [EST ±15 on every station value]:

| z | y_bot | y_top | a | n | Station |
|---|---|---|---|---|---|
| +350 | 300 | 640 | 140 | 3.0 | front bulkhead face (nose mates here) |
| +100 | 205 | 660 | 185 | 4.0 | front-suspension pickup zone |
| −330 | 60 | 660 | 235 | 4.0 | floor start; chassis underside meets the floor |
| −700 | 60 | 650 | 285 | 4.0 | cockpit, knees |
| −1100 | 60 | 640 | 300 | 4.0 | cockpit rear |
| −1450 | 60 | 665 | 300 | 4.0 | fuel-cell hump |
| −2000 | 60 | 600 | 260 | 4.0 | engine bulkhead (rear face, capped) |

- **No keel** [BRIEF]: the front lower wishbones pick up on the lower flanks through clevis brackets ≤ 35 mm long (§5.8).
- **Cockpit opening:** remove every face with y > 520 that lies inside the plan superellipse `|(z + 850)/425|^2.5 + |x/225|^2.5 ≤ 1` (z ∈ [−1275, −425]) [EST ±25].
- **Bounding box:** x ∈ [−300, 300], y ∈ [60, 665], z ∈ [−2000, 350].
- **Mass** 55 kg [EST ±15] (shell, side-intrusion panels, empty fuel bladder). **CoM** (0, 360, −850) [EST ±60].
- **Displacement** d = 0. This is the fixed reference of the teardown.

### 5.2 `nose_and_front_wing_cascade`

**Nose cone.** Closed superellipse loft (§4.1) [EST ±20]. The rear station equals the monocoque front station, so the joint is seamless.

| z | y_bot | y_top | a | n |
|---|---|---|---|---|
| 350 | 300 | 640 | 140 | 3.0 |
| 700 | 312 | 560 | 120 | 2.6 |
| 980 | 305 | 470 | 90 | 2.3 |
| 1135 | 315 | 420 | 62 | 2.2 |

- **Tip cap**, ζ = z − 1135 ∈ [0, 40]: section half-axes (62k, 52.5k) centred at y = 367.5, with `k = √(1 − (ζ/40)²)`. The tip is at z = **1175**, i.e. 1185.4 from Z_FA (R3 margin 14.6).
- **R19 check:** at z = 1125 the interpolated section is a = 63.8, b = 54.45, n = 2.21, giving A = 4ab·Γ(1.4525)²/Γ(1.905) ≈ 4·63.8·54.45·0.814 ≈ **11 300 mm² ≥ 9 000** ✓.
- The high nose is wider and taller than the RB6 [BRIEF]; the underside stays ≥ 305 all the way to the tip.

**Front wing elements** (§4.4; all [CHOICE] within R4, R11 and R14):

| Element | \|x\| span | LE (z, y) | Chord | α | Profile | TE (z, y) |
|---|---|---|---|---|---|---|
| Neutral centre section | 0–250 | (985, 110) | 340 | 0° | NACA 0010 (stand-in for the FIA-mandated neutral profile) [REG-RECALL] | (645, 110) |
| Main plane | 250–840 | (985, 105) | 300 | 6° | 6412 inverted | (686.6, 136.4) |
| Flap 1 | 250–840 | (696.6, 148.4) | 200 | 18° | 4410 inverted | (506.4, 210.2) |
| Flap 2 | 250–840 | (516.4, 222.2) | 120 | 22° | 4408 inverted | (405.1, 267.2) |
| Cascade C1 | 620–840 | (830, 215) | 100 | 10° | 4409 inverted | (731.5, 232.4) |
| Cascade C2 | 620–840 | (741.5, 244.4) | 70 | 18° | 4409 inverted | (674.9, 266.0) |

- **Slot rule:** each flap LE = previous TE + (10, 12), i.e. 10 mm overlap and 12 mm gap.
- **Main-plane lowest surface point:** at x/c = 0.3, chord line 114.4 − camber 16.9 − half-thickness 18.0 = **79.5** ≥ 75 ✓.
- **Cascade clearance:** C1's lower surface (≈ 210) clears the main plane's upper surface (≈ 122) by ≈ 88.
- **Cascade struts:** two vertical plates 6 thick at |x| = 620 and |x| = 835, spanning the element chords, from the main-plane upper surface to C2.

**Endplates** [CHOICE]. The outer face is the vertical plane through the plan line (x, z) = (850, 985) → (850, 400), parallel to Z. Thickness 10, measured inboard, so the inner face is x = 840 and meets every element tip along its whole chord (R11). An earlier 6.28° toe-out left the tips up to 53.8 short of the plate.

- Outline in (s, y), with s measured along the plan line from the LE (length 585): polygon (0, 75) → (0, 275) → (585, 275) → (585, 140) → (516.7, 75). The TE at z = 400 covers flap 2's TE (405.1).
- **Footplate:** y ∈ [75, 80], 60 wide inboard of the endplate (x ∈ [780, 840]), z ∈ [700, 985].

**Pylons.** Two plates 10 thick at |x| ∈ [75, 85] with side outline z ∈ [800, 1000]. Each runs from the neutral-section upper surface (y ≈ 127) to the nose underside (y ≈ 308).

**Tyre clearances:**
- Front tyre front face at y = 267: z = Z_FA + √(330² − 37.6²) = 317.5. Flap 2 TE is at 405.1 → **87.6 clear**.
- Endplate TE (z = 400) against the front tyre → **88.3 clear** (3D minimum; the plate lies over the tyre shoulder).

**Summary**

- **Bounding box:** x ∈ [−850, 850], y ∈ [75, 640], z ∈ [350, 1175].
- **Mass** 14.5 kg = nose 6.0 [EST ±1.5] + wing 8.5 [EST ±2].
  - Nose CoM (0, 460, 680); wing CoM (0, 165, 760).
  - **Assembly CoM (0, 287, 727)** [DERIVED from these estimates].
- **Displacement:** d_W = (0, 0, +1.80) m, so d_B = (0, +0.05654, +1.79911). The nose travels parallel to the ground; with a body-frame +Z it would descend 56.5 mm and the endplate foot would end only 12 mm above ground. Stage A3.

### 5.3 `engine_cover_and_sharkfin`

**Cover.** Canopy loft (§4.3) [EST ±20]:

| z | a | y_s | y_bot | y_top | n | Note |
|---|---|---|---|---|---|---|
| −1250 | 150 | 700 | 659 | 950 | 2.5 | airbox / roll-hoop face; bottom edge 8.3 above the monocoque crown (650.7) |
| −1500 | 230 | 660 | 651 | 948 | 3.0 | skirt 23.8 above the monocoque skin (627.2 at x = 230) |
| −2000 | 270 | 560 | 530 | 860 | 3.5 | |
| −2300 | 250 | 515 | 490 | 790 | 3.5 | skirt = pod top inner edge (250, 490) |
| −2550 | 225 | 465 | 440 | 700 | 3.5 | skirt = pod top inner edge (225, 440) |
| −2850 | 180 | 370 | 340 | 600 | 3.0 | skirt = pod tail edge (180, 340) |
| −3000 | 115 | 360 | 330 | 560 | 2.5 | coke-bottle neck |
| −3450 | 80 | 340 | 320 | 430 | 2.2 | tail over the gearbox (open end) |

- **Airbox.** The z = −1250 face is capped except for the inlet: the hole `|x/70|^2.5 + |(y − 850)/75|^2.5 ≤ 1` [EST ±10]. The cover's top at that face (950) is the roll-hoop crown. The structural hoop's mass is booked to the monocoque.
- **Monocoque clearance:** the skirt bottom stays ≥ 8.15 above the monocoque skin at x = a(z) over z ∈ [−1250, −2000] (minimum at z ≈ −1390, linear interpolation). 3D minimum on the meshes: canopy 7.8, airbox face 9.4.
- **Rear-suspension clearance:** behind z = −2850, a(z) ≤ 115 keeps the rear upper-wishbone pickups (x ≥ 130) outboard of the skirt. Pickup centre to skirt plane is 28.9 at z = −3050 and 47.7 at z = −3420. The 60-chord member end cap comes to **16.4** of the cover (static and through A1).

**Shark fin.** Plate x ∈ [−4, 4]. Side outline in (z, y) [CHOICE]:
- Lower edge: the canopy centreline y_top(z), for z ∈ [−3300, −1350].
- Upper edge: y = **950** (at the legal maximum, R2) for z ∈ [−2700, −1350], then linear to 880 at z = −3300.
- Trailing edge: vertical at z = −3300, from y_top(−3300) = 473.3 to 880. It sits 8.7 ahead of Z_RA, so the fin stays out of the behind-axle box.

**Summary**

- **Bounding box:** x ∈ [−270, 270], y ∈ [320, 950], z ∈ [−3450, −1250].
- **Mass** 8 kg [EST ±3]: shell 5.5, airbox fairing 1.5, fin 1.0. **CoM** (0, 700, −2150) [EST ±80].
- **Displacement:** d_W = (0, +1.20, 0) m, so d_B = (0, +1.19941, −0.03769). Stage A1. It goes first because its skirts sit on the pod tops.

### 5.4 `sidepod_pods` (×2, `_xp` authored)

**Open C-shell** (§4.2), n_u = 3.5, n_l = 2.2, wall 3 mm offset inward [EST ±20 on all stations]:

| z | x_i | X_o | Y_b | Y_m | Y_t | Note |
|---|---|---|---|---|---|---|
| −1150 | 300 | 600 | 230 | 400 | 560 | inlet lip, open face, lip radius 8 |
| −1400 | 300 | 680 | 120 | 330 | 580 | maximum width (R17: 680 ≤ 700) |
| −1800 | 280 | 660 | 80 | 300 | 560 | deep undercut |
| −2050 | 265 | 590 | 75 | 280 | 525 | end of radiator bay |
| −2300 | 250 | 510 | 215 | 300 | 490 | lower edge lifted: exhaust tunnel |
| −2550 | 225 | 420 | 225 | 295 | 440 | coke-bottle |
| −2850 | 180 | 260 | 240 | 275 | 340 | tail, open exit under the cover |

- The 140 mm lift of Y_b between −2050 and −2300 forms a tunnel. The exhaust runs under it (pipe top ≤ 205 < Y_b ≥ 215, §5.7), so the pod can slide outboard over the pipe.
- **Inboard gap:** the gap to the monocoque at the inlet is 22.5 (skin x = 277.5 at y = 560), which reads as closed. The inboard *lower* edge (300, 230) is 2.3 from the skin (x = 297.7). That is designed proximity: static only, it opens in A4.
- **F3 heat-shield foil** (owned by this body, moves with it in A4): the outer C-shell surface on the lower lobe, φ ∈ [−π/2, 0], for z ∈ [−2300, −2750] (the exhaust tunnel, over the pipe for u ≈ 0.05–0.6). It is offset 0.5 outward along the surface normal, single sheet, open edges. Mass is included in the pod estimate. Exhaust ↔ pod including F3: 20.0.

**Summary**

- **Bounding box (_xp):** x ∈ [180, 680], y ∈ [75, 580], z ∈ [−2850, −1150].
- **Mass** 2.5 kg each [EST ±1]. **CoM_xp** (470, 350, −1800) [EST ±50].
- **Displacement:** d_W,xp = (+1.40, +0.10, 0) m, so d_B = (+1.40, +0.09995, −0.00314). Stage A4.

### 5.5 `radiator_internals` (×2, `_xp` authored)

**Geometry.** Core slab 50 (thickness) × 300 (height) × 560 (length), plus end tanks 50 × 300 × 30 at both ends: 620 in total [EST ±30]. Centre C_xp = **(440, 330, −1720)**.

**Orientation** [CHOICE]: yaw ψ = 20° (front end outboard, following the coke line), then lean λ = 12° about the core's long axis (top outboard, matching the undercut).

```
u0 = (−sinψ, 0, −cosψ)          w0 = (cosψ, 0, −sinψ)
v̂ = Ŷ·cosλ + w0·sinλ = (0.19537, 0.97815, −0.07111)     core height
ŵ = w0·cosλ − Ŷ·sinλ = (0.91916, −0.20791, −0.33455)     through-flow normal
n̂ = ŵ × v̂ = −u0      = (0.34202, 0, 0.93969)            core length (forward)

M_rad,xp = T(C_xp) · [ŵ | v̂ | n̂]      (columns; Matrix4.makeBasis(ŵ, v̂, n̂), det = +1)
```

Local box: x′ ∈ [−25, 25] along ŵ, y′ ∈ [−150, 150] along v̂, z′ ∈ [−310, 310] along n̂. The corners are `C ± 25ŵ ± 150v̂ ± 310n̂`.

**Verified clearances** (tanks included, pod and monocoque surfaces interpolated linearly):

| Corner (signs on n̂, v̂, ŵ) | Point | Nearest surface | Clearance |
|---|---|---|---|
| + + + front-top-outer | (598.3, 471.5, −1447.7) | pod y_up = 539.2 | 67.7 |
| + + − front-top-inner | (552.4, 481.9, −1431.0) | pod y_up = 559.3 | 77.4 |
| + − + front-bottom-outer | (539.7, 178.1, −1426.4) | pod y_lo = 156.9 | **21.2** (minimum) |
| − + + rear-top-outer | (386.3, 471.5, −2030.3) | pod y_up = 525.7 | 54.2 |
| − − + rear-bottom-outer | (327.6, 178.1, −2009.0) | pod y_lo = 78.0 | 100.1 |
| − − − rear-bottom-inner | (281.7, 188.5, −1992.3) | monocoque skin x = 255.5 | 26.2 |

The inlet face (−1150) is 260 ahead of the core front (−1409.7).

These are vertical gaps to the pod's *outer* surface. The 3D minimum to the 3 mm inner skin is **16.3** (§8.9).

**Summary**

- **Bounding box (_xp):** x ∈ [281.7, 598.3], y ∈ [178.1, 481.9], z ∈ [−2030.3, −1409.7].
- **Mass** 6 kg each, including coolant [EST ±2]. **CoM** = C_xp.
- **Displacement:** d_W,xp = (+0.70, 0, 0) m = d_B. Stage A5, after the pods start (§7).

### 5.6 `floor_and_blown_diffuser`

**Plan outline.** Right half, mirrored. Polyline (z, x_f) [CHOICE within R17 and the tyre clearances]:

  (−340.37, 250) → (−650, 560) → (−950, 700) → (−2500, 700) → (−2900, 620) → (−2995, 620) → (−3005, 490) → (Z_RA = −3308.74, 490)

The start station is Z_FA − 330 = **−340.37** [BRIEF/REG-RECALL, measured from the true axle datum].

**Section between −340.37 and Z_RA** [BRIEF]:
- **Reference strip, |x| ≤ 150:** underside at y = 0, with the plank (§5.12) below it. Vertical walls at |x| = 150 run from y = 0 to y = 50.
- **Step panel, 150 ≤ |x| ≤ x_f(z):** underside at y = 50, top at y = 60 (10 thick).
- **Closing the strip box:** for z ≥ −2000 the monocoque underside (y = 60) closes it. Behind −2000 a 10 mm top plate at y ∈ [50, 60] belongs to the floor.

**Tyre clearances** [DERIVED]:
- Rear tyre face at floor height: `z = Z_RA + √(330² − (Y_RA − y)²)`, which gives −3015.4 at y = 50 and −3010.5 at y = 60. The 620-wide panel ends at −2995, so **15.5 clear**. The inboard edge (490) clears the tyre's inner face (512.5) by **22.5**.
- Front tyre rear face at y = 60: z = Z_FA − 221.3 = −231.6. That is 108.8 ahead of the floor start.

**Diffuser.** z ∈ [Z_RA − 350, Z_RA] = [−3658.74, −3308.74], |x| ≤ 490 (R8). With s = (Z_RA − z)/350 ∈ [0, 1]:

```
y0(x)    = 0 for |x| ≤ 150,   50 for 150 < |x| ≤ 490
t_D      = 8                                              roof panel thickness
y_r(x,z) = y0(x) + (H_D − t_D − y0(x))·ρ(s),     ρ(s) = 2s² − s³      (airflow surface, max 117)
ρ(0) = 0, ρ'(0) = 0  (C¹ with the floor);   ρ(1) = 1, ρ'(1) = 1;   max ρ' = 4/3 at s = 2/3
```

- **Central channel:** rise 117, mean slope 18.5°, maximum 24.0°.
- **Outer channels:** rise 67, mean slope 10.8°, maximum 14.3°.
- **Roof panel:** t_D = 8 thick, offset upward, occupying [y_r, y_r + t_D]. Its top reaches exactly H_D = 125 at the exit (s = 1): R9, margin 0.
- **Fences:** 6-thick vertical plates at |x| = 150 and 320, plus the outer sidewall at |x| = 490. Each runs from y = 0 up to the local roof (the higher roof at |x| = 150).
- **R10:** each z-section is one connected polyline (graph roof plus vertical spurs), with no slots or steps-over ✓.

**Blown-floor features** [BRIEF features, geometry CHOICE]:
- **Exhaust channel.** A recessed U-trough 50 wide × 8 deep in the step-panel top (trough floor at y = 52). Plan centreline: E0 (x 560, z −2935) → E1 (455, −2990) → E2 (445, −3280).
  - Edge check at z = −3005: the trough spans [429.5, 479.5] against the floor edge at 490, so 10.5 clear.
- **50 mm opening.** A through-slot x ∈ [420, 470] (50 wide), z ∈ [−3300, −3180]. It feeds the underside directly ahead of the diffuser's outer channel (x ∈ [320, 490]). It ends 8.7 ahead of Z_RA, so it lies outside R10's region.
- **Gold heat-shield foil** (floor-owned meshes, 0.5 above the panel top at y = 60.5):
  - **F1 band:** every panel-top point whose plan distance to the plan projection of the exhaust centreline (§5.7, u ∈ [0.35, 1]) is ≤ 110 (pipe half-width 55 + 55). Clip to the outline.
  - **F2 exit fan:** a plan sector with its apex at the exit (580, −2925), axis along the plan exit direction (0.7880, −0.6157) in (x, z), half-angle 25°, radius 150, clipped to the outline.
  - F3 (pod underside, defined in §5.4) and F4 (pipe sleeve, §5.7) are owned by those bodies. Each foil patch must move with its owner.

**Summary**

- **Bounding box:** x ∈ [−700, 700], y ∈ [0, 125], z ∈ [−3658.74, −340.37].
- **Mass** 14 kg [EST ±4]: ≈ 3.4 kg/m² over a 4.10 m² plan area.
- **CoM** (0, 55, −1975). The z value is the area-weighted plan centroid [DERIVED]; y is [EST].
- **Displacement:** d_W = (0, −0.80, 0) m, so d_B = (0, −0.79961, +0.02513). Stage C2.

### 5.7 `exhaust_system` (×2, `_xp` authored)

**Centreline.** Bézier per §4.6 [CHOICE, routed for the clearances below]:

| Control point | B frame | Role |
|---|---|---|
| P0 | (170, 185, −2350) | collector outlet, under the engine-cover canopy |
| P1 | (230, 175, −2550) | |
| P2 | (420, 150, −2800) | |
| P3 | (580, 100, −2925) | exit centre, at the floor's outer perimeter just ahead of the rear tyre [BRIEF] |

**Section.** Flattened oval with a flat top [BRIEF], a = 55, b_t = 18, b_b = 32 [EST ±5]. Area **4 702 mm²** (Ø77.4 equivalent, one V8 bank's 4-into-1 tailpipe). Perimeter ≈ 282.

**Exit geometry** [DERIVED]:
- Tangent: t̂(1) = (P3 − P2)/|P3 − P2| = (0.7652, −0.2391, −0.5978). That is **13.8° down** and **52.0° outboard** of −Z in plan, aimed at the tyre-squirt zone [BRIEF].
- Frame: m̂ = (−0.6156, 0, −0.7881), n̂ = (0.1884, 0.9711, −0.1472).
- Major-axis ends: (546.1, 100, −2968.3) and (613.9, 100, −2881.7). The outer lip is at the floor edge (620).
- Lowest lip point: P3 − 32n̂ = (574.0, 68.9, −2920.3), which is 8.9 above the panel top.

**Verified clearances** (pod surfaces from §5.4, linear interpolation):

| u | B(u) | Pipe top | Nearest | Clearance |
|---|---|---|---|---|
| 0 | (170, 185, −2350) | 203 | under the canopy (skirt bottom 480); pod x_i = 245 > pipe max x 225 | ≥ 20 laterally |
| 0.10 | (191.7, 181.6, −2411.4) | 199.6 | pod Y_b = 219.4 over x ∈ [239, 247] | **19.8** (minimum) |
| 0.25 | (236.9, 174.6, −2506.7) | 192.6 | pod y_lo ≥ 223.3 | 30.7 |
| 0.50 | (337.5, 157.5, −2665.6) | 175.5 | pod Y_b = 230.8 | 55.3 |
| 0.75 | (456.9, 133.0, −2810.6) | 151.0 | pod X_o = 271; pipe x ≥ 402 is outboard | 131 laterally |
| 1 | P3 | — | rear tyre face at y = 100 is z = −2994.6; rear lip at −2968.3 | 26.3 |

Other clearances:
- Radiator: ≥ 320 (z-separated).
- Rear lower-wishbone front leg: ≥ 300 (§5.9).
- Monocoque: z-separated (it ends at −2000).

**Optional collector** [CHOICE]: a loft from a Ø90 circle centred at P0 − 100·t̂(0) = (141.3, 189.8, −2254.3) to the D section at P0, with t̂(0) = (0.287, −0.048, −0.957).

**R13 aperture.** The pipe leaves the bodywork envelope under the pod tunnel. Aperture = exit section + 10 mm clearance ring = A + 10·P + π·10² = 4 702 + 2 820 + 314 ≈ **7 840 mm² per side**, so 15 680 ≤ 50 000 ✓.

**Heat shield F4.** A foil sleeve over the last 250 mm of arc length, offset +2 mm, owned by this body.

**Summary**

- **Bounding box (_xp, with collector):** x ∈ [96, 625], y ∈ [69, 235], z ∈ [−2968.3, −2254.3].
- **Mass** 2.5 kg each [EST ±1]: an Inconel 625 tube of 1 mm wall ≈ 282 × 718 × 8.44·10⁻³ g/mm³ = 1.7 kg, plus collector, flanges and sleeve. Arc length ≈ (2·|P3 − P0| + control-polygon length)/3 = (2·711.3 + 733.1)/3 ≈ 718.
- **CoM_xp** ≈ B(0.5) = (337.5, 157.5, −2665.6) [DERIVED approx.: uniform wall].
- **Displacement:** d_W,xp = (−0.08, +0.30, −0.60) m, so d_B = (−0.08, +0.28100, −0.60912). Stage C1. The −0.08 inboard component is the correction derived in §7.

### 5.8 `front_suspension_pushrod` (×2, `_xp` authored)

**Hardpoints.** B frame, WC_F = (725, 304.84, −10.37) [CHOICE ±15]:

| Point | Coordinates | Belongs to |
|---|---|---|
| UBJ (upper ball joint) | (625, 424.84, −30.0) | joint; upright side → wheel assembly. r = 121.6 from the axle |
| LBJ (lower ball joint) | (645, 232.0, −5.0) | joint; upright side → wheel assembly |
| UF / UR (upper wishbone, inboard) | (200, 440, +200) / (240, 445, −250) | chassis brackets |
| LF / LR (lower wishbone, inboard) | (175, 265, +170) / (245, 265, −270) | chassis brackets |
| PRo (pushrod, lower end) | (628, 248, −32) | lower-wishbone outer node |
| PRi (pushrod → rocker) | (110, 610, −80) | rocker inside the chassis top (rocker not modelled) |
| TRo (track rod → steering arm) | (630, 394.8, 89.6) | steering arm (upright). r = 134.5 from the axle |
| TRi (track rod → rack) | (170, 410, 110) | rack inside the chassis |

**Members** (§4.5):
- Wishbone legs UBJ–UF, UBJ–UR, LBJ–LF, LBJ–LR: ellipse 60 × 20 (AR 3.0).
- Pushrod PRo–PRi: 40 × 16 (AR 2.5).
- Track rod TRo–TRi: 36 × 14 (AR 2.57).

All chords are ≤ 100 (R12).

**Derived geometry**

| Quantity | Value |
|---|---|
| Upper-wishbone leg inclinations (front, rear) | 1.80°, 2.60° |
| Lower-wishbone leg inclinations | 3.76°, 3.93° ✓ near-horizontal [BRIEF] |
| Kingpin LBJ → UBJ | (−20, 192.84, −25): KPI 5.92°, caster 7.39° in B (9.19° in W) |
| Kingpin ground point (y_B = −25) | x = 671.7, z = +28.3 → scrub radius 53.3, mechanical trail 28.3 (contact patch at B (725, −25, 0) = pivot line) |
| Pushrod | length 633.8, 34.9° from horizontal in front view; at y = 432 it passes between the upper-wishbone legs (z = −56.5 vs legs at +111.2 / −179.1) |
| Track rod | length 460.7, 1.89°; 13.5 (surface) below the upper-wishbone front leg; 111.6 from the pushrod |
| Pushrod skin crossing | (199.7, 547.3, −71.7) |
| Pushrod lower end | PRo sits on top of the lower-wishbone rear leg (designed attachment, intra-body contact) |

**Chassis openings** (cut from the monocoque so the rods can explode outward without collision):
- Pushrod: a slot covering the skin within **26 mm** of the segment (199.7, 547.3, −71.7) → (179.5, 610.0, −80.0). The first point is the true δ = 0 centreline crossing; the second is where PRi crosses the skin after δ = 69.5 of +X travel. The rod's (y, z) shadow half-width is 19.8 and the chord sags ≤ 3.4 from the skin. Clearance 5.9 static, 5.4 minimum through B1.
- Track rod: a **50 (z) × 30 (y)** rectangular hole at (183, 410, 110); the centreline crossing is (183.4, 409.6, 109.4). The rod is within 2.3° of X, so its 36 × 14 shadow is constant through the travel. Clearance 6.2 static and through B1.

**Wishbone/rim clearance.** Inside the rim (x ≥ 572.5) every member surface stays at r ≤ 152.2 from the axle (the track rod at the rim edge is the outermost), against the 160 barrel. So the wheel slides off the members in pure +X (§7). The closest member ↔ wheel pairs (static = B1 minimum) are: UW rear leg ↔ caliper 5.1, LW rear leg ↔ disc 5.7, LW front leg ↔ disc 6.7, track rod ↔ rim 7.8, UW rear leg ↔ rim 8.3.

**Summary**

- **Bounding box (_xp):** x ∈ [105, 662], y ∈ [222, 617], z ∈ [−295, 227].
- **Mass** 2.6 kg per side [EST ±0.8]: legs 4 × 0.45, pushrod 0.5, track rod 0.3.
- **CoM_xp** (411, 365, −18) [DERIVED: mass-weighted member midpoints].
- **Displacement:** d_W,xp = (+0.50, 0, 0) m = d_B, i.e. 0.5 × the wheel's [BRIEF]. Stage B1.

### 5.9 `rear_suspension_pullrod` (×2, `_xp` authored)

**Hardpoints.** B frame, WC_R = (700, 201.18, −3308.74) [CHOICE ±15]. The gearbox is not in the hierarchy, so the inboard pickups are free-standing brackets.

| Point | Coordinates | Note |
|---|---|---|
| UBJ_R | (610, 326.18, −3308.74) | WC + (−90, +125, 0) |
| LBJ_R | (620, 121.18, −3298.74) | WC + (−80, −80, +10) |
| UF_R / UR_R | (140, 335, −3050) / (130, 340, −3420) | outboard of the cover skirt by 28.9 / 47.7 (pickup centres) |
| LF_R / LR_R | (135, 150, −2950) / (125, 150, −3480) | |
| PLo (pullrod, upper end) | (600, 301.18, −3318.74) | upper-wishbone outer node |
| PLi (pullrod → rocker) | (115, 105, −3060) | low on the gearbox, rocker moved **forward** [BRIEF] |
| TLo (toe link → upright arm) | (615, 151.18, −3413.74) | WC + (−85, −50, −105), behind the axle |
| TLi | (125, 165, −3540) | 60 behind LR_R in z, so the toe link clears the LW rear leg |

Sections are as in §5.8: wishbones 60 × 20, pullrod 40 × 16, toe link 36 × 14.

**Derived geometry**

| Quantity | Value |
|---|---|
| Upper-wishbone leg inclinations | 0.94°, 1.61° |
| Lower-wishbone leg inclinations | 2.76°, 3.13° ✓ |
| Kingpin LBJ_R → UBJ_R | (−10, 205, −10): KPI 2.8° |
| Pullrod | **length 583.7 (long)**; 22.0° below horizontal in front view; swept 258.7 forward in plan (28.1°). At y ≈ 135 it passes through the lower-wishbone A-frame (z = −3099.6 vs legs at −2989.0 / −3456.5) |
| Toe link | length 506.2, 1.56°, 14.5° rearward in plan |
| Pullrod ↔ lower-wishbone legs | 35.2 (surface; the PLi and LF_R pickups are 120 apart) |
| Toe link ↔ lower-wishbone rear leg | 15.6 (surface, at the inboard pickups) |
| Pullrod ↔ toe link | 156.6 |
| Pullrod upper end ↔ upper-wishbone legs | 8.1 (attachment region at the outer node) |

**Wheel clearance.** Inside the rim (x ≥ 528.5) every member surface stays at r ≤ 153.5 from the axle (the toe link at the rim edge is the outermost), against the 160 barrel. Between the tyre's inboard face and the rim edge the members keep ≥ 52.8 from the tyre bore. The closest member ↔ wheel pairs (static = B1 minimum) are: toe link ↔ rim 6.4, pullrod ↔ upright 6.6, UW front leg ↔ rim 8.3, LW front leg ↔ disc 8.5.

**Bodywork clearances** (diffuser per §5.6)

| Pair | Vertical (at the pickup) | 3D minimum |
|---|---|---|
| LR_R underside (140) vs outer diffuser roof top at s = 0.489 (82.2) | **57.8** | LW legs ↔ roof **54.7** |
| TLi underside (158) vs outer roof top at s = 0.661 (97.2) | **60.8** | toe link ↔ roof 58.5 |
| Inboard pickups over the central channel | ≥ 81.6 | |

- PLi underside (97) vs floor top (60): 37.
- Beam wing (z ≤ −3570): 150 from UR_R.

**Summary**

- **Bounding box (_xp):** x ∈ [105, 638], y ∈ [97, 350], z ∈ [−3558, −2926].
- **Mass** 2.9 kg per side [EST ±0.8]: legs 4 × 0.5, pullrod 0.6, toe link 0.3.
- **CoM_xp** (370, 220, −3271) [DERIVED: member midpoints].
- **Displacement:** d_W,xp = (+0.50, 0, 0) m = d_B. Stage B1.
- **Optional `gearbox_proxy`** (static, not exploded, not in the brief): box x ∈ [−120, 120], y ∈ [90, 310], z ∈ [−3550, −2550]. It gives the inboard pickups something to sit on. Its top stays below the cover skirt (320) and 15 below the UF_R / UR_R member undersides.

### 5.10 `wheel_assemblies` (×4: `wheel_fxp`, `wheel_fxn`, `wheel_rxp`, `wheel_rxn`)

Each wheel assembly is one rigid body made of these parts:

| Part | Construction |
|---|---|
| Tyre | §4.7 with W = 345 (front) or 375 (rear), R_w = 330, R_rim = 177 |
| Rim (13") | Barrel outer r = 165, inner 160. Width 305 front / 343 rear [EST ±10]. Flanges to r = 177 at WC.x ± width/2. Outboard dish with 10 spokes, 18 wide, r ∈ [40, 160], set 35 inboard of the outer flange [EST] |
| Brake disc | Annulus r ∈ [85, 139], 28 thick (R18). Centred at x = WC.x − 50 (front) / WC.x − 40 (rear) [EST], outboard of the lower-wishbone end caps (≥ 5.7) |
| Caliper | Block 60 (x) × 120 (tangential) × 70 (radial, r ∈ [95, 165]), centred at the disc's rear-upper 45° position [CHOICE] |
| Upright | Kingpin-aligned slab. Inner face = the plane through LBJ and UBJ (parallel to Z), offset +5 outboard. Thickness 60, Z-width 100, extending 30 beyond each joint. Arms reach TRo (front steering arm) and TLo (rear toe arm) from the outboard side |

**Separation rule** (needed for §7): all upright/arm material lies at x ≥ x_joint + 5 at every joint it carries. So the wheel's +X motion (faster than the suspension's) always opens a gap. The flat member end caps reach up to 30·|m̂_x| ≤ 14.9 beyond the joint, so member ↔ upright contact ends within 9.9 of relative travel (§8.10).

The caliper block (r up to 165) and the upright slab overlap the barrel and disc volumes. They are proxy geometry: intra-body, and hidden inside the tyre.

**Positions, bounding boxes, masses and CoMs** (B frame, _xp; mirror for _xn):

| Body | Wheel centre | Bounding box | Mass | CoM |
|---|---|---|---|---|
| Front | (725, 304.84, −10.37) | x [552.5, 897.5], y [−25.16, 634.84], z [−340.37, 319.63] | 17 kg [EST ±3]: tyre + rim 10.5, upright + hub + brakes 6.5 | (698.2, 304.84, −10.37) |
| Rear | (700, 201.18, −3308.74) | x [512.5, 887.5], y [−128.82, 531.18], z [−3638.74, −2978.74] | 20 kg [EST ±3]: 12.5 + 7.5 | (673.8, 201.18, −3308.74) |

The upright group sits at WC.x − 70. After M_rake every tyre's lowest point is exactly y_W = −25 (on the ground, §2.1).

**Displacement:** d_W = (±1.00, 0, 0) m = d_B, along the spindle axis X̂ [BRIEF]. Stage B1.

**Camber option** (default γ = 0 [CHOICE]; the real car ran ≈ −3° to −4.5° at the front [EST]):
- Rotate each wheel about the line through its contact point parallel to Z: `R_z(+|γ|)` for _xp, `R_z(−|γ|)` for _xn.
- The spindle axis becomes â = (±cos γ, sin|γ|, 0). Use d = 1.0·â.
- Re-check R1: at γ = −3° the front tyre's outer lower shoulder reaches x ≈ 914 > 900. That is acceptable only if the 1800 mm limit excludes tyres, which is my 2011 [REG-RECALL] reading — verify.

### 5.11 `rear_wing_DRS`

**Elements** (§4.4, span |x| ≤ 365 between the endplate inner faces) [CHOICE within R2, R5, R15]:

| Element | LE (z, y) | Chord | α | Profile | TE (z, y) |
|---|---|---|---|---|---|
| Main plane | (−3525, 775) | 230 | 12° | 6409 inverted | (−3749.98, 822.82) |
| DRS flap (closed) | (−3739.98, 834.82) | 170 | 36° | 4408 inverted | (−3877.51, 934.74) |
| Beam wing | (−3570, 390) | 140 | 15° | 4412 inverted | (−3705.23, 426.23) |

- **Flap position:** LE = main TE + (10, 12). The closed slot gap is 12 (R16).
- **Main-plane lowest point** ≈ 766.5 (at x/c = 0.3), so 36.5 above the 730 box floor.
- **Flap TE top** ≈ 936, so 14 under 950.
- **Beam wing** height window [EST/REG-RECALL].

**Endplates.** Plates at |x| ∈ [365, 375]. Side outline in (z, y): (−3490, 600) → (−3490, 950) → (−3890, 950) → (−3890, 330) → (−3600, 330). The lower-front edge is chamfered. The extension below 730 is [EST]; verify against the 2011 rear-bodywork boxes.

**Pylon.** Central plate x ∈ [−5, 5], z ∈ [−3720, −3600], running from the beam-wing top (y ≈ 430) to the main-plane underside (y ≈ 783).

**DRS kinematics** (secondary motion, independent of the explosion):
- **Pivot axis** ∥ X through P_d = flap LE + 0.85·170·ĉ = **(z −3856.88, y 919.76)**. The flap pivots near its TE and the LE lifts.
- **Opening rotation** about that axis is `R_x(−δ)`, δ ≥ 0. Here R_x(φ) maps +Z toward −Y, so φ < 0 raises the forward-lying LE:

```
q′ = P_d + R_x(−δ)·(q − P_d)        (y, z) components:
Δy′ = Δy·cos δ + Δz·sin δ
Δz′ = −Δy·sin δ + Δz·cos δ
```

- **First-order opening angle.** |LE − P_d| = 144.5. The LE moves along (0.588, 0.809) in (z, y), which is within 4.5° of the slot direction (0.640, 0.768). So gap(δ) ≈ 12 + 144.5·0.997·δ, and gap = 50 at **δ_open ≈ 0.264 rad = 15.1°**.
- **Exact angle:** solve gap(δ) = 50 by bisection on δ ∈ [10°, 20°], using the tessellated surfaces.
- **At δ = 15.1°:** the LE goes to (−3721.9, 868.2) (+33.4 up) and the TE to y = 928.9. Both stay ≤ 950.

**Summary**

- **Bounding box:** x ∈ [−375, 375], y ∈ [330, 950], z ∈ [−3890, −3490]. The TE is 581.3 behind Z_RA (R5).
- **Mass** 7 kg [EST ±2]: main 2.0, flap 1.2, endplates 2 × 1.2, beam 0.8, pylon 0.6. **CoM (0, 698, −3686)** [DERIVED].
- **Displacement:** d_W = (0, +0.50, −1.50) m, so d_B = (0, +0.45264, −1.51497). Stage A2.

### 5.12 `reference_plank`

**Geometry.** Box x ∈ [−150, 150], y ∈ [−10, 0], z ∈ [Z_RA, Z_FA − 330] = **[−3308.74, −340.37]** (length 2968.37) [BRIEF].
- Leading underside edge: 10 × 10 chamfer [CHOICE].
- Six Ø50 through-holes on x = 0 at z = −700, −1200, −1700, −2200, −2700, −3100. The count and diameter are [REG-RECALL]; the positions are [EST].

**Mass** [DERIVED from density 1.3 g/cm³, REG-RECALL band 1.3–1.45]:
- V = 300·10·2968.37 − 6·π·25²·10 = 8 905 110 − 117 810 = 8 787 300 mm³.
- m = **11.4 kg**.

**CoM** (0, −5, −1823.1) [DERIVED]. The holes' mean z (−1933.3) shifts the box centroid (−1824.56) by +1.5.

**Bounding box** = the box. **Displacement:** d_W = (0, −1.20, 0) m, so d_B = (0, −1.19941, +0.03769). Stage C2, with the floor.

---

## 6. Mass properties and rigid-body physics

### 6.1 Body table (B frame; _xn bodies are mirror images)

| Body | m (kg) | CoM (mm) |
|---|---|---|
| monocoque_survival_cell | 55.0 | (0, 360, −850) |
| nose_and_front_wing_cascade | 14.5 | (0, 287, 727) |
| engine_cover_and_sharkfin | 8.0 | (0, 700, −2150) |
| sidepod_pods ×2 | 2 × 2.5 | (±470, 350, −1800) |
| radiator_internals ×2 | 2 × 6.0 | (±440, 330, −1720) |
| floor_and_blown_diffuser | 14.0 | (0, 55, −1975) |
| exhaust_system ×2 | 2 × 2.5 | (±337.5, 157.5, −2665.6) |
| front_suspension_pushrod ×2 | 2 × 2.6 | (±411, 365, −18) |
| rear_suspension_pullrod ×2 | 2 × 2.9 | (±370, 220, −3271) |
| wheel_assemblies, front ×2 | 2 × 17.0 | (±698.2, 304.84, −10.37) |
| wheel_assemblies, rear ×2 | 2 × 20.0 | (±673.8, 201.18, −3308.74) |
| rear_wing_DRS | 7.0 | (0, 698, −3686) |
| reference_plank | 11.4 | (0, −5, −1823.1) |
| **Modelled total** | **216.9** | **(0, 291.6, −1486.3)** |

The total follows from Σm·y = 63 243.8 kg·mm and Σm·z = −322 379.4 kg·mm.

The modelled CoM in W is `y_W = c·ȳ − s·z̄ − h_F(1−c) = 338.1` (363.1 above ground) and `z_W = s·ȳ + c·z̄ + h_F·s = −1475.6`.

### 6.2 Consistency check against the 2011 weight rules [REG-RECALL]

- Car mass M = 640 kg with W_F ≥ 291 and W_R ≥ 342. The front fraction is therefore f ∈ [0.4547, 0.4656].
- Static axle load (W-frame horizontal distances, rear contact at z_W = −3300): `W_F = M·(z_cg,W + 3300)/3300`, which gives **z_cg,W ∈ [−1799.5, −1763.4]**.
- **Modelled set alone:** f = (−1475.6 + 3300)/3300 = 0.553. It is front-heavy because the engine, gearbox, KERS and driver are not in the hierarchy.
- **Non-modelled remainder:** M_res = 640 − 216.9 = **423.1 kg** (engine ≈ 95 [REG-RECALL min], gearbox ≈ 40, KERS ≈ 25, driver + seat ≈ 75, fluids, electronics, systems and ballast ≈ 188 [EST]).
- For mid-window f = 0.460, it must centre at `z_res,W = (640·(−1782.0) + 216.9·1475.6)/423.1 = −1939.1`, i.e. **z_B ≈ −1949** (taking y_res ≈ 250).
- That lies between the driver (≈ −950) and the engine/gearbox (≈ −2250 / −3000), matching the real layout. This is a plausibility check, not a recovered RB7 CoM.
- **Rake effect:** z_cg,W = s·y_cg + c·z_cg + h_F·s. With y_cg ≈ 280 [EST], rake moves the CoM 8.8 mm forward: **Δf = +0.27 %**.

### 6.3 Inertia (for optional dynamic use)

About each body's CoM, from its bounding-box extents (Δx, Δy, Δz) in B:

  `I_cm ≈ κ·(m/12)·diag(Δy² + Δz², Δx² + Δz², Δx² + Δy²)`

Use κ = 1 for compact or solid bodies (radiators, plank, members) and κ = 5/3 for thin shells (monocoque, cover, pods, floor, nose). The thin-walled box/solid box ratio is 5/3.

**Wheels** (annular cylinder, R_o = 330, R_i = 177):
- `I_axle = m(R_o² + R_i²)/2` → front 1.192 kg·m², rear 1.402 kg·m².
- `I_diam = m(3(R_o² + R_i²) + W²)/12` → front 0.765 kg·m², rear 0.936 kg·m².

**Assembly about point O:** `I_O = Σ [ R_i I_i R_iᵀ + m_i(|r_i|²E − r_i r_iᵀ) ]`, with r_i = CoM_i − O and R_i the body's rotation. R_i is M_rake's rotation block, times R_rad for the radiators.

### 6.4 Rigid-body pose during the explosion

The explosion is purely kinematic: prescribed translations, no forces, no rotation. For body i:

  `M_i(t) = T( e(s_i(t))·d_W,i ) · M_rake · M_i,local`
  `CoM_i,W(t) = M_rake·CoM_i,B + e(s_i(t))·d_W,i`

The modelled assembly's CoM drifts by `Σ m_i d_i / M`. At t = 1 that is **(0, −0.045, +0.058) m**: Σm·d_y = −9.78 kg·m and Σm·d_z = +12.6 kg·m over 216.9 kg. The exploded view stays centred on the original CoM, so it is a good orbit target for the camera.

---

## 7. Explosion kinematics

### 7.1 Law

```
s_i(t) = clamp( (t − t0_i) / (t1_i − t0_i), 0, 1 )
P_i(t) = P_i,nom + e(s_i(t))·d_i
e(s) = s                (the brief's lerp)    or    e(s) = s²(3 − 2s)    (smoothstep)
```

Every proof below needs only e(0) = 0, e(1) = 1 and e monotone, so either easing works. Assembly is the same law with t running from 1 to 0.

Two equivalent implementations:
1. A world wrapper per body with `position = e·d_W`, holding a child with the constant `M_rake`.
2. Every body inside one raked root, with `position = e·d_B`.

### 7.2 Final vectors and staging (teardown: aero shell → unsprung → underbody)

| # | Body | d_W (m) | d_B (m) | [t0, t1] | Stage |
|---|---|---|---|---|---|
| 1 | engine_cover_and_sharkfin | (0, +1.20, 0) | (0, +1.19941, −0.03769) | [0.00, 0.16] | A1 aero shell |
| 2 | rear_wing_DRS | (0, +0.50, −1.50) | (0, +0.45264, −1.51497) | [0.06, 0.22] | A2 |
| 3 | nose_and_front_wing_cascade | (0, 0, +1.80) | (0, +0.05654, +1.79911) | [0.10, 0.26] | A3 |
| 4 | sidepod_pods _xp / _xn | (±1.40, +0.10, 0) | (±1.40, +0.09995, −0.00314) | [0.20, 0.36] | A4 |
| 5 | radiator_internals _xp / _xn | (±0.70, 0, 0) | (±0.70, 0, 0) | [0.26, 0.42] | A5 |
| 6 | wheel_assemblies ×4 | (±1.00, 0, 0) | (±1.00, 0, 0) | [0.44, 0.62] | B1 unsprung |
| 7 | front_suspension_pushrod _xp / _xn | (±0.50, 0, 0) | (±0.50, 0, 0) | [0.44, 0.62] | B1 |
| 8 | rear_suspension_pullrod _xp / _xn | (±0.50, 0, 0) | (±0.50, 0, 0) | [0.44, 0.62] | B1 |
| 9 | exhaust_system _xp / _xn | (∓0.08, +0.30, −0.60) | (∓0.08, +0.28100, −0.60912) | [0.64, 0.78] | C1 underbody |
| 10 | floor_and_blown_diffuser | (0, −0.80, 0) | (0, −0.79961, +0.02513) | [0.80, 1.00] | C2 |
| 11 | reference_plank | (0, −1.20, 0) | (0, −1.19941, +0.03769) | [0.80, 1.00] | C2 |
| 12 | monocoque_survival_cell | 0 | 0 | — | anchor |

- **Conversion:** `d_B = R_x(−θ)·d_W = (d_x, c·d_y + s·d_z, −s·d_y + c·d_z)`.
- **Signs:** the upper sign is the _xp body. The exhaust's x-component points inboard (−0.08 for _xp).
- **Pauses:** 0.42–0.44, 0.62–0.64 and 0.78–0.80 separate the three teardown phases.

### 7.3 Corrections to the brief's starting magnitudes

| Body | Starting value | Final | Reason |
|---|---|---|---|
| Nose + FW | +Z 1.8 | +Z 1.8 **in W** | In B the wing would drop 56.5 mm and the endplate foot would end 12 mm above ground |
| Engine cover | +Y 1.2 | kept, in W | Must go first: its skirts sit on the pod tops |
| Sidepods | ±X 1.4, slight +Y | (±1.40, +0.10, 0) | Needs the open-inboard shell (§4.2 lemma) and the raised rear lower edge, so the pod passes over the exhaust |
| Radiators | ±X 0.7 | kept | Needs the window lag below so the pod always leads |
| Wheels / members | 1.0 / 0.5 | kept | Needs the upright separation rule (§5.10) and the chassis rod openings (§5.8) |
| Rear wing | −Z 1.5, +Y 0.5 | kept | Rearmost body; nothing behind it |
| Exhaust | −Z 0.6, +Y 0.3 | **(∓0.08, +0.30, −0.60)** | See below |
| Floor / plank | −Y 0.8 / −Y 1.2 | kept, **same window** | The plank is faster, so it always leads: Δ_plank − Δ_floor = 0.4·e ≥ 0 |

**Exhaust correction.** Without an inboard component, the exhaust's outer lip (x = 613.9) passes the exploded rear lower-wishbone front-leg bracket (x ≥ 617.5) with only **3.6 mm** lateral clearance, at the moment their y-ranges overlap (e ≈ 0.13–0.20). With d_x = −0.08 that clearance becomes **≥ 12.6 mm** (measured on the built meshes at t ≈ 0.674), rising to ≥ 50 mm by e = 0.6. During B1 the exploding legs also slide past the static exit, at 13.3 mm (t ≈ 0.559). The mirrored exhausts end 36.3 mm apart (the built collector reaches x = 98.2).

**Window lag (radiator inside the pod).** `Δ_pod(t) − Δ_rad(t) = 1.4·e((t − 0.20)/0.16) − 0.7·e((t − 0.26)/0.16) ≥ 0` for all t, because e is monotone and the radiator's argument lags. Combined with the §4.2 lemma, the radiator never touches the pod.

### 7.4 Collision-freedom by stage

- **A1 (cover ↑).** The canopy lies above everything inside its plan footprint: monocoque top, pod top edges, exhaust (skirt bottom ≥ 440 over the pipe) and rear pickups (outboard of the skirt). A pure +Y move only grows these gaps.
- **A2 (rear wing ↑ and ←).**
  - The wing starts 40 behind the cover tail and 150 behind UR_R.
  - Its own Δz is monotone rearward, so every gap grows.
- **A3 (nose →).** Frontmost body. It separates from the monocoque at the z = 350 joint. Flap 2 TE (z ≥ 405) stays ahead of the tyres (z ≤ 319.6) in pure +Z.
- **A4 (pods →).**
  - The §4.2 lemma covers the radiator and the exhaust: where the pipe lies under the pod (x > x_i), the pod's lowest edge Y_b ≥ 215 is above the pipe top ≤ 205.
  - The cover has already finished (0.16 < 0.20).
  - Tyres and suspension are z-separated, ≥ 128.7 from the pod tail to the rear tyre.
- **A5 (radiators →).** Window lag plus the lemma. The monocoque is inboard, so the gap to it only grows.
- **B1 (wheels and members →, same window).**
  - Relative motion of each wheel over its members is +0.5·e·X̂.
  - Inside the rim the members stay at r ≤ 152.2 (front) / 153.5 (rear), under the 160 barrel. Between the tyre's inboard face and the rim edge they keep ≥ 49.6 from the tyre bore. The discs lie outboard of the member end caps.
  - The upright lies at x ≥ joint + 5; member ↔ upright contact ends within 9.9 of relative travel.
  - Rods leave the chassis through the §5.8 openings (pushrod ≥ 5.4, track rod ≥ 6.2 through the travel).
  - Rear lower wishbone over the diffuser sidewall: 61.8 clearance, growing.
- **C1 (exhaust).**
  - Monocoque: z-separated, and the pipe moves rearward.
  - Floor and diffuser: the pipe rises. It reaches z ≤ Z_RA only once e ≥ 0.65, when its bottom is already ≥ 264 vs the diffuser top ≤ 125.
  - Exploded rear members: ≥ 12.6 (above).
  - Exploded tyres (x ≥ 1512) and rear wing (z ≤ −4990): far away.
- **C2 (floor and plank ↓).** Nothing lies below them except the ground (§7.5). Exploded members (y ≥ 95) sit above the descending floor.

### 7.5 Ground plane

At t = 1 the plank's front underside is at y_W = 0.684 − 1200 = −1199.3, i.e. **1174.3 below ground**. The reference-strip underside is 764.3 below. Either:
1. Fade the ground grid by e(s_C2), or
2. Apply a root lift `T(0, Λ·e(s_C2), 0)` with Λ = **1.20 m** (≥ 1.1743 + clearance), and let the camera follow C(t) from §6.4.

---

## 8. Verification asserts (for the implementation stage)

1. `M_rake·(0, 0, −3300, 1)` has y = 103.643 ± 0.001. `M_rake` maps the pivot (0, −25, 0) to itself.
2. Wheel centres in W are (±725, 305, 0) and (±700, 305, −3300). Every tyre's lowest point is at y_W = −25 ± 0.01.
3. Envelope at t = 0 (B frame):
   - x ∈ [−900, 900] and y ≤ 950.
   - z ≤ Z_FA + 1200 = **1189.63**.
   - z ≤ Z_FA + 1000 = **989.63** wherever |x| > 200.
   - z ≥ Z_RA − 600 = **−3908.74**.
4. Diffuser panel top y_r + t_D ≤ H_D on [Z_RA − 350, Z_RA] × [−490, 490] (airflow surface y_r ≤ H_D − t_D = 117). Every z-section is a single connected polyline.
5. Every suspension member: m̂·Ŷ_B = 0, chord ≤ 100, AR ≤ 3.5. The four wishbone centrelines per corner are ≤ 5° from the reference plane.
6. Nose section area at z = 1125 ≥ 9000 mm².
7. DRS: gap(0) = 12 ± 1, gap(δ_open) = 50 ± 0.5, and the flap's maximum y ≤ 950 at δ_open.
8. Σm = 216.9 kg and modelled CoM_B = (0, 291.6, −1486.3).
9. **Pairwise sweep.** For t = 0 … 1 in steps of 0.005, check every body pair for triangle–triangle intersection (BVH, e.g. three-mesh-bvh `intersectsGeometry`). The expected minimum clearances are minimum 3D surface distances on the built meshes, rounded down to 0.1:

| Pair | Expected minimum (mm) | When |
|---|---|---|
| Rim barrel ↔ front upper-wishbone rear leg | 8.3 | t = 0.44 (start of B1) |
| Exhaust lip ↔ panel top: pipe + collector / as built (F4 sleeve + F2 foil) | 8.9 / 6.4 | static |
| Floor ↔ rear tyre | 15.3 | static |
| Exhaust ↔ exploded rear lower-wishbone leg | 12.6 (12.7 at e ≈ 0.15) | C1, t ≈ 0.674 |
| Exhaust ↔ rear suspension (B1 pass) | 13.3 | t ≈ 0.559 |
| Exhaust ↔ pod lower edge (incl. F3) | 20.0 | static, and A4 |
| Radiator ↔ pod undercut (inner skin) | 16.3 | static, then growing |
| Radiator ↔ monocoque | 26.1 | static |
| Exhaust lip ↔ rear tyre | 34.7 | static |
| Cover skirt ↔ rear upper-wishbone pickup (member end cap) | 16.4 | static (16.4 during A1) |
| _xp ↔ _xn exhaust | 36.3 | t = 1 |
| Rear lower wishbone ↔ diffuser roof | 54.6 | static |
| FW flap 2 ↔ front tyre | 87.4 | static |
| Cover ↔ monocoque | 7.7 | static |
| Pushrod ↔ chassis slot | 5.9 / 5.3 | static / through B1 |
| Track rod ↔ chassis hole | 6.2 | static and B1 |
| FW endplate ↔ front tyre | 88.2 | static |
| Closest member ↔ own wheel, front / rear | 5.1 (UW rear leg ↔ caliper) / 6.3 (toe link ↔ rim) | static = B1 minimum |

If tessellation brings any of these under ~2 mm, raise the segment counts locally rather than moving hardpoints.

10. **Designed contacts.** These touching pairs are by design. Each must end within the stated relative travel; any other touching pair is a defect.

| Bodies | Parts | Why | Allowed relative travel |
|---|---|---|---|
| monocoque ↔ nose | skin ~ nose_cone | shared z = 350 station (seamless joint) | 0 |
| cover ↔ pods | canopy ~ shell | skirt = pod top inner edge at z = −2300 / −2550 / −2850 | 0 |
| floor ↔ plank | strip walls, central roof at s = 0, fence at \|x\| = 150 ~ plank | reference-strip underside y = 0 on the plank top | 0 |
| monocoque ↔ floor | skin ~ strip top plate | monocoque underside y = 60 closes the strip box | 0 |
| suspension ↔ own wheel | member ends ~ upright; track rod ~ steering arm; toe link ~ toe arm | ball joints carried by the upright; flat end caps overlap the slab | ≤ 12 (bound 9.9, §5.10) |

Designed proximity (not contact, no flag): the front UR end cap is 2.8 from the skin (chassis-bracket zone, opens in B1), and the pod lower lip is 2.3 from the monocoque (§5.4, opens in A4).

## 9. Open items (unverified — do not treat as confirmed)

- **Diffuser roof:** H_D = 125 is locked, and R9 is read as a cap on the diffuser panel top (§3 note (b)).
- **[REG-RECALL] values R14–R20** (front-wing height window, rear-wing box, DRS gaps, 1400 floor width, brake disc, nose section, 640 kg and 291/342 kg) need checking against the 2011 FIA text.
- **RB7 dimensions without public drawings** are [EST]: all station tables, hardpoints, radiator orientation, masses and h_F. Changing h_F by Δ shifts every ride height by Δ·c and leaves B-frame geometry untouched.
- **The brief's "50 mm regulatory opening"** is interpreted as a 50 mm-wide floor slot just ahead of Z_RA (§5.6).
- **Not in the hierarchy:** engine, gearbox, rockers, dampers, KERS and driver are not modelled. §6.2 accounts for them by mass only. The optional `gearbox_proxy` (§5.9) is static.
