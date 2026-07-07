import fs from 'fs';
import https from 'https';

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
  if (s.startsWith('#interactive-map')) return s;
  // comma-separated selector groups
  return s
    .split(',')
    .map((part) => {
      part = part.trim();
      if (part.startsWith('#interactive-map')) return part;
      if (part.startsWith('#map-container')) return `#interactive-map ${part}`;
      if (part.startsWith('#ukraine') || part.startsWith('#bosnia') || part.startsWith('#poland') || part.startsWith('#switserland'))
        return `#interactive-map ${part}`;
      if (part.startsWith('#brokeragestripes') || part.startsWith('#exportstripes'))
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
    if (/\.st[0-9]/.test(sel) && !/circle|rect|path\.st2/.test(sel)) {
      return match;
    }
    const isSvgRule =
      /path|circle|rect|\.transit|\.brokerage|\.export|#map-container|#ukraine|#bosnia|#poland|#switserland/i.test(sel);
    if (!isSvgRule) return match;
    return `${selector}{${importantDecls(body, svgProps)}}`;
  });
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

// Build rule blocks in WordPress cascade order, then scope every selector to #interactive-map.
const rawBlocks = [
  { source: '1243-scss-output.css', css: mapBlock },
  { source: 'vc_custom-css', css: vcBlock },
];

let mergedCss = '';
for (const block of rawBlocks) {
  const cleaned = block.css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\.map-container\s*\{[^}]*\}/g, '') // use #interactive-map instead
    .replace(/\.google-visualization-tooltip[^}]*\}/g, '');

  const ruleRegex = /(@media[^{]+\{([\s\S]*?)\})|([^{}@]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRegex.exec(cleaned)) !== null) {
    if (m[1]) {
      const media = m[1].match(/^@media[^{]+/)[0];
      const inner = m[2];
      let innerOut = '';
      const innerRegex = /([^{}]+)\{([^}]*)\}/g;
      let im;
      while ((im = innerRegex.exec(inner)) !== null) {
        innerOut += `${scopeSelector(im[1])} { ${im[2].trim()} }\n`;
      }
      mergedCss += `${media} {\n${innerOut}}\n\n`;
    } else if (m[3]) {
      const selector = m[3].trim();
      if (!selector || selector.startsWith('@')) continue;
      mergedCss += `${scopeSelector(selector)} { ${m[4].trim()} }\n`;
    }
  }
}

const scopedCss = `/* WPBakery Raw HTML — scoped to #interactive-map (auto-generated) */
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

/* Neutralise The7/HTML legend styles on SVG <g class="legend"> */
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

/* Service colours — after .st0-.st4 stroke rules; higher specificity for markers */
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

/* Popup + button (HTML inside #interactive-map) */
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

// Map fragment from main (unchanged SVG, popups, script)
const mainHtml = fs.readFileSync('index.html', 'utf8');
let mapFragment;

const mainFromGit = await new Promise((resolve) => {
  import('child_process').then(({ execFile }) => {
    execFile('git', ['show', 'main:index.html'], (err, stdout) => resolve(err ? null : stdout));
  });
});

if (mainFromGit) {
  mapFragment = mainFromGit.trim();
} else {
  const start = mainHtml.indexOf('<div id="interactive-map">');
  const scriptStart = mainHtml.indexOf('<script', start);
  const closeDiv = mainHtml.lastIndexOf('</div>', scriptStart);
  const scriptEnd = mainHtml.indexOf('</script>', scriptStart) + '</script>'.length;
  mapFragment = mainHtml.slice(start, closeDiv + '</div>'.length) + '\n\n' + mainHtml.slice(scriptStart, scriptEnd);
}

const wpEmbed = `<style id="interactive-map-styles">\n${scopedCss}\n</style>\n\n${mapFragment}\n`;

fs.writeFileSync('index.html', wpEmbed);
fs.writeFileSync('scripts/output/wp-embed-scoped.css', scopedCss);
console.log('Generated WPBakery embed: index.html', wpEmbed.length, 'bytes');
console.log('Scoped CSS:', scopedCss.length, 'bytes');
