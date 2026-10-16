// Load a built page in real-GPU Chrome, wait for verification to finish, and diff its results against golden/inline.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const html = process.argv[2]; const extra = process.argv.slice(3);
const url = 'file:///' + html.split('\\').join('/') + (process.env.QUERY ? '?' + process.env.QUERY : '');
const golden = JSON.parse(fs.readFileSync('golden/inline.json', 'utf8'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', ...extra], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 } });
const page = await browser.newPage();
const errs = []; const logs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' && !/ExtendedTriangle/.test(t)) errs.push(m.type() + ': ' + t.slice(0, 300)); });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.RB7 && window.RB7.V && window.RB7.V.sweep && window.RB7.V.sweep.done', { timeout: 600000, polling: 500 });
const wall = Date.now() - t0;
const gotJson = await page.evaluate(() => {
  const rep = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__' + v + '__' : v);
  const V = window.RB7.V;
  return JSON.stringify({ asserts: V.asserts, reg: V.reg, named: V.named, parts: V.parts,
    sweep: { pairs: V.sweep.pairs.map((p) => [p[0].id ?? p[0], p[1].id ?? p[1]]), queries: V.sweep.queries, results: V.sweep.results },
    badge: document.getElementById('badge').textContent, conflicts: V.conflicts.map((c) => '[' + c.kind + '] ' + c.text), timing: V.timing, done: V.done,
    usedWorkers: V.timing.workerModel !== undefined, title: document.title }, rep);
});
const got = JSON.parse(gotJson);
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `__${v}__` : v)));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);   // strict, key order included
const rows = [['asserts', eq(got.asserts, golden.asserts)], ['reg', eq(got.reg, golden.reg)], ['named', eq(got.named, golden.named)], ['parts', eq(got.parts, golden.parts)],
  ['sweep.pairs', eq(got.sweep.pairs, golden.sweep.pairs)], ['sweep.queries', got.sweep.queries === golden.sweep.queries], ['sweep.results', eq(got.sweep.results, golden.sweep.results)]];
for (const [k, ok] of rows) console.log((ok ? 'IDENTICAL ' : 'DIFFERENT ') + k);
console.log('badge   :', got.badge);
console.log('conflicts:', got.conflicts.length, got.conflicts.join(' | '));
console.log('usedWorkers:', got.usedWorkers, '| V.done:', got.done, '| wall to sweep done:', wall, 'ms');
console.log('timing  :', JSON.stringify(got.timing));
console.log('errors  :', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
process.exit(rows.every(([, ok]) => ok) && !errs.length ? 0 : 1);
