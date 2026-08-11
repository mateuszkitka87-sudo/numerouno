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
    const card = document.querySelector('.map-page__card');
    const embedStyle = document.querySelector('#sgs-e-customs-map-embed');
    const svg = map?.querySelector('svg');

    out.layout.hasIntro = !!document.querySelector('.ec-intro');
    out.layout.hasCoverageTitle = !!document.querySelector('.ec-intro__title');
    out.layout.hasCard = !!card;
    out.layout.hasNav = !!document.querySelector('.ec-nav');
    out.layout.hasIdlePanel = !!document.querySelector('.ec-detail-slot');
    out.layout.serviceRowCount = document.querySelectorAll('.ec-service__title').length;
    out.layout.forbiddenUiText = [];
    const uiText = document.querySelector('.ec-app')?.innerText || '';
    const forbidden = [
      'NETWORK',
      'Coverage',
      'Interactive customs network',
      'Explore transit, brokerage, and export',
      'Transit operations',
      'Export declarations',
      'Customs support',
    ];
    for (const term of forbidden) {
      if (uiText.includes(term)) out.layout.forbiddenUiText.push(term);
    }
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
    const entry = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const mapStage = document.querySelector('.ec-map__stage');
    const workspace = document.querySelector('.ec-workspace');
    const mapRoot = document.querySelector('#interactive-map');
    const pcs = entry ? getComputedStyle(entry) : null;
    const entryRect = entry?.getBoundingClientRect();
    const mapRect = mapStage?.getBoundingClientRect();
    const mapRootRect = mapRoot?.getBoundingClientRect();
    const workspaceRect = workspace?.getBoundingClientRect();
    const visiblePanels = [...document.querySelectorAll('#interactive-map > .info-text')].filter(
      (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0
    );
    const belowMap = visiblePanels.filter((el) => el.getBoundingClientRect().top > (mapRect?.bottom ?? 0) + 5);
    return {
      entryDisplay: pcs?.display,
      entryPosition: pcs?.position,
      entryTop: entryRect ? Math.round(entryRect.top) : null,
      entryLeft: entryRect ? Math.round(entryRect.left) : null,
      entryWidth: entryRect ? Math.round(entryRect.width) : null,
      mapRootLeft: mapRootRect ? Math.round(mapRootRect.left) : null,
      visiblePanelCount: visiblePanels.length,
      belowMapCount: belowMap.length,
      workspaceHeight: workspaceRect ? Math.round(workspaceRect.height) : null,
      mapHeight: mapRect ? Math.round(mapRect.height) : null,
      scrollHeight: document.documentElement.scrollHeight,
      hasDetailCard: !!entry?.querySelector('.ec-detail-card'),
      entryH3: entry?.querySelector('h3')?.textContent?.trim(),
      serviceTitles: [...document.querySelectorAll('#interactive-map .ec-service__title')].map((el) => el.textContent.trim()),
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

  // WP header clearance check with simulated masthead
  const mastheadHarness = buildWpHarness(embed)
    .replace('<body', '<div class="masthead" style="position:fixed;top:0;left:0;right:0;height:148px;background:#333;z-index:9999"></div><body')
    .replace('</head>', '<link rel="stylesheet" href="https://ecustoms.sgs.com/wp-content/custom_codes/1243-scss-output.css?ver=278">\n</head>');
  const mastheadPath = path.join(OUT, 'wp-harness-masthead.html');
  fs.writeFileSync(mastheadPath, mastheadHarness);
  const mastheadPage = await browser.newPage();
  await mastheadPage.setViewport({ width: 1400, height: 900 });
  await mastheadPage.goto(wpHarnessFileUrl(mastheadPath), { waitUntil: 'networkidle2', timeout: 60000 });
  await mastheadPage.waitForSelector('#interactive-map');
  await mastheadPage.evaluate(() => window.jQuery('#interactive-map #poland').trigger('mouseenter'));
  await new Promise((r) => setTimeout(r, 500));
  const wpHeader = await mastheadPage.evaluate(() => {
    const popup = document.querySelector('#interactive-map .info-text[data-name=poland]');
    const rect = popup?.getBoundingClientRect();
    const header = document.querySelector('.masthead')?.getBoundingClientRect();
    return {
      panelTop: rect ? Math.round(rect.top) : null,
      headerBottom: header ? Math.round(header.bottom) : null,
      clipped: rect && header ? rect.top < header.bottom : null,
      clearance: getComputedStyle(document.querySelector('.ec-app')).getPropertyValue('--ec-header-clearance').trim(),
    };
  });
  await mastheadPage.close();

  await page.screenshot({ path: path.join(OUT, 'mockup-rebuild.png'), fullPage: false });
  await browser.close();

  const failures = [];

  if (rest.layout.hasIntro) failures.push('Coverage intro block should not be present');
  if (rest.layout.hasCoverageTitle) failures.push('Coverage title should not be present');
  if (rest.layout.hasCard) failures.push('Old card layout should not be present');
  if (rest.layout.hasNav) failures.push('Site chrome nav should not be present in embed');
  if (rest.layout.hasIdlePanel) failures.push('Idle Explore coverage panel should not be present');
  if (rest.layout.serviceRowCount > 0) failures.push(`Service rows in DOM: ${rest.layout.serviceRowCount}`);
  if (rest.layout.forbiddenUiText?.length) failures.push(`Forbidden UI text: ${rest.layout.forbiddenUiText.join(', ')}`);
  if (!rest.layout.singleInlineStyle) failures.push('Missing single inline embed stylesheet');

  if (hover.entryDisplay !== 'block') failures.push(`Panel entry display: ${hover.entryDisplay}`);
  if (hover.visiblePanelCount !== 1) failures.push(`Expected 1 visible panel, got ${hover.visiblePanelCount}`);
  if (hover.belowMapCount > 0) failures.push('Country detail appears below map section');
  if (hover.entryLeft !== hover.mapRootLeft) failures.push(`Panel left ${hover.entryLeft} not aligned with map ${hover.mapRootLeft}`);
  if (hover.entryWidth !== 300) failures.push(`Panel width: ${hover.entryWidth} (expected 300)`);
  if (hover.serviceTitles.length > 0) failures.push(`Visible service rows: ${hover.serviceTitles.join(', ')}`);

  const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const mapStable = stabilityDuring.every(
    (d) => sameRect(d.map, stabilityBefore.map) && sameRect(d.svg, stabilityBefore.svg) && sameRect(d.workspace, stabilityBefore.workspace)
  ) && sameRect(stabilityAfter.map, stabilityBefore.map) && sameRect(stabilityAfter.svg, stabilityBefore.svg);

  if (!mapStable) failures.push('Map/SVG/workspace rects shifted during country hover');
  if (!hover.hasDetailCard) failures.push('Missing detail card chrome');
  if (!hover.entryH3?.includes('Netherlands')) failures.push('Panel missing Netherlands title');
  if (afterLeave.entryDisplay !== 'none') failures.push(`After mouseleave entry still: ${afterLeave.entryDisplay}`);
  if (wpHeader.clipped) failures.push(`Panel clipped under WP header (top ${wpHeader.panelTop}, header ${wpHeader.headerBottom})`);

  const report = { embedUrl, rest, hover, afterLeave, wpHeader, stabilityBefore, stabilityDuring, stabilityAfter, failures, passed: failures.length === 0 };
  fs.writeFileSync(path.join(OUT, 'ui-verify-report.json'), JSON.stringify(report, null, 2));

  console.log('Layout:', rest.layout);
  console.log('Hover:', hover);
  console.log('WP header:', wpHeader);
  console.log('Failures:', failures.length);
  for (const f of failures) console.log(' -', f);

  if (failures.length > 0) process.exit(1);
  console.log('UI verification passed.');
}

run();
