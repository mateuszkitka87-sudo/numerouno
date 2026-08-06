import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { buildProductionEmbed } from './assemble-page.mjs';
import { buildWpHarness, wpHarnessFileUrl } from './wp-harness.mjs';

const OUT = 'scripts/output';
fs.mkdirSync(OUT, { recursive: true });

const PROBES = [
  ['path.st0', 'st0', ['fill', 'stroke']],
  ['path.st2.brokerage', 'st2_brokerage', ['fill', 'stroke', 'fontSize']],
  ['circle.transit', 'circle_transit', ['fill', 'opacity']],
  ['circle.brokerage', 'circle_brokerage', ['fill', 'opacity']],
  ['.legend-text', 'legend_text', ['fill']],
  ['.info-text[data-name=netherlands]', 'popup_nl_rest', ['display', 'backgroundColor']],
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
    const layoutTitle = document.querySelector('.map-page__title');
    const layoutCard = document.querySelector('.map-page__card');
    const embedStyle = document.querySelector('#sgs-e-customs-map-embed');
    if (layoutTitle) {
      const cs = getComputedStyle(layoutTitle);
      out.layout.titleFontSize = cs.fontSize;
      out.layout.titleVisible = layoutTitle.offsetParent !== null;
    }
    if (layoutCard) {
      const cs = getComputedStyle(layoutCard);
      out.layout.cardBorderRadius = cs.borderRadius;
      out.layout.cardBoxShadow = cs.boxShadow;
    }
    out.layout.singleInlineStyle = !!embedStyle;
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
    const popup = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    const cs = popup ? getComputedStyle(popup) : null;
    return {
      popupDisplay: cs?.display,
      popupVisibility: cs?.visibility,
      popupBackground: cs?.backgroundColor,
      popupH3: popup?.querySelector('h3')?.textContent?.trim(),
    };
  });

  await page.evaluate(() => {
    window.jQuery('#interactive-map #netherlands').trigger('mouseleave');
  });
  await new Promise((r) => setTimeout(r, 300));

  const afterLeave = await page.evaluate(() => {
    const popup = document.querySelector('#interactive-map .info-text[data-name=netherlands]');
    return { popupDisplay: popup ? getComputedStyle(popup).display : null };
  });

  await page.screenshot({ path: path.join(OUT, 'step1-production.png'), fullPage: false });
  await browser.close();

  const failures = [];

  if (!rest.layout.titleVisible) failures.push('Layout title not visible');
  if (!rest.layout.cardBoxShadow || rest.layout.cardBoxShadow === 'none') failures.push('Card shadow missing');
  if (!rest.layout.singleInlineStyle) failures.push('Missing single inline embed stylesheet');

  const expected = {
    st0: { fill: 'rgb(209, 210, 213)', stroke: 'rgb(255, 255, 255)' },
    circle_transit: { fill: 'rgb(255, 102, 0)' },
    circle_brokerage: { fill: 'rgb(63, 92, 104)' },
    legend_text: { fill: 'rgb(0, 0, 0)' },
  };

  for (const [key, exp] of Object.entries(expected)) {
    const got = rest.map[key];
    if (!got) { failures.push(`Missing probe: ${key}`); continue; }
    for (const [prop, val] of Object.entries(exp)) {
      if (got[prop] !== val) failures.push(`Map ${key}.${prop}: expected ${val}, got ${got[prop]}`);
    }
  }

  if (hover.popupDisplay !== 'block') failures.push(`Hover popup display: ${hover.popupDisplay}`);
  if (!hover.popupH3?.includes('Netherlands')) failures.push('Hover popup missing Netherlands title');
  if (afterLeave.popupDisplay !== 'none') failures.push(`After mouseleave popup still: ${afterLeave.popupDisplay}`);

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
