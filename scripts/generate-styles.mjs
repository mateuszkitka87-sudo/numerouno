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

const SCSS_URL = 'https://ecustoms.sgs.com/wp-content/custom_codes/1243-scss-output.css?ver=278';
const scss = await fetch(SCSS_URL);
fs.writeFileSync('scripts/output/1243-scss-output.css', scss);

const mapBlockStart = scss.indexOf('.map-container {');
const mapBlockEnd = scss.indexOf('.vc_cta3_content-container h2');
const mapBlock = scss.slice(mapBlockStart, mapBlockEnd).trim();

const vcCustom = await fetch('https://ecustoms.sgs.com/');
const vcMatch = vcCustom.match(/<style data-type="vc_custom-css">([\s\S]*?)<\/style>/);
if (!vcMatch) throw new Error('vc_custom-css not found');
const vcBlock = vcMatch[1].trim();

// No @import here — fonts loaded via <link> in index.html so map CSS always applies.
const css = `/*
 * Auto-extracted from live https://ecustoms.sgs.com/
 *
 * Sources (load order):
 * 1. Theme reset + body (dt-the7 main.min.css computed values)
 * 2. wp-content/custom_codes/1243-scss-output.css (map section)
 * 3. Page vc_custom-css inline block
 */

* {
  padding: 0;
  margin: 0;
}

body {
  margin: 0;
  color: rgb(51, 51, 51);
  font-family: Roboto, Helvetica, Arial, Verdana, sans-serif;
  font-size: 16px;
  background-color: rgb(247, 247, 247);
}

/* --- 1243-scss-output.css (map section) --- */
${mapBlock}

/* --- vc_custom-css (page inline) --- */
${vcBlock}
`;

fs.writeFileSync('styles.css', css);

// Embed same CSS inline in index.html so the map renders when styles.css cannot load
// (e.g. opening index.html alone, IDE preview, or missing relative path).
const indexPath = 'index.html';
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const headInjection = `  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,600,700,normal">
  <link rel="stylesheet" href="styles.css">
  <style id="map-styles-inline">
${css}
  </style>`;

indexHtml = indexHtml.replace(
  /\s*<link rel="stylesheet" href="styles\.css">\s*(?:<style id="map-styles-inline">[\s\S]*?<\/style>\s*)?/,
  `\n${headInjection}\n`
);

if (!indexHtml.includes('id="map-styles-inline"')) {
  indexHtml = indexHtml.replace(
    '</head>',
    `${headInjection}\n</head>`
  );
}

fs.writeFileSync(indexPath, indexHtml);

fs.writeFileSync('scripts/output/css-manifest.json', JSON.stringify({
  stylesCssBytes: css.length,
  inlineEmbedded: true,
  mapBlockLines: mapBlock.split('\n').length,
}, null, 2));

console.log('Wrote styles.css and embedded inline CSS in index.html');
