import puppeteer from 'puppeteer';
import fs from 'fs';
import https from 'https';
import path from 'path';

const OUT = 'scripts/output';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

const PROBES = [
  ['path.st0', 'st0'],
  ['path.st2.brokerage', 'st2_brokerage'],
  ['circle.transit', 'circle_transit'],
  ['circle.brokerage', 'circle_brokerage'],
  ['.legend rect.transit', 'legend_transit'],
  ['.legend rect.brokerage', 'legend_brokerage'],
  ['.legend rect.export', 'legend_export'],
  ['g.legend', 'legend'],
  ['.legend-text', 'legend_text'],
  ['.info-text', 'info_text'],
  ['#interactive-map', 'map'],
];

const GET = (probes) => {
  const map = document.querySelector('#interactive-map');
  const out = {};
  for (const [sel, key] of probes) {
    const el = sel === '#interactive-map' ? map : map?.querySelector(sel);
    if (!el) {
      out[key] = null;
      continue;
    }
    const cs = getComputedStyle(el);
    out[key] = {
      fill: cs.fill,
      stroke: cs.stroke,
      strokeWidth: cs.strokeWidth,
      color: cs.color,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      width: cs.width,
      maxWidth: cs.maxWidth,
      margin: cs.margin,
      backgroundColor: cs.backgroundColor,
      display: cs.display,
    };
  }
  return out;
};

async function loadThemeCss() {
  const urls = [
    'https://ecustoms.sgs.com/wp-content/themes/dt-the7/css/main.min.css?ver=14.0.1',
    'https://ecustoms.sgs.com/wp-content/plugins/js_composer/assets/css/js_composer.min.css?ver=8.7.2',
    'https://ecustoms.sgs.com/wp-content/themes/dt-the7/css/wpbakery.min.css?ver=14.0.1',
    'https://ecustoms.sgs.com/wp-content/custom_codes/1243-scss-output.css?ver=278',
  ];
  const blocks = [];
  for (const url of urls) {
    blocks.push(`/* ${url} */\n${await fetch(url)}`);
  }
  return blocks.join('\n\n');
}

const embedHtml = fs.readFileSync('index.html', 'utf8');
const themeCss = await loadThemeCss();

const harness = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,600,700,normal">
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <style id="theme-css">${themeCss.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body id="the7-body" class="home wp-singular page">
  <div id="page" class="closed-mobile-header">
    <div id="main" class="sidebar-none">
      <div class="wf-wrap">
        <div id="content" class="content">
          <div class="wpb-content-wrapper">
            <div class="vc_row wpb_row vc_row-fluid">
              <div class="wpb_column vc_column_container vc_col-sm-12">
                <div class="vc_column-inner">
                  <div class="wpb_wrapper">
                    <div class="wpb_raw_code wpb_raw_html wpb_content_element">
                      <div class="wpb_wrapper">
                        ${embedHtml}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(OUT, 'wp-harness.html'), harness);

async function snapshot(url, label) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  if (url.includes('ecustoms')) {
    await page.evaluate(() => document.querySelector('#interactive-map')?.scrollIntoView({ block: 'center' }));
  }
  await page.waitForFunction(() => {
    const el = document.querySelector('#interactive-map path.st2.brokerage');
    return !!el;
  }, { timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  const data = await page.evaluate(GET, PROBES);
  const clip = await page.evaluate(() => {
    const m = document.querySelector('#interactive-map');
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 720) };
  });
  await page.screenshot({ path: path.join(OUT, `verify-${label}.png`), clip });
  await browser.close();
  return data;
}

const harnessPath = 'file://' + process.cwd() + '/' + OUT + '/wp-harness.html';
const harnessData = await snapshot(harnessPath, 'wp-harness');
const liveData = await snapshot('https://ecustoms.sgs.com/', 'live-site');

const diffs = [];
for (const key of Object.keys(liveData)) {
  const a = liveData[key];
  const b = harnessData[key];
  if (!a || !b) {
    if (a || b) diffs.push({ key, issue: 'missing', live: a, harness: b });
    continue;
  }
  for (const prop of ['fill', 'stroke', 'strokeWidth', 'color', 'fontSize']) {
    if (a[prop] !== b[prop]) diffs.push({ key, prop, live: a[prop], harness: b[prop] });
  }
}

const report = { harnessPath, diffs, liveData, harnessData };
fs.writeFileSync(path.join(OUT, 'wp-verify-report.json'), JSON.stringify(report, null, 2));

console.log('Diffs:', diffs.length);
for (const d of diffs) {
  if (d.issue) console.log(`${d.key}: ${d.issue}`);
  else console.log(`${d.key}.${d.prop}: live=${d.live} harness=${d.harness}`);
}

if (diffs.length > 0) process.exit(1);
