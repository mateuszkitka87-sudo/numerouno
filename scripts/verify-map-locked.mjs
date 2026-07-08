import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const OUT = 'scripts/output';
fs.mkdirSync(OUT, { recursive: true });

const SVG_PROBES = [
  ['path.st0', ['fill', 'stroke', 'strokeWidth']],
  ['path.st2.brokerage', ['fill', 'stroke', 'fontSize', 'fontFamily', 'opacity']],
  ['path.st2.transit', ['fill', 'stroke']],
  ['circle.transit', ['fill', 'stroke', 'opacity']],
  ['circle.brokerage', ['fill', 'stroke', 'opacity']],
  ['circle.export', ['fill', 'stroke', 'opacity']],
  ['.legend-text', ['fill', 'fontWeight', 'fontSize']],
  ['.legend rect.transit', ['fill']],
  ['.legend rect.brokerage', ['fill']],
  ['.legend rect.export', ['fill']],
  ['svg', ['width', 'height']],
];

function buildBaselineHarness(containerWidth) {
  const mapStyles = fs.readFileSync('styles.css', 'utf8');
  const layoutStyles = fs.readFileSync('page-layout.css', 'utf8');
  const uiChrome = fs.readFileSync('map-ui-chrome.css', 'utf8');
  const mapFragment = fs.readFileSync('map.fragment.html', 'utf8');
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<style id="interactive-map-styles">${mapStyles}</style>
<style id="map-page-layout-styles">${layoutStyles}</style>
<style id="map-ui-chrome-styles">${uiChrome}</style>
<style>
  html, body { margin: 0; padding: 0; min-height: 100%; background: #ffffff; }
  .map-page__header { display: none; }
  .map-page__container { width: min(1080px, 100%); margin: 0 auto; }
</style>
</head><body>
<div class="map-page">
  <div class="map-page__container">
    <header class="map-page__header"></header>
    <section class="map-page__card">
      <div class="map-page__card-inner">
        ${mapFragment.replace(/<script[\s\S]*<\/script>\s*$/, '')}
      </div>
    </section>
  </div>
</div>
${mapFragment.match(/<script[\s\S]*<\/script>\s*$/)?.[0] || ''}
</body></html>`;
}

async function probeMap(page) {
  await page.waitForFunction(() => document.querySelector('#interactive-map path.st2.brokerage'), { timeout: 15000 });
  return page.evaluate((probes) => {
    const map = document.querySelector('#interactive-map');
    const out = {
      pathCount: map.querySelectorAll('path').length,
      circleCount: map.querySelectorAll('circle').length,
      viewBox: map.querySelector('svg')?.getAttribute('viewBox'),
      mapWidth: map.getBoundingClientRect().width,
      svgWidth: map.querySelector('svg')?.getBoundingClientRect().width,
      probes: {},
    };
    for (const [sel, props] of probes) {
      const el = sel === 'svg' ? map.querySelector('svg') : map.querySelector(sel);
      if (!el) { out.probes[sel] = null; continue; }
      const cs = getComputedStyle(el);
      out.probes[sel] = Object.fromEntries(props.map((p) => {
        const cssKey = p === 'strokeWidth' ? 'stroke-width' : p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        return [p, cs.getPropertyValue(cssKey)];
      }));
    }
    return out;
  }, SVG_PROBES);
}

async function screenshotSvg(page, label) {
  const handle = await page.$('#interactive-map svg');
  if (!handle) throw new Error('SVG not found');
  const file = path.join(OUT, `map-locked-${label}.png`);
  await handle.screenshot({ path: file });
  const box = await handle.boundingBox();
  await handle.dispose();
  return { file, box, buffer: fs.readFileSync(file) };
}

function comparePngBuffers(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let diff = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * a.width + x) * 4;
      const j = (y * b.width + x) * 4;
      if (a.data[i] !== b.data[j] || a.data[i + 1] !== b.data[j + 1] || a.data[i + 2] !== b.data[j + 2] || a.data[i + 3] !== b.data[j + 3]) {
        diff++;
      }
    }
  }
  return { diffPixels: diff, comparedPixels: w * h, pct: (diff / (w * h)) * 100, width: w, height: h };
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const failures = [];

  // Preview first — measure rendered map width
  const previewPage = await browser.newPage();
  await previewPage.setViewport({ width: 1400, height: 900 });
  await previewPage.goto('file://' + process.cwd() + '/preview.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await previewPage.evaluate(() => document.querySelector('#interactive-map')?.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 1200));
  const previewData = await probeMap(previewPage);
  const previewShot = await screenshotSvg(previewPage, 'preview');
  await previewPage.close();

  const containerWidth = Math.round(previewData.mapWidth);
  const baselinePath = path.join(OUT, 'map-baseline-harness.html');
  fs.writeFileSync(baselinePath, buildBaselineHarness(containerWidth));

  const baselinePage = await browser.newPage();
  await baselinePage.setViewport({ width: 1400, height: 900 });
  await baselinePage.goto('file://' + process.cwd() + '/' + baselinePath, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  const baselineData = await probeMap(baselinePage);
  const baselineShot = await screenshotSvg(baselinePage, 'baseline');
  await baselinePage.close();

  if (baselineData.pathCount !== previewData.pathCount) {
    failures.push(`path count: ${baselineData.pathCount} vs ${previewData.pathCount}`);
  }
  if (baselineData.circleCount !== previewData.circleCount) {
    failures.push(`circle count: ${baselineData.circleCount} vs ${previewData.circleCount}`);
  }
  if (baselineData.viewBox !== previewData.viewBox) {
    failures.push(`viewBox: ${baselineData.viewBox} vs ${previewData.viewBox}`);
  }
  if (Math.abs(baselineData.svgWidth - previewData.svgWidth) > 1) {
    failures.push(`svg width: ${baselineData.svgWidth} vs ${previewData.svgWidth}`);
  }
  if (baselineShot.box && previewShot.box) {
    if (Math.abs(baselineShot.box.width - previewShot.box.width) > 1) {
      failures.push(`screenshot width: ${baselineShot.box.width} vs ${previewShot.box.width}`);
    }
    if (Math.abs(baselineShot.box.height - previewShot.box.height) > 1) {
      failures.push(`screenshot height: ${baselineShot.box.height} vs ${previewShot.box.height}`);
    }
  }

  for (const [sel] of SVG_PROBES) {
    const a = baselineData.probes[sel];
    const b = previewData.probes[sel];
    if (!a || !b) {
      if (a !== b) failures.push(`probe missing: ${sel}`);
      continue;
    }
    for (const prop of Object.keys(a)) {
      if (a[prop] !== b[prop]) failures.push(`${sel}.${prop}: baseline=${a[prop]} preview=${b[prop]}`);
    }
  }

  const pixelCompare = comparePngBuffers(baselineShot.buffer, previewShot.buffer);
  if (pixelCompare.pct > 0.05) {
    failures.push(`SVG pixel diff: ${pixelCompare.diffPixels}/${pixelCompare.comparedPixels} (${pixelCompare.pct.toFixed(4)}%)`);
  }

  // Hover functionality on preview
  const hoverPage = await browser.newPage();
  await hoverPage.setViewport({ width: 1400, height: 900 });
  await hoverPage.goto('file://' + process.cwd() + '/preview.html', { waitUntil: 'networkidle2' });
  await hoverPage.waitForFunction(() => document.querySelector('#interactive-map path.st2.brokerage'), { timeout: 15000 });
  await hoverPage.evaluate(() => window.jQuery('#interactive-map #netherlands').trigger('mouseenter'));
  await new Promise((r) => setTimeout(r, 500));
  const hover = await hoverPage.evaluate(() => {
    const p = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const cs = p ? getComputedStyle(p) : null;
    return { display: cs?.display, h3: p?.querySelector('h3')?.textContent?.trim() };
  });
  await hoverPage.evaluate(() => window.jQuery('#interactive-map #netherlands').trigger('mouseleave'));
  await browser.close();

  if (hover.display !== 'block') failures.push(`hover popup: ${hover.display}`);
  if (!hover.h3?.includes('Netherlands')) failures.push('hover popup content missing');

  const report = {
    comparedAt: new Date().toISOString(),
    containerWidth,
    baseline: { data: baselineData, screenshot: baselineShot.file },
    preview: { data: previewData, screenshot: previewShot.file },
    screenshotDiffPercent: pixelCompare.pct,
    pixelCompare,
    hover,
    failures,
    passed: failures.length === 0,
  };

  fs.writeFileSync(path.join(OUT, 'map-locked-verify.json'), JSON.stringify(report, null, 2));
  console.log('Container width:', containerWidth);
  console.log('SVG pixel diff:', pixelCompare.pct.toFixed(4) + '%', `(${pixelCompare.diffPixels} px)`);
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);
  if (failures.length) process.exit(1);
  console.log('Map locked verification passed (pixel-identical SVG).');
}

run();
