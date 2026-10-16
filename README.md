# RB7 exploded view

A parametric Three.js model of the 2011 Red Bull RB7. It explodes into 20 rigid bodies in a staged teardown, and the page checks its own geometry every time it loads.

Open `rb7_threejs.html` in a browser. It loads Three.js r160 and three-mesh-bvh 0.7.3 from a CDN, so it needs network on first load.

## Why it's built this way

Most car renders are lookalikes. This one starts from a written spec (`rb7_math_spec.md`) that defines the frame, the rake transform, the diffuser, the suspension hardpoints and the explosion kinematics as math, with no code. Values are tagged: `[BRIEF]` from the brief, `[REG-RECALL]` from memory and flagged for checking, `[EST ±r]` an estimate, `[DERIVED]`, or `[CHOICE]` a design decision.

## How it was built

1. **Math before code.** The full geometry was written down before any implementation started.
2. **Handedness.** With +Y up and +Z forward, a right-handed Three.js frame puts the brief's "+X = starboard" on the car's left. Every component is symmetric about x = 0, so no geometry changes. Sided bodies are named by sign (`_xp`, `_xn`), not port and starboard.
3. **Literal build, loud flags.** The builder implemented the spec as written and logged anything ambiguous instead of silently resolving it. The pylon top sits at 337.6 at the real surface, not the 308 the spec prints. The F3 foil had no definition. Suspension clevis brackets had no dimensions, so they were not modelled.
4. **Self-check on load.** Eleven asserts (A0 to A8, including A3b and A4s) plus a pairwise BVH sweep over 190 body pairs and 201 timeline samples. A Lipschitz bound certifies the gaps between samples.

## What the first build found

The first build passed 10 of 11 asserts. The one that failed (A4s) was a real spec conflict: the 8 mm diffuser panel put its top at 133 against a 125 cap. The sweep flagged 10 numbered conflicts (C1 to C10), plus 4 interference groups, 3 near-misses under 2 mm, and 5 clearances below the spec's own table. Examples:

- The front wishbone legs ran through the rim until the wheel had slid about 63 mm.
- The rear wishbone legs ran through the tyre, and the toe link and pullrod through the rim, until about 78 mm of relative travel.
- The exhaust sat 12.7 mm from the rear lower leg, not the 14 mm the spec claimed.

Hardpoints were not moved on the builder's own initiative. Each conflict went to a ruling first.

## The corrections round

Eight changes, each ruled and re-measured on the built geometry. Nothing else moved. H_D stays locked at 125.

- **Diffuser:** the 125 cap applies to the top of the bodywork, so the airflow surface drops to 117.
- **Front endplate:** made parallel to Z (outer face 850, inner face 840), so every element tip meets it along its chord.
- **Engine cover:** two skirt stations lowered to clear the monocoque skin.
- **Chassis openings:** pushrod slot and track-rod hole resized to clear the rods through full travel.
- **Suspension:** front and rear upper wishbones moved as rigid translations in y, disc offsets adjusted, tolerance tightened from 30 mm to 12 mm.
- **F3 foil** defined. The expected-clearance table now uses values measured on the meshes.

Result: 11 of 11 asserts pass and the sweep flags 0 interferences over 190 pairs.

## Numbers worth knowing

- **Rake:** the rear rises L·sin(1.8°) = 103.7 mm relative to the front. The front contact patch sits 10.37 mm off the axle datum, so wheel centres are authored at inverse-raked positions and all four contact patches land on the ground.
- **DRS:** the spec's first-order estimate (15.1°) is 2.7° low. Bisection on the tessellated surfaces gives 17.8° open, with an 11.8 mm closed gap.
- **Phantom distance:** three-mesh-bvh's `closestPointToGeometry` returned 0 for a ~200 mm gap whenever `maxThreshold` was 100 or more. The sweep uses 15, so its report is unaffected.
- **Tyres:** tessellated 64 × 48, with the phase rotated so a vertex sits at the lowest point. The A2 ground check needs it.
- **Mass:** 216.9 kg modelled, CoM at (0, 291.6, −1486.3) in body frame after corrections.

## Controls

`Space` play/pause · `R` reverse · slider scrubs · `D` DRS · `F` frame all · top-right badge opens the §8 report.

## Known limits

- Livery is stylised: generic bull silhouettes, not trademark artwork. Sponsor names are plain text.
- Not modelled: suspension clevis brackets, the pushrod rocker, hub bodies. The gearbox is an optional proxy, hidden by default.
- R14 to R20 are from memory and not checked against the FIA text. Masses marked EST are estimates.
- The neutral front-wing section is NACA 0010, a stand-in for the mandated profile.
- The camber option is in the spec but not exposed in the page.

## Files

- `rb7_math_spec.md`: the derivation, revision 2026-10-15
- `rb7_threejs.html`: the single-file build, 4,088 lines. The §8 verification runs in a Web Worker whose source is embedded as one minified line (with its own copy of three and three-mesh-bvh, same versions as the CDN pins)
- `build/`: the module sources, esbuild script and test tools that generate `rb7_threejs.html` (see `build/README.md`)
- `RB7_HANDOFF.md`: first-build report (superseded)
- `RB7_SPEC_CORRECTIONS.md`: rulings and re-measured values
