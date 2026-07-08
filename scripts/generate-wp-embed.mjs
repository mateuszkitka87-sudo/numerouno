import fs from 'fs';
import https from 'https';
import { cleanMapFragment } from './clean-map-fragment.mjs';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function scopeSelector(selector) {
  const s = selector.trim();
  if (!s) return s;
  return s
    .split(',')
    .map((part) => {
      part = part.trim();
      if (part.startsWith('#interactive-map')) return part;
      if (part.startsWith('#map-container')) return `#interactive-map ${part}`;
      if (/^#(ukraine|bosnia|poland|switserland|brokeragestripes|exportstripes)\b/.test(part))
        return `#interactive-map ${part}`;
      return `#interactive-map ${part}`;
    })
    .join(', ');
}

function importantDecls(body, props) {
  return body
    .split(';')
    .map((decl) => {
      const d = decl.trim();
      if (!d) return '';
      const colon = d.indexOf(':');
      if (colon === -1) return d;
      const prop = d.slice(0, colon).trim().toLowerCase();
      const val = d.slice(colon + 1).trim();
      if (!props.includes(prop)) return d;
      if (val.endsWith('!important')) return d;
      return `${prop}: ${val} !important`;
    })
    .filter(Boolean)
    .join('; ');
}

function protectSvgRules(cssText) {
  const svgProps = ['fill', 'stroke', 'stroke-width', 'stroke-miterlimit', 'fill-rule', 'clip-rule'];
  return cssText.replace(/([^{}]+)\{([^}]*)\}/g, (match, selector, body) => {
    const sel = selector.trim();
    if (/\.st[0-9]/.test(sel) && !/circle|rect|path\.st2/.test(sel)) return match;
    const isSvgRule =
      /path|circle|rect|\.transit|\.brokerage|\.export|#map-container|#ukraine|#bosnia|#poland|#switserland/i.test(sel);
    if (!isSvgRule) return match;
    return `${selector}{${importantDecls(body, svgProps)}}`;
  });
}

function parseRules(css, source) {
  const cleaned = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\.map-container\s*\{[^}]*\}/g, '')
    .replace(/\.google-visualization-tooltip[^}]*\}/g, '');

  const rules = [];
  const ruleRegex = /(@media[^{]+)\{([\s\S]*?)\}|([^{}@]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRegex.exec(cleaned)) !== null) {
    if (m[1]) {
      const media = m[1].trim();
      const innerRegex = /([^{}]+)\{([^}]*)\}/g;
      let im;
      while ((im = innerRegex.exec(m[2])) !== null) {
        const selector = im[1].trim();
        if (!selector) continue;
        rules.push({ media, selector, body: im[2].trim(), source });
      }
    } else if (m[3]) {
      const selector = m[3].trim();
      if (!selector) continue;
      rules.push({ media: null, selector, body: m[4].trim(), source });
    }
  }
  return rules;
}

function mergeRules(ruleLists) {
  const merged = new Map();
  for (const rules of ruleLists) {
    for (const rule of rules) {
      const scoped = scopeSelector(rule.selector);
      const key = `${rule.media || ''}||${scoped}`;
      merged.set(key, { ...rule, selector: scoped });
    }
  }
  return [...merged.values()];
}

function rulesToCss(rules) {
  const byMedia = new Map();
  for (const rule of rules) {
    const key = rule.media || '';
    if (!byMedia.has(key)) byMedia.set(key, []);
    byMedia.get(key).push(rule);
  }

  let css = '';
  for (const [media, group] of byMedia) {
    const blocks = group
      .map((r) => `${r.selector} { ${r.body} }`)
      .join('\n');
    css += media ? `${media} {\n${blocks}\n}\n\n` : `${blocks}\n\n`;
  }
  return css.trim();
}

const SCSS_URL = 'https://ecustoms.sgs.com/wp-content/custom_codes/1243-scss-output.css?ver=278';
const scss = await fetch(SCSS_URL);
const mapBlockStart = scss.indexOf('.map-container {');
const mapBlockEnd = scss.indexOf('.vc_cta3_content-container h2');
const mapBlock = scss.slice(mapBlockStart, mapBlockEnd).trim();

const vcPage = await fetch('https://ecustoms.sgs.com/');
const vcMatch = vcPage.match(/<style data-type="vc_custom-css">([\s\S]*?)<\/style>/);
if (!vcMatch) throw new Error('vc_custom-css not found');
const vcBlock = vcMatch[1].trim();

const scssRules = parseRules(mapBlock, '1243-scss-output.css');
const vcRules = parseRules(vcBlock, 'vc_custom-css');
const mergedRules = mergeRules([scssRules, vcRules]);

const ENHANCED_SELECTORS = new Set([
  '#interactive-map',
  '#interactive-map .info-text',
  '#interactive-map .info-text h3',
  '#interactive-map .info-text p',
  '#interactive-map .button-map',
  '#interactive-map .button-map i',
  '#interactive-map circle.transit',
  '#interactive-map .legend rect.transit',
  '#interactive-map circle.st1.brokerage',
  '#interactive-map .legend rect.brokerage',
  '#interactive-map circle.st4.export',
  '#interactive-map .legend rect.export',
]);

const mapRules = mergedRules.filter((rule) => {
  if (ENHANCED_SELECTORS.has(rule.selector)) return false;
  if (/circle\.st1\.brokerage|circle\.st4\.export|rect\.brokerage|rect\.export/.test(rule.selector)) return false;
  if (rule.media && /max-width:\s*1000px/.test(rule.media)) {
    if (/\.info-text|\.legend-text/.test(rule.selector)) return false;
  }
  return true;
});

let mergedCss = rulesToCss(mapRules);

const scopedCss = `/* WPBakery Raw HTML — scoped to #interactive-map */
#interactive-map {
  position: relative !important;
  width: 100% !important;
  max-width: 1080px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  display: block !important;
  box-sizing: border-box !important;
  color: #333333 !important;
  font-family: Roboto, Helvetica, Arial, Verdana, sans-serif !important;
  font-size: 16px !important;
  line-height: 1.5 !important;
}

#interactive-map *,
#interactive-map *::before,
#interactive-map *::after {
  box-sizing: border-box !important;
}

#interactive-map svg {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
  overflow: hidden !important;
}

#interactive-map g.legend {
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  white-space: normal !important;
  float: none !important;
}

${protectSvgRules(mergedCss)}

#interactive-map circle.transit {
  fill: #ff6600 !important;
  stroke: #ffffff !important;
  stroke-width: 1.5px !important;
}
#interactive-map .legend rect.transit {
  fill: #ff6600 !important;
  stroke: none !important;
}
#interactive-map circle.st1.brokerage {
  fill: #3F5C68 !important;
  stroke: #3F5C68 !important;
  stroke-width: 1.5px !important;
}
#interactive-map .legend rect.brokerage {
  fill: #3F5C68 !important;
  stroke: #3F5C68 !important;
}
#interactive-map circle.st4.export {
  fill: #900C3F !important;
  stroke: #900C3F !important;
  stroke-width: 1.5px !important;
}
#interactive-map .legend rect.export {
  fill: #900C3F !important;
  stroke: #900C3F !important;
}

#interactive-map .info-text {
  position: absolute !important;
  top: 400px !important;
  transform: translateY(-50%) !important;
  padding: 20px !important;
  border-radius: 5px !important;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19) !important;
  background: #ffffff !important;
  max-width: 300px !important;
  pointer-events: none !important;
}

#interactive-map .info-text h3 {
  margin-top: 0 !important;
  color: #333333 !important;
  pointer-events: none !important;
  font-family: Roboto, Helvetica, Arial, Verdana, sans-serif !important;
  font-size: inherit !important;
  font-weight: bold !important;
}

#interactive-map .info-text p {
  margin-bottom: 0 !important;
  color: #333333 !important;
  pointer-events: none !important;
  font-family: Roboto, Helvetica, Arial, Verdana, sans-serif !important;
}

#interactive-map .button-map {
  pointer-events: all !important;
  padding: 8px 14px !important;
  border-radius: 5px !important;
  background: #CA4300 !important;
  display: inline-block !important;
  margin: 20px 0 0 0 !important;
  color: #ffffff !important;
  text-decoration: none !important;
  font-size: 14px !important;
  font-weight: bold !important;
  line-height: 1.4em !important;
}

#interactive-map .button-map i {
  margin-left: 10px !important;
}

@media (max-width: 1000px) {
  #interactive-map .info-text {
    max-width: calc(100% - 40px) !important;
    top: auto !important;
    bottom: -50px !important;
    transform: none !important;
  }
  #interactive-map .legend-text {
    font-size: 20px !important;
  }
}
`;

fs.writeFileSync('styles.css', scopedCss);

const fragmentSource = fs.existsSync('map.fragment.html')
  ? fs.readFileSync('map.fragment.html', 'utf8')
  : fs.readFileSync('index.html', 'utf8');

const mapFragment = cleanMapFragment(fragmentSource);
fs.writeFileSync('map.fragment.html', mapFragment);
fs.writeFileSync('scripts/output/wp-embed-scoped.css', scopedCss);

await import('./assemble-page.mjs');

const ruleCount = (scopedCss.match(/\{/g) || []).length;
const dupSelectors = (() => {
  const seen = new Set();
  const dups = [];
  for (const line of scopedCss.split('\n')) {
    const m = line.match(/^#interactive-map[^{]+\{/);
    if (!m) continue;
    const sel = m[0].replace(/\s*\{$/, '').trim();
    if (seen.has(sel)) dups.push(sel);
    seen.add(sel);
  }
  return dups;
})();

console.log('Scoped CSS: %d bytes, ~%d rule blocks', scopedCss.length, ruleCount);
console.log('Map fragment: map.fragment.html (%d bytes)', mapFragment.length);
if (dupSelectors.length) console.warn('Duplicate selectors:', dupSelectors.length);
