import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { buildProductionEmbed } from './assemble-page.mjs';
import { buildWpHarness, wpHarnessFileUrl } from './wp-harness.mjs';

const OUT = 'scripts/output';
fs.mkdirSync(OUT, { recursive: true });

const PROBES = [
  ['path.st0', 'st0', ['fill', 'stroke']],
  ['circle.transit', 'circle_transit', ['fill', 'opacity']],
  ['circle.brokerage', 'circle_brokerage', ['fill', 'opacity']],
  ['.info-text[data-name=netherlands]', 'panel_nl', ['display', 'position']],
];

async function run() {
  const embed = buildProductionEmbed();
  const harnessPath = path.join(OUT, 'wp-harness.html');
  buildWpHarness(embed, { outPath: harnessPath });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const embedUrl = wpHarnessFileUrl(harnessPath);
  await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  await page.waitForFunction(() => document.querySelector('#interactive-map path.st2.brokerage'), { timeout: 15000 });

  const rest = await page.evaluate((probes) => {
    const map = document.querySelector('#interactive-map');
    const out = { layout: {}, map: {} };
    const title = document.querySelector('.ec-intro__title');
    const panel = document.querySelector('.ec-detail-slot');
    const card = document.querySelector('.map-page__card');
    const embedStyle = document.querySelector('#sgs-e-customs-map-embed');
    const svg = map?.querySelector('svg');

    if (title) {
      const cs = getComputedStyle(title);
      out.layout.titleFontSize = cs.fontSize;
      out.layout.titleVisible = title.offsetParent !== null;
      out.layout.titleText = title.textContent?.trim();
    }
    out.layout.hasPanel = !!panel;
    out.layout.hasCard = !!card;
    out.layout.hasNav = !!document.querySelector('.ec-nav');
    out.layout.hasIntroLabel = document.querySelector('.ec-intro__label')?.textContent?.trim() === 'NETWORK';
    out.layout.singleInlineStyle = !!embedStyle;
    if (svg) {
      out.layout.svgWidth = Math.round(svg.getBoundingClientRect().width);
    }
    for (const [sel, key, props] of probes) {
      const el = sel.startsWith('#') ? document.querySelector(sel) : map.querySelector(sel);
      if (!el) { out.map[key] = null; continue; }
      const cs = getComputedStyle(el);
      out.map[key] = Object.fromEntries(props.map((p) => [p, cs[p === 'stroke' ? 'stroke' : p]]));
    }
    return out;
  }, PROBES);

  await page.evaluate(() => {
    window.jQuery('#interactive-map #netherlands').trigger('mouseenter');
  });
  await new Promise((r) => setTimeout(r, 500));

  const hover = await page.evaluate(() => {
    const panel = document.querySelector('.ec-detail-slot');
    const entry = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const svg = document.querySelector('#interactive-map svg');
    const pcs = entry ? getComputedStyle(entry) : null;
    const panelRect = panel?.getBoundingClientRect();
    const entryRect = entry?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    const overlapsSvg = entryRect && svgRect
      ? !(entryRect.right < svgRect.left || entryRect.left > svgRect.right || entryRect.bottom < svgRect.top || entryRect.top > svgRect.bottom)
      : null;
    return {
      panelDisplay: panel ? getComputedStyle(panel).display : null,
      entryDisplay: pcs?.display,
      entryPosition: pcs?.position,
      entryInPanel: panelRect && entryRect
        ? entryRect.left >= panelRect.left - 2 && entryRect.right <= panelRect.right + 2
        : null,
      overlapsSvg,
      hasDetailCard: !!entry?.querySelector('.ec-detail-card'),
      entryH3: entry?.querySelector('h3')?.textContent?.trim(),
    };
  });

  await page.evaluate(() => {
    window.jQuery('#interactive-map #netherlands').trigger('mouseleave');
  });
  await new Promise((r) => setTimeout(r, 300));

  const afterLeave = await page.evaluate(() => {
    const entry = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    return { entryDisplay: entry ? getComputedStyle(entry).display : null };
  });

  await page.screenshot({ path: path.join(OUT, 'mockup-rebuild.png'), fullPage: false });
  await browser.close();

  const failures = [];

  if (!rest.layout.titleVisible) failures.push('Layout title not visible');
  if (rest.layout.titleText !== 'Coverage') failures.push(`Title text: ${rest.layout.titleText}`);
  if (!rest.layout.hasPanel) failures.push('Missing detail panel');
  if (rest.layout.hasCard) failures.push('Old card layout should not be present');
  if (rest.layout.hasNav) failures.push('Site chrome nav should not be present in embed');
  if (!rest.layout.hasIntroLabel) failures.push('Missing NETWORK intro label');
  if (!rest.layout.singleInlineStyle) failures.push('Missing single inline embed stylesheet');

  if (hover.entryDisplay !== 'block') failures.push(`Panel entry display: ${hover.entryDisplay}`);
  if (hover.overlapsSvg) failures.push('Panel overlaps SVG');
  if (!hover.entryInPanel) failures.push('Panel entry not inside detail slot');
  if (!hover.hasDetailCard) failures.push('Missing detail card chrome');
  if (!hover.entryH3?.includes('Netherlands')) failures.push('Panel missing Netherlands title');
  if (afterLeave.entryDisplay !== 'none') failures.push(`After mouseleave entry still: ${afterLeave.entryDisplay}`);

  const report = { embedUrl, rest, hover, afterLeave, failures, passed: failures.length === 0 };
  fs.writeFileSync(path.join(OUT, 'ui-verify-report.json'), JSON.stringify(report, null, 2));

  console.log('Layout:', rest.layout);
  console.log('Hover:', hover);
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);

  if (failures.length > 0) process.exit(1);
  console.log('UI verification passed.');
}

run();
