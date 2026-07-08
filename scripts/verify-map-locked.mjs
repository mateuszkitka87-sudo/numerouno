import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { buildProductionEmbed } from './assemble-page.mjs';
import { buildWpHarness, buildLayoutBaselineHarness, wpHarnessFileUrl } from './wp-harness.mjs';

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

function buildBaselineHarness() {
  return buildLayoutBaselineHarness({ outPath: path.join(OUT, 'map-baseline-harness.html') });
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

async function stabilizeForScreenshot(page) {
  await page.evaluate(() => {
    document.querySelector('.map-page__header')?.style.setProperty('display', 'none', 'important');
    for (const sel of ['.map-page__header', '.map-page__title', '.map-page__subtitle', '.map-page__card', '.map-page__badge']) {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.animation = 'none';
        el.style.transition = 'none';
      });
    }
    const card = document.querySelector('.map-page__card');
    if (card) card.style.transform = 'none';
  });
  await new Promise((r) => setTimeout(r, 300));
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
  const embed = buildProductionEmbed();
  const harnessPath = path.join(OUT, 'wp-harness.html');
  buildWpHarness(embed, { outPath: harnessPath });
  buildBaselineHarness();

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const failures = [];

  const prodPage = await browser.newPage();
  await prodPage.setViewport({ width: 1400, height: 900 });
  await prodPage.goto(wpHarnessFileUrl(harnessPath), { waitUntil: 'networkidle2', timeout: 60000 });
  await prodPage.evaluate(() => document.querySelector('.map-page')?.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 1200));
  await stabilizeForScreenshot(prodPage);
  const prodData = await probeMap(prodPage);
  const prodShot = await screenshotSvg(prodPage, 'production');

  const baselinePage = await browser.newPage();
  await baselinePage.setViewport({ width: 1400, height: 900 });
  await baselinePage.goto(wpHarnessFileUrl(path.join(OUT, 'map-baseline-harness.html')), { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  await stabilizeForScreenshot(baselinePage);
  const baselineData = await probeMap(baselinePage);
  const baselineShot = await screenshotSvg(baselinePage, 'baseline');

  if (baselineData.pathCount !== prodData.pathCount) {
    failures.push(`path count: ${baselineData.pathCount} vs ${prodData.pathCount}`);
  }
  if (baselineData.circleCount !== prodData.circleCount) {
    failures.push(`circle count: ${baselineData.circleCount} vs ${prodData.circleCount}`);
  }
  if (baselineData.viewBox !== prodData.viewBox) {
    failures.push(`viewBox: ${baselineData.viewBox} vs ${prodData.viewBox}`);
  }
  if (Math.abs(baselineData.svgWidth - prodData.svgWidth) > 1) {
    failures.push(`svg width: ${baselineData.svgWidth} vs ${prodData.svgWidth}`);
  }
  if (baselineShot.box && prodShot.box) {
    if (Math.abs(baselineShot.box.width - prodShot.box.width) > 1) {
      failures.push(`screenshot width: ${baselineShot.box.width} vs ${prodShot.box.width}`);
    }
    if (Math.abs(baselineShot.box.height - prodShot.box.height) > 1) {
      failures.push(`screenshot height: ${baselineShot.box.height} vs ${prodShot.box.height}`);
    }
  }

  for (const [sel] of SVG_PROBES) {
    const a = baselineData.probes[sel];
    const b = prodData.probes[sel];
    if (!a || !b) {
      if (a !== b) failures.push(`probe missing: ${sel}`);
      continue;
    }
    for (const prop of Object.keys(a)) {
      if (a[prop] !== b[prop]) failures.push(`${sel}.${prop}: baseline=${a[prop]} production=${b[prop]}`);
    }
  }

  const pixelCompare = comparePngBuffers(baselineShot.buffer, prodShot.buffer);
  if (pixelCompare.pct > 0.05) {
    failures.push(`SVG pixel diff: ${pixelCompare.diffPixels}/${pixelCompare.comparedPixels} (${pixelCompare.pct.toFixed(4)}%)`);
  }

  await prodPage.evaluate(() => window.jQuery('#interactive-map #netherlands').trigger('mouseenter'));
  await new Promise((r) => setTimeout(r, 500));
  const hover = await prodPage.evaluate(() => {
    const p = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const cs = p ? getComputedStyle(p) : null;
    return { display: cs?.display, h3: p?.querySelector('h3')?.textContent?.trim() };
  });
  await prodPage.evaluate(() => window.jQuery('#interactive-map #netherlands').trigger('mouseleave'));
  await browser.close();

  if (hover.display !== 'block') failures.push(`hover popup: ${hover.display}`);
  if (!hover.h3?.includes('Netherlands')) failures.push('hover popup content missing');

  const report = {
    comparedAt: new Date().toISOString(),
    containerWidth: Math.round(prodData.mapWidth),
    baseline: { data: baselineData, screenshot: baselineShot.file },
    production: { data: prodData, screenshot: prodShot.file },
    screenshotDiffPercent: pixelCompare.pct,
    pixelCompare,
    hover,
    failures,
    passed: failures.length === 0,
  };

  fs.writeFileSync(path.join(OUT, 'map-locked-verify.json'), JSON.stringify(report, null, 2));
  console.log('Container width:', Math.round(prodData.mapWidth));
  console.log('SVG pixel diff:', pixelCompare.pct.toFixed(4) + '%', `(${pixelCompare.diffPixels} px)`);
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);
  if (failures.length) process.exit(1);
  console.log('Map locked verification passed (pixel-identical SVG).');
}

run();
