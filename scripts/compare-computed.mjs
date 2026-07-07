import puppeteer from 'puppeteer';
import fs from 'fs';
import { createServer } from 'http';
import { execSync } from 'child_process';

const PROBES = [
  ['path.st0', 'st0'],
  ['path.st1', 'st1'],
  ['path.st2.brokerage', 'st2_brokerage'],
  ['path.st2.transit', 'st2_transit'],
  ['path.st3', 'st3'],
  ['path.st4', 'st4'],
  ['#interactive-map', 'interactive-map'],
  ['.info-text', 'info-text'],
  ['g.legend', 'legend'],
  ['.legend-text', 'legend-text'],
  ['circle.transit', 'circle_transit'],
  ['circle.brokerage', 'circle_brokerage'],
  ['circle.export', 'circle_export'],
  ['.legend rect.transit', 'legend_rect_transit'],
  ['.legend rect.brokerage', 'legend_rect_brokerage'],
  ['.legend rect.export', 'legend_rect_export'],
];

const GET_COMPUTED = (probes) => {
  const map = document.querySelector('#interactive-map');
  const out = {};
  for (const [sel, key] of probes) {
    const el = map?.querySelector(sel);
    if (!el) { out[key] = null; continue; }
    const cs = getComputedStyle(el);
    out[key] = {
      fill: cs.fill,
      stroke: cs.stroke,
      strokeWidth: cs.strokeWidth,
      color: cs.color,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      display: cs.display,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      maxWidth: cs.maxWidth,
      margin: cs.margin,
      padding: cs.padding,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius,
      top: cs.top,
      transform: cs.transform,
      transition: cs.transition,
      pointerEvents: cs.pointerEvents,
    };
  }
  out._body = {
    color: getComputedStyle(document.body).color,
    fontFamily: getComputedStyle(document.body).fontFamily,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  };
  return out;
};

async function getComputedFromUrl(url) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  if (url.includes('ecustoms')) {
    await page.evaluate(() => document.querySelector('#interactive-map')?.scrollIntoView({ block: 'center' }));
  }
  await new Promise((r) => setTimeout(r, 3000));
  const data = await page.evaluate(GET_COMPUTED, PROBES);
  await browser.close();
  return data;
}

// start local server
const server = createServer((req, res) => {
  const file = req.url === '/' || req.url === '/index.html' ? 'index.html' : req.url.slice(1);
  try {
    const content = fs.readFileSync(file);
    const type = file.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
server.listen(9876);

try {
  const wp = await getComputedFromUrl('https://ecustoms.sgs.com/');
  const local = await getComputedFromUrl('http://localhost:9876/');

  const diffs = [];
  for (const key of Object.keys(wp)) {
    if (key === '_body') continue;
    const a = wp[key];
    const b = local[key];
    if (!a && !b) continue;
    if (!a || !b) { diffs.push({ key, issue: 'missing element', wp: a, local: b }); continue; }
    for (const prop of Object.keys(a)) {
      if (a[prop] !== b[prop]) {
        diffs.push({ key, prop, wp: a[prop], local: b[prop] });
      }
    }
  }

  console.log('DIFFS:', diffs.length);
  for (const d of diffs) {
    if (d.issue) console.log(`${d.key}: ${d.issue}`);
    else console.log(`${d.key}.${d.prop}: WP="${d.wp}" LOCAL="${d.local}"`);
  }
  fs.writeFileSync('scripts/output/computed-diff.json', JSON.stringify({ wp, local, diffs }, null, 2));
} finally {
  server.close();
}
