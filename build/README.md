# Build and test tooling

Sources for `../rb7_threejs.html`. That file is generated: change `src/` and rebuild, do not hand-edit the HTML. The §8 verification runs in a Web Worker that embeds its own copy of the same modules, so a hand edit to the page's constants would not reach it. The page notices (it compares a fingerprint of the model it draws with the one the worker built), logs a console error, and falls back to the slower in-thread verification.

## Build

```
npm install
npm run build          # writes ../rb7_threejs.html
```

The build is deterministic: rebuilding unchanged sources gives a byte-identical file. Versions are pinned (esbuild 0.21.5, three 0.160.0, three-mesh-bvh 0.7.3); the last two match the import map in `template.html`.

## Layout

- `src/core, spec, bodies, surfaces, livery`: geometry and the spec constants (`spec.mjs`)
- `src/verify.mjs`: §8 asserts, named clearances, part scan, pairwise BVH sweep (DOM-free)
- `src/app.mjs`, `src/main.mjs`: the page (scene, timeline, HUD, render-on-demand loop)
- `src/vworker.mjs`, `src/fingerprint.mjs`: the verification worker and the model fingerprint
- `build.mjs`: esbuild script; bundles the worker (three and three-mesh-bvh included, since workers do not see the page's import map) and injects it into the page bundle
- `template.html`: page shell with the CDN import map

## Tests

Run from this folder. The browser tools expect Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` and pass absolute paths to the HTML.

```
node src/run_verify.mjs                                  # §8 in node
node src/golden.mjs inline golden/inline.json            # reference results from the in-thread sequence
node tools/verify_compare.mjs <abs path to html>         # strict identity against the reference
QUERY=verify=inline node tools/verify_compare.mjs <abs path to html>   # same, through the in-thread fallback
node tools/visual.mjs <A.html> <B.html> shots            # 31-step pixel diff of two builds
node tools/profile.mjs --html=<abs path> --early=10 --play=17 --out=runs/x_1.json
node tools/cmp.mjs <prefixA> <prefixB> 3                 # medians of runs/<prefix>_1..3.json
```

Timing on a thin laptop drifts by up to 2x between runs as it heats up. Alternate the order of the builds being compared and use medians.
