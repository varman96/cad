// Visual / interaction regression: same action script on page A and page B (real GPU, 1280x800 @1.5), pixel-diff every screenshot.
// usage: node visual.mjs <A.html> <B.html> [outdir]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [A, B, outDir = 'shots'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(html, tag) {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
    args: ['--no-sandbox', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 } });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///' + html.split('\\').join('/'), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.RB7 && window.RB7.V && window.RB7.V.sweep && window.RB7.V.sweep.done', { timeout: 600000, polling: 500 });
  await sleep(800);
  const shots = [];
  const snap = async (name, settle = 700) => { await sleep(settle); shots.push({ name, png: await page.screenshot({ type: 'png' }) }); };
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const cam = () => ev(() => { const c = window.RB7.camera.position, t = window.RB7.controls.target; return [c.x, c.y, c.z, t.x, t.y, t.z].map((v) => +v.toFixed(4)); });
  const cams = [];
  const note = async (n) => cams.push([n, await cam()]);

  await snap('00_initial_iso_t0');
  for (const v of ['top', 'side', 'sideR', 'front', 'rear', 'isoR', 'iso']) { await ev((x) => window.RB7.setView(x), v); await snap('view_' + v); }
  for (const t of [0.15, 0.3, 0.5, 0.7, 0.9, 1.0]) { await ev((x) => window.RB7.applyT(x), t); await snap('t_' + t); }
  await ev(() => window.RB7.applyT(0.5));
  // slider scrub through the real UI element
  await ev(() => { const s = document.getElementById('slider'); s.value = 420; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await snap('slider_420');
  await ev(() => window.RB7.applyT(0)); await ev(() => window.RB7.setView('rear'));
  await page.click('#optDrs'); await snap('drs_open_rear', 2200);
  await page.click('#optDrs'); await snap('drs_closed_rear', 2200);
  await ev(() => window.RB7.setView('iso')); await ev(() => window.RB7.applyT(0.4));
  await page.click('#optWire'); await snap('wireframe_on'); await page.click('#optWire'); await snap('wireframe_off');
  await page.click('#optDecals'); await snap('decals_off'); await page.click('#optDecals'); await snap('decals_on');
  await page.click('#optGear'); await snap('gearbox_on'); await page.click('#optGear'); await snap('gearbox_off');
  await ev(() => window.RB7.highlight(['monocoque_survival_cell', 'wheel_fxp'], 0)); await snap('highlight_on');
  await ev(() => window.RB7.highlight([], 0)); await snap('highlight_off');
  await page.select('#optGround', 'lift'); await ev(() => window.RB7.applyT(1)); await snap('ground_lift_t1');
  await page.select('#optGround', 'fade'); await ev(() => window.RB7.applyT(0.4)); await snap('ground_fade_t04');
  // keyboard: frame all, DRS key
  await page.keyboard.press('f'); await snap('key_frameAll');
  // mouse orbit + wheel zoom (camera-only changes: shadow map must still be right)
  await ev(() => { window.RB7.applyT(0.4); window.RB7.setView('iso'); });
  await sleep(500);
  await page.mouse.move(640, 420); await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(640 + i * 14, 420 - i * 5); await sleep(16); }
  await page.mouse.up(); await snap('orbit_after_drag', 2500); await note('orbit');
  await page.mouse.move(640, 420);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel({ deltaY: -240 }); await sleep(40); }
  await snap('wheel_zoom_in', 2500); await note('zoom');
  // resize
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1.5 }); await snap('resize_1000x700', 1200);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 }); await snap('resize_back_1280x800', 1200);
  // open the report panel (DOM only)
  await page.click('#badge'); await snap('report_open');
  const reportText = await ev(() => document.getElementById('report').innerText);
  await page.click('#repClose');
  const badge = await ev(() => document.getElementById('badge').textContent);
  await browser.close();
  return { shots, errs, badge, cams, reportText };
}

const a = await run(A, 'A'); const b = await run(B, 'B');

// pixel diff inside Chrome (no PNG decoder needed)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');
const rows = [];
for (let i = 0; i < a.shots.length; i++) {
  const sa = a.shots[i], sb = b.shots.find((s) => s.name === sa.name);
  fs.writeFileSync(path.join(outDir, 'A_' + sa.name + '.png'), sa.png); if (sb) fs.writeFileSync(path.join(outDir, 'B_' + sa.name + '.png'), sb.png);
  if (!sb) { rows.push({ name: sa.name, missing: true }); continue; }
  const r = await page.evaluate(async (x, y) => {
    const load = async (b64) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return { w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data }; };
    const p = await load(x), q = await load(y);
    if (p.w !== q.w || p.h !== q.h) return { size: [p.w, p.h, q.w, q.h] };
    let n = 0, n8 = 0, mx = 0; const px = p.w * p.h;
    for (let i = 0; i < p.d.length; i += 4) { const d = Math.max(Math.abs(p.d[i] - q.d[i]), Math.abs(p.d[i + 1] - q.d[i + 1]), Math.abs(p.d[i + 2] - q.d[i + 2])); if (d) { n++; if (d > 8) n8++; if (d > mx) mx = d; } }
    return { px, n, n8, mx };
  }, sa.png.toString('base64'), sb.png.toString('base64'));
  rows.push({ name: sa.name, ...r });
}
await browser.close();
console.log('screenshot'.padEnd(26), 'differing px'.padStart(13), '(>8 levels)'.padStart(12), 'maxΔ'.padStart(5), '  % of frame');
let worst = 0;
for (const r of rows) {
  if (r.missing || r.size) { console.log(r.name.padEnd(26), r.missing ? 'MISSING' : 'SIZE ' + r.size); worst = 1e9; continue; }
  worst = Math.max(worst, r.n8);
  console.log(r.name.padEnd(26), String(r.n).padStart(13), String(r.n8).padStart(12), String(r.mx).padStart(5), '  ' + (100 * r.n / r.px).toFixed(4) + '%');
}
{ const la = a.reportText.split(/\r?\n/), lb = b.reportText.split(/\r?\n/); const d = []; for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) d.push(['A: ' + la[i], 'B: ' + lb[i]]);
  console.log('report text: ' + la.length + ' lines, ' + d.length + ' differ'); for (const [x, y] of d.slice(0, 4)) { console.log('   ' + (x || '').slice(0, 230)); console.log('   ' + (y || '').slice(0, 230)); } }
console.log('page errors  A:', a.errs.length, ' B:', b.errs.length, '| badge A:', a.badge, '| badge B:', b.badge);
console.log('camera after orbit/zoom  A:', JSON.stringify(a.cams)); console.log('                         B:', JSON.stringify(b.cams));
console.log(worst === 0 ? 'RESULT: no pixel differs by more than 8 levels in any screenshot' : 'RESULT: see rows above');
