import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] || 'rb7_threejs.html';
const workerMinify = process.argv[3] !== 'nominify';
// keep readable comments: turn full-line // comments and /** */ blocks into /*! */ legal comments (preserved by esbuild)
const tmp = 'build_src';
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
for (const f of fs.readdirSync('src')) {
  if (!/^(main|app|bodies|core|livery|spec|surfaces|verify|fingerprint|vworker)\.mjs$/.test(f)) continue;
  let s = fs.readFileSync(path.join('src', f), 'utf8');
  s = s.replace(/\/\*\*([\s\S]*?)\*\//g, (m, b) => (b.includes('*/') ? m : `/*!${b}*/`));
  s = s.replace(/^([ \t]*)\/\/(.*)$/gm, (m, ind, txt) => (txt.includes('*/') ? m : `${ind}/*!${txt} */`));
  fs.writeFileSync(path.join(tmp, f), s);
}
// 1) verification worker: classic-worker IIFE with three + three-mesh-bvh bundled in (versions pinned to the page's CDN
//    import map: three 0.160.0, three-mesh-bvh 0.7.3), because workers do not see the page's import map.
//    `three` is aliased to its per-file source entry so esbuild can tree-shake it (the prebuilt three.module.js cannot be:
//    573 KB vs 191 KB minified); it is the same r160 code the prebuilt file is rolled up from.
const wr = await esbuild.build({ entryPoints: [path.join(tmp, 'vworker.mjs')], bundle: true, format: 'iife', target: 'es2022', write: false,
  legalComments: 'none', logLevel: 'warning', minify: workerMinify, alias: { three: path.resolve('node_modules/three/src/Three.js') } });
const workerSrc = wr.outputFiles[0].text;
// 2) page bundle (three / addons / three-mesh-bvh stay external, resolved by the import map); worker source injected as a string
const r = await esbuild.build({ entryPoints: [path.join(tmp, 'main.mjs')], bundle: true, format: 'esm', target: 'es2022', write: false,
  legalComments: 'inline', external: ['three', 'three/addons/*', 'three-mesh-bvh'], logLevel: 'warning', minify: false,
  define: { __RB7_VERIFY_WORKER__: JSON.stringify(workerSrc) } });
// the bundle is inlined in a <script>: neutralise sequences that would end or alter the script element
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const tpl = fs.readFileSync('template.html', 'utf8');
fs.writeFileSync(out, tpl.replace('/*__BUNDLE__*/', () => js));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB', '(worker', (workerSrc.length / 1024).toFixed(0) + ' KB' + (workerMinify ? ' minified' : '') + ')');
