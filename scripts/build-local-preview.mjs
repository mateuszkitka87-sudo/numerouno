import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CSS_FILES, extractMapParts } from './map-html-utils.mjs';

const OUT_DIR = 'dist/local-preview';

const LOADER_JS = `/**
 * Loads external SVG before map.js initialises.
 * Requires a local HTTP server (fetch does not work on file://).
 */
window.ecMapReady = (async function loadMapSvg() {
  const mount = document.querySelector('.ec-map__svg-mount');
  if (!mount) {
    throw new Error('Missing .ec-map__svg-mount element');
  }

  const src = mount.getAttribute('data-svg');
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error('Failed to load SVG: ' + src);
  }

  const svg = (await response.text()).trim();
  mount.insertAdjacentHTML('afterend', svg);
  mount.remove();
})();
`;

const README = `# SGS E-Customs Map — Local Preview

Self-contained local development package with **external** CSS, JavaScript, and SVG files (nothing inlined).

## Contents

\`\`\`
.
├── index.html          # Entry page
├── css/                # Stylesheets
├── js/
│   ├── loader.js       # Loads assets/svg/map.svg
│   └── map.js          # Map interaction logic
├── assets/
│   └── svg/
│       └── map.svg     # Europe map geometry
└── README.md
\`\`\`

## Quick start

You must use a local HTTP server (browsers block \`fetch()\` for local files opened via \`file://\`).

### Option A — npx serve

\`\`\`bash
npx serve .
\`\`\`

Open http://localhost:3000

### Option B — Python

\`\`\`bash
python3 -m http.server 8080
\`\`\`

Open http://localhost:8080

### Option C — Node preview script (from repo root)

\`\`\`bash
npm run preview
\`\`\`

## Editing

| Change | File |
|--------|------|
| Layout / nav / intro | Edit \`index.html\` shell section |
| Styles | \`css/*.css\` |
| Map interaction | \`js/map.js\` |
| SVG geometry | \`assets/svg/map.svg\` |
| Country data | \`index.html\` (info-text blocks) |

After editing source files in the main repo, rebuild the package:

\`\`\`bash
npm run package:local
\`\`\`
`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyCssFiles(targetCssDir) {
  ensureDir(targetCssDir);
  for (const file of CSS_FILES) {
    const name = path.basename(file);
    fs.copyFileSync(file, path.join(targetCssDir, name));
  }
}

function buildIndexHtml(pageBody) {
  const cssLinks = CSS_FILES.map((file) => {
    const name = path.basename(file);
    return `  <link rel="stylesheet" href="css/${name}">`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SGS E-Customs — Coverage Map</title>
${cssLinks}
</head>
<body>
${pageBody}
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="js/loader.js"></script>
  <script src="js/map.js" defer></script>
</body>
</html>
`;
}

export function buildLocalPreview({ outDir = OUT_DIR } = {}) {
  const mapFragment = fs.readFileSync('map.fragment.html', 'utf8');
  const shell = fs.readFileSync('shell.html', 'utf8');
  const { mapDiv, svg, scriptBody } = extractMapParts(mapFragment);

  const innerScript = scriptBody
    .replace(/^jQuery\(document\)\.ready\(function \(\$\) \{\s*/, '')
    .replace(/\}\);\s*$/, '')
    .split('\n')
    .map((line) => (line ? `    ${line}` : line))
    .join('\n');

  const pageBody = shell.replace('{{MAP}}', mapDiv);
  const indexHtml = buildIndexHtml(pageBody);

  const mapJs = `/**
 * Map interaction — waits for external SVG via js/loader.js
 */
window.ecMapReady.then(function () {
  jQuery(function ($) {
${innerScript}
  });
});
`;

  ensureDir(outDir);
  ensureDir(path.join(outDir, 'css'));
  ensureDir(path.join(outDir, 'js'));
  ensureDir(path.join(outDir, 'assets', 'svg'));

  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(outDir, 'js', 'loader.js'), LOADER_JS);
  fs.writeFileSync(path.join(outDir, 'js', 'map.js'), mapJs);
  fs.writeFileSync(path.join(outDir, 'assets', 'svg', 'map.svg'), svg.trim() + '\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), README);

  copyCssFiles(path.join(outDir, 'css'));

  return {
    outDir,
    files: {
      index: path.join(outDir, 'index.html'),
      css: CSS_FILES.length,
      js: 2,
      svg: path.join(outDir, 'assets', 'svg', 'map.svg'),
    },
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = buildLocalPreview();
  console.log('Built local preview:', result.outDir);
  console.log('  index.html');
  console.log('  css/', result.files.css, 'files');
  console.log('  js/loader.js, js/map.js');
  console.log('  assets/svg/map.svg');
}
