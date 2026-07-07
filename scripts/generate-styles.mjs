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

// Exact map block from 1243-scss-output.css (lines 6-124)
const mapBlockStart = scss.indexOf('.map-container {');
const mapBlockEnd = scss.indexOf('.vc_cta3_content-container h2');
const mapBlock = scss.slice(mapBlockStart, mapBlockEnd).trim();

// vc_custom-css from live page (clean head version)
const vcCustom = await fetch('https://ecustoms.sgs.com/');
const vcMatch = vcCustom.match(/<style data-type="vc_custom-css">([\s\S]*?)<\/style>/);
if (!vcMatch) throw new Error('vc_custom-css not found');
const vcBlock = vcMatch[1].trim();

const css = `/*
 * Auto-extracted from live https://ecustoms.sgs.com/
 *
 * Sources (load order):
 * 1. Theme reset + body (dt-the7 main.min.css computed values)
 * 2. wp-content/custom_codes/1243-scss-output.css (map rules)
 * 3. Page vc_custom-css inline block
 */

@import url("https://fonts.googleapis.com/css?family=Roboto:300,400,500,600,700,normal");

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

// manifest of extracted rules for documentation
const manifest = {
  sources: [
    { file: '1243-scss-output.css', url: SCSS_URL, bytes: mapBlock.length },
    { file: 'vc_custom-css', bytes: vcBlock.length },
    { file: 'main.min.css', note: 'only * reset and body inherited styles included' },
  ],
  mapBlockPreview: mapBlock.split('\n').slice(0, 5),
  vcBlockPreview: vcBlock.split('\n').slice(0, 5),
};

fs.writeFileSync('scripts/output/css-manifest.json', JSON.stringify(manifest, null, 2));
console.log('Wrote styles.css', css.length, 'bytes');
console.log('Map block lines:', mapBlock.split('\n').length);
console.log('Includes circle.st4.export:', mapBlock.includes('circle.st4.export'));
