#!/usr/bin/env node
/**
 * Compare live WordPress DOM against the production embed in index.html.
 * Run: node scripts/compare-live-dom.mjs [url]
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT = 'scripts/output';
const LIVE_URL = process.argv[2] || 'https://ecustoms.sgs.com/';
const EMBED = fs.readFileSync('index.html', 'utf8');

const EXPECT = {
  embedStyleId: 'sgs-e-customs-map-embed',
  layoutClass: 'map-page',
  layoutTitle: 'European customs coverage',
  svgId: 'interactive-map-svg',
  oldSvgId: 'svg2',
  oldMetadataId: 'metadata7',
};

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 120000 });
await page.evaluate(() => document.querySelector('#interactive-map')?.scrollIntoView({ block: 'center' }));
await new Promise((r) => setTimeout(r, 1000));

const live = await page.evaluate((expect) => {
  const map = document.querySelector('#interactive-map');
  const embedStyle = document.querySelector(`#${expect.embedStyleId}`);
  const layout = document.querySelector(`.${expect.layoutClass}`);
  const title = document.querySelector('.map-page__title');
  const card = document.querySelector('.map-page__card');
  const svg = map?.querySelector('svg');
  const vcCustomCss = document.querySelector('style[data-type="vc_custom-css"]');
  const brokenCssParagraphs = [...document.querySelectorAll('.templatera_shortcode p')]
    .filter((p) => p.textContent.includes('#interactive-map')).length;

  return {
    url: location.href,
    interactiveMapCount: document.querySelectorAll('#interactive-map').length,
    hasEmbedStyle: !!embedStyle,
    embedStyleBytes: embedStyle?.textContent?.length || 0,
    hasLayoutWrapper: !!layout,
    layoutTitle: title?.textContent?.trim() || null,
    layoutTitleMatches: title?.textContent?.trim() === expect.layoutTitle,
    hasCard: !!card,
    cardBorderRadius: card ? getComputedStyle(card).borderRadius : null,
    cardBoxShadow: card ? getComputedStyle(card).boxShadow : null,
    mapParentTag: map?.parentElement?.tagName?.toLowerCase() || null,
    mapParentClass: map?.parentElement?.className || null,
    svgId: svg?.id || null,
    hasOldMetadata: !!document.querySelector(`#${expect.oldMetadataId}`),
    rawHtmlBlocks: document.querySelectorAll('.wpb_raw_html').length,
    pageCustomCssHasMapRules: !!vcCustomCss?.textContent?.includes('#interactive-map'),
    brokenTopBarCssParagraphs: brokenCssParagraphs,
    legacyCoverageHeading: [...document.querySelectorAll('h2.pagetitle')]
      .some((h) => h.textContent.trim() === 'Coverage'),
  };
}, EXPECT);

await browser.close();

const repo = {
  hasEmbedStyle: EMBED.includes(`id="${EXPECT.embedStyleId}"`),
  hasLayoutWrapper: EMBED.includes(`class="${EXPECT.layoutClass}"`),
  hasLayoutTitle: EMBED.includes(EXPECT.layoutTitle),
  hasCard: EMBED.includes('map-page__card'),
  svgId: EXPECT.svgId,
  embedBytes: EMBED.length,
};

const failures = [];
if (!live.hasEmbedStyle) failures.push('Live page missing #sgs-e-customs-map-embed inline stylesheet');
if (!live.hasLayoutWrapper) failures.push('Live page missing .map-page layout wrapper');
if (!live.layoutTitleMatches) failures.push(`Live page missing layout title "${EXPECT.layoutTitle}"`);
if (!live.hasCard) failures.push('Live page missing .map-page__card container');
if (live.interactiveMapCount !== 1) failures.push(`Expected 1 #interactive-map, found ${live.interactiveMapCount}`);
if (live.interactiveMapCount > 1) failures.push('Duplicate map instances detected');
if (live.svgId === EXPECT.oldSvgId) failures.push('Live map still uses legacy SVG id="svg2" (old embed)');
if (live.hasOldMetadata) failures.push('Live map still contains legacy #metadata7 (old uncleaned SVG)');
if (live.mapParentClass?.includes('map-page__card-inner') === false && live.hasLayoutWrapper === false) {
  failures.push('Map is not inside .map-page__card-inner — layout shell not applied');
}
if (live.pageCustomCssHasMapRules && !live.hasEmbedStyle) {
  failures.push('Page relies on legacy WPBakery custom CSS for map rules instead of the new inline embed');
}
if (live.brokenTopBarCssParagraphs > 0) {
  failures.push(`Found ${live.brokenTopBarCssParagraphs} top-bar paragraph(s) containing map CSS (not loaded as styles)`);
}

const deployed = failures.length === 0;
const report = {
  comparedAt: new Date().toISOString(),
  liveUrl: LIVE_URL,
  deployed,
  live,
  repo,
  failures,
  deployChecklist: deployed ? [] : [
    'Open WPBakery editor on the homepage (post 12568) Coverage row',
    'Edit the Raw HTML element — replace ALL content with index.html from the repo',
    'Remove or hide the separate Coverage h2/h5 text blocks above the map if you want only the new header',
    'Update WPBakery page custom CSS: remove legacy #interactive-map / .st0 rules (now in the embed)',
    'Fix the Templatera top-bar block that contains map CSS wrapped in <p> tags',
    'Save, publish, and purge any page/cache (SGS CDN, WP cache plugin)',
    `Verify in view-source: search for "${EXPECT.embedStyleId}" and "${EXPECT.layoutTitle}"`,
  ],
};

fs.writeFileSync(path.join(OUT, 'live-dom-compare.json'), JSON.stringify(report, null, 2));

console.log('Live URL:', LIVE_URL);
console.log('Deployed:', deployed);
console.log('Live DOM:', live);
console.log('Repo embed:', repo);
console.log('Failures:', failures.length);
for (const f of failures) console.log(' -', f);
if (!deployed) {
  console.log('\nDeploy checklist:');
  for (const step of report.deployChecklist) console.log(' •', step);
  process.exit(1);
}
console.log('Live DOM matches production embed.');
