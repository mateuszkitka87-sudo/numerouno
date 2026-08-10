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
    const card = document.querySelector('.map-page__card');
    const embedStyle = document.querySelector('#sgs-e-customs-map-embed');
    const svg = map?.querySelector('svg');

    if (title) {
      const cs = getComputedStyle(title);
      out.layout.titleFontSize = cs.fontSize;
      out.layout.titleVisible = title.offsetParent !== null;
      out.layout.titleText = title.textContent?.trim();
    }
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
    const title = document.querySelector('.ec-intro__title');
    const entry = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const mapStage = document.querySelector('.ec-map__stage');
    const workspace = document.querySelector('.ec-workspace');
    const pcs = entry ? getComputedStyle(entry) : null;
    const titleRect = title?.getBoundingClientRect();
    const entryRect = entry?.getBoundingClientRect();
    const mapRect = mapStage?.getBoundingClientRect();
    const workspaceRect = workspace?.getBoundingClientRect();
    const visiblePanels = [...document.querySelectorAll('#interactive-map > .info-text')].filter(
      (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0
    );
    const belowMap = visiblePanels.filter((el) => el.getBoundingClientRect().top > (mapRect?.bottom ?? 0) + 5);
    return {
      entryDisplay: pcs?.display,
      entryPosition: pcs?.position,
      alignedWithCoverage: titleRect && entryRect
        ? Math.abs(entryRect.left - titleRect.left) <= 2
        : null,
      entryTop: entryRect ? Math.round(entryRect.top) : null,
      entryLeft: entryRect ? Math.round(entryRect.left) : null,
      entryWidth: entryRect ? Math.round(entryRect.width) : null,
      visiblePanelCount: visiblePanels.length,
      belowMapCount: belowMap.length,
      workspaceHeight: workspaceRect ? Math.round(workspaceRect.height) : null,
      mapHeight: mapRect ? Math.round(mapRect.height) : null,
      scrollHeight: document.documentElement.scrollHeight,
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

  const stabilityBefore = await page.evaluate(() => {
    const pick = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    };
    return {
      map: pick('#interactive-map'),
      svg: pick('#interactive-map svg'),
      workspace: pick('.ec-workspace'),
    };
  });

  const hoverCountries = ['france', 'germany', 'poland'];
  const stabilityDuring = [];
  for (const country of hoverCountries) {
    await page.evaluate((c) => {
      window.jQuery('#interactive-map #' + c).trigger('mouseenter');
    }, country);
    await new Promise((r) => setTimeout(r, 120));
    const snap = await page.evaluate(() => {
      const pick = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
      };
      return {
        map: pick('#interactive-map'),
        svg: pick('#interactive-map svg'),
        workspace: pick('.ec-workspace'),
      };
    });
    stabilityDuring.push({ country, ...snap });
    await page.evaluate((c) => {
      window.jQuery('#interactive-map #' + c).trigger('mouseleave');
    }, country);
    await new Promise((r) => setTimeout(r, 120));
  }

  const stabilityAfter = await page.evaluate(() => {
    const pick = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    };
    return {
      map: pick('#interactive-map'),
      svg: pick('#interactive-map svg'),
      workspace: pick('.ec-workspace'),
    };
  });

  await page.screenshot({ path: path.join(OUT, 'mockup-rebuild.png'), fullPage: false });
  await browser.close();

  const failures = [];

  if (!rest.layout.titleVisible) failures.push('Layout title not visible');
  if (rest.layout.titleText !== 'Coverage') failures.push(`Title text: ${rest.layout.titleText}`);
  if (rest.layout.hasCard) failures.push('Old card layout should not be present');
  if (rest.layout.hasNav) failures.push('Site chrome nav should not be present in embed');
  if (!rest.layout.hasIntroLabel) failures.push('Missing NETWORK intro label');
  if (!rest.layout.singleInlineStyle) failures.push('Missing single inline embed stylesheet');

  if (hover.entryDisplay !== 'block') failures.push(`Panel entry display: ${hover.entryDisplay}`);
  if (!hover.alignedWithCoverage) failures.push('Panel not aligned with Coverage title');
  if (hover.visiblePanelCount !== 1) failures.push(`Expected 1 visible panel, got ${hover.visiblePanelCount}`);
  if (hover.belowMapCount > 0) failures.push('Country detail appears below map section');
  if (hover.entryTop !== 72) failures.push(`Panel top: ${hover.entryTop} (expected 72)`);
  if (hover.entryLeft !== 24) failures.push(`Panel left: ${hover.entryLeft} (expected 24)`);
  if (hover.entryWidth !== 300) failures.push(`Panel width: ${hover.entryWidth} (expected 300)`);

  const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const mapStable = stabilityDuring.every(
    (d) => sameRect(d.map, stabilityBefore.map) && sameRect(d.svg, stabilityBefore.svg) && sameRect(d.workspace, stabilityBefore.workspace)
  ) && sameRect(stabilityAfter.map, stabilityBefore.map) && sameRect(stabilityAfter.svg, stabilityBefore.svg);

  if (!mapStable) failures.push('Map/SVG/workspace rects shifted during country hover');
  if (!hover.hasDetailCard) failures.push('Missing detail card chrome');
  if (!hover.entryH3?.includes('Netherlands')) failures.push('Panel missing Netherlands title');
  if (afterLeave.entryDisplay !== 'none') failures.push(`After mouseleave entry still: ${afterLeave.entryDisplay}`);

  const report = { embedUrl, rest, hover, afterLeave, stabilityBefore, stabilityDuring, stabilityAfter, failures, passed: failures.length === 0 };
  fs.writeFileSync(path.join(OUT, 'ui-verify-report.json'), JSON.stringify(report, null, 2));

  console.log('Layout:', rest.layout);
  console.log('Hover:', hover);
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);

  if (failures.length > 0) process.exit(1);
  console.log('UI verification passed.');
}

run();
