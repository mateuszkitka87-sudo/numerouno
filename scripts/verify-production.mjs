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
  ['circle.transit', ['fill', 'stroke', 'opacity']],
  ['circle.brokerage', ['fill', 'stroke', 'opacity']],
  ['circle.export', ['fill', 'stroke', 'opacity']],
  ['.legend-text', ['fill', 'fontWeight']],
  ['.legend rect.transit', ['fill']],
  ['.legend rect.brokerage', ['fill']],
  ['.legend rect.export', ['fill']],
];

const HOVER_COUNTRIES = ['netherlands', 'germany', 'france', 'poland'];

function buildMapOnlyBaseline() {
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
      svgWidth: map.querySelector('svg')?.getBoundingClientRect().width,
      probes: {},
    };
    for (const [sel, props] of probes) {
      const el = map.querySelector(sel);
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
    document.querySelector('.ec-app__header, .ec-nav')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.ec-intro')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.ec-hint')?.style.setProperty('display', 'none', 'important');
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function screenshotSvg(page, label) {
  const handle = await page.$('#interactive-map svg');
  if (!handle) throw new Error('SVG not found');
  const file = path.join(OUT, `production-${label}-svg.png`);
  await handle.screenshot({ path: file });
  const buffer = fs.readFileSync(file);
  await handle.dispose();
  return { file, buffer };
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
  return { diffPixels: diff, comparedPixels: w * h, pct: (diff / (w * h)) * 100 };
}

async function testHover(page, country) {
  await page.evaluate((c) => {
    window.jQuery('#interactive-map #' + c).trigger('mouseleave');
  }, country);
  await new Promise((r) => setTimeout(r, 200));

  await page.evaluate((c) => {
    window.jQuery('#interactive-map #' + c).trigger('mouseenter');
  }, country);
  await new Promise((r) => setTimeout(r, 400));

  const hover = await page.evaluate((c) => {
    const popup = document.querySelector(`#interactive-map .info-text[data-name="${c}"]`);
    const cs = popup ? getComputedStyle(popup) : null;
    return {
      country: c,
      display: cs?.display,
      h3: popup?.querySelector('h3')?.textContent?.trim() || null,
      hasContent: !!(popup?.querySelector('p')?.textContent?.trim()),
    };
  }, country);

  await page.evaluate((c) => {
    window.jQuery('#interactive-map #' + c).trigger('mouseleave');
  }, country);
  await new Promise((r) => setTimeout(r, 300));

  const after = await page.evaluate((c) => {
    const popup = document.querySelector(`#interactive-map .info-text[data-name="${c}"]`);
    return { display: popup ? getComputedStyle(popup).display : null };
  }, country);

  return { hover, after };
}

async function run() {
  const embed = buildProductionEmbed();
  const harnessPath = path.join(OUT, 'wp-harness.html');
  buildWpHarness(embed, { outPath: harnessPath });
  buildMapOnlyBaseline();

  const failures = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  const productionUrl = wpHarnessFileUrl(harnessPath);
  const baselineUrl = wpHarnessFileUrl(path.join(OUT, 'map-baseline-harness.html'));

  const prodPage = await browser.newPage();
  await prodPage.setViewport({ width: 1400, height: 900 });
  await prodPage.goto(productionUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await prodPage.evaluate(() => document.querySelector('.ec-app')?.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 1200));
  await stabilizeForScreenshot(prodPage);
  const prodData = await probeMap(prodPage);
  const prodShot = await screenshotSvg(prodPage, 'production');

  const layout = await prodPage.evaluate(() => ({
    hasCoverageApp: !!document.querySelector('.ec-app'),
    hasIntro: !!document.querySelector('.ec-intro'),
    hasDetailBox: !!document.querySelector('#interactive-map .info-text .ec-detail-card'),
    hasIdlePanel: !!document.querySelector('.ec-detail-slot'),
    serviceRowCount: document.querySelectorAll('.ec-service__title').length,
    hasCard: !!document.querySelector('.map-page__card'),
    embedStyleId: document.querySelector('#sgs-e-customs-map-embed') ? 'sgs-e-customs-map-embed' : null,
    externalStylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].filter((l) => /map|layout|chrome/i.test(l.href)).length,
  }));

  if (!layout.hasCoverageApp) failures.push('Missing .ec-app wrapper');
  if (layout.hasIntro) failures.push('Coverage intro should not be present');
  if (!layout.hasDetailBox) failures.push('Missing country detail box');
  if (layout.hasIdlePanel) failures.push('Idle detail panel should not be present');
  if (layout.serviceRowCount > 0) failures.push(`Service rows present: ${layout.serviceRowCount}`);
  if (layout.hasCard) failures.push('Old card layout should not be present');
  if (layout.embedStyleId !== 'sgs-e-customs-map-embed') failures.push('Missing inline embed stylesheet');

  const hoverResults = [];
  for (const country of HOVER_COUNTRIES) {
    const result = await testHover(prodPage, country);
    hoverResults.push(result);
    if (result.hover.display !== 'block') failures.push(`Hover ${country}: popup display ${result.hover.display}`);
    if (!result.hover.h3) failures.push(`Hover ${country}: missing h3`);
    if (!result.hover.hasContent) failures.push(`Hover ${country}: missing body text`);
    if (result.after.display !== 'none') failures.push(`After hover ${country}: popup still ${result.after.display}`);
  }

  const clickTest = await prodPage.evaluate(() => {
    const logs = [];
    const orig = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    window.jQuery('#interactive-map #netherlands').trigger('click');
    console.log = orig;
    return logs;
  });

  await prodPage.close();

  const basePage = await browser.newPage();
  await basePage.setViewport({ width: 1400, height: 900 });
  await basePage.goto(baselineUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 600));
  await stabilizeForScreenshot(basePage);
  const baseData = await probeMap(basePage);
  const baseShot = await screenshotSvg(basePage, 'baseline');
  await basePage.close();
  await browser.close();

  if (baseData.pathCount !== prodData.pathCount) failures.push(`path count ${baseData.pathCount} vs ${prodData.pathCount}`);
  if (baseData.circleCount !== prodData.circleCount) failures.push(`circle count differs`);
  if (baseData.viewBox !== prodData.viewBox) failures.push(`viewBox differs`);

  for (const [sel] of SVG_PROBES) {
    const a = baseData.probes[sel];
    const b = prodData.probes[sel];
    if (!a || !b) continue;
    for (const prop of Object.keys(a)) {
      if (a[prop] !== b[prop]) failures.push(`SVG ${sel}.${prop}: ${a[prop]} vs ${b[prop]}`);
    }
  }

  const pixelCompare = comparePngBuffers(baseShot.buffer, prodShot.buffer);
  if (pixelCompare.pct > 0.05) {
    failures.push(`SVG pixel diff: ${pixelCompare.pct.toFixed(4)}% (${pixelCompare.diffPixels} px)`);
  }

  const report = {
    comparedAt: new Date().toISOString(),
    layout,
    pixelCompare,
    hoverResults,
    clickTest,
    production: prodData,
    baseline: baseData,
    failures,
    passed: failures.length === 0,
  };

  fs.writeFileSync(path.join(OUT, 'production-verify.json'), JSON.stringify(report, null, 2));
  console.log('Layout:', layout);
  console.log('SVG pixel diff:', pixelCompare.pct.toFixed(4) + '%');
  console.log('Hover countries tested:', HOVER_COUNTRIES.join(', '));
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);

  if (failures.length) process.exit(1);
  console.log('Production embed verification passed.');
}

run();
