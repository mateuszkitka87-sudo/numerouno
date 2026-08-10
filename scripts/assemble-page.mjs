import fs from 'fs';

function stripCssComments(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function stripJsComments(js) {
  return js
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CSS_FILES = [
  'styles/tokens.css',
  'styles/layout.css',
  'styles/map.css',
  'styles/markers.css',
  'styles/detail.css',
  'styles/hooks.css',
];

const DETAIL_CHIPS = `
<div class="ec-detail-card__chips">
  <span class="ec-chip ec-chip--transit">Transit</span>
  <span class="ec-chip ec-chip--type ec-chip--type-transit">Transit</span>
  <span class="ec-chip ec-chip--type ec-chip--type-brokerage">Transit + Brokerage</span>
  <span class="ec-chip ec-chip--type ec-chip--type-export">Transit + Export</span>
</div>`;

function stripDetailServices(mapHtml) {
  return mapHtml.replace(/<ul class="ec-detail-card__services">[\s\S]*?<\/ul>\s*/gi, '');
}

function wrapDetailCards(mapHtml) {
  const cleaned = stripDetailServices(mapHtml);

  return cleaned.replace(
    /(<div class="info-text"[^>]*>)([\s\S]*?)(<\/div>)/g,
    (_, open, inner, close) => {
      if (inner.includes('ec-detail-card')) return open + inner + close;

      const h3Match = inner.match(/<h3>[\s\S]*?<\/h3>/);
      const pMatch = inner.match(/<p>[\s\S]*?<\/p>/);
      const h3 = h3Match ? h3Match[0] : '';
      const p = pMatch ? pMatch[0] : '';

      return (
        open +
        `<div class="ec-detail-card">
<div class="ec-detail-card__head">${h3}<button type="button" class="ec-detail-card__close" aria-label="Close">×</button></div>
${DETAIL_CHIPS}
<div class="ec-detail-card__body">${p}</div>
</div>` +
        close
      );
    }
  );
}

function enhanceCountryChips(mapDiv) {
  const chipH = 210;
  const chipRx = 66;

  return mapDiv.replace(
    /(<g id="(?!map-container)([a-z_]+)">\s*)(<circle\b[^>]*\bcx="([-\d.]+)"[^>]*\bcy="([-\d.]+)"[^>]*\/>)/gi,
    (_, gOpen, id, circleTag, cx, cy) => {
      const cxN = parseFloat(cx);
      const cyN = parseFloat(cy);
      const chipW = id.length > 8 ? 302 : id.length > 6 ? 269 : 252;
      const x = (cxN - chipW / 2).toFixed(1);
      const y = (cyN - chipH / 2).toFixed(1);
      const rect = `<rect class="ec-chip-bg" x="${x}" y="${y}" width="${chipW}" height="${chipH}" rx="${chipRx}" ry="${chipRx}"/>`;
      return `${gOpen}${rect}\n\t\t\t${circleTag}`;
    }
  );
}

/**
 * Build the production WPBakery Raw HTML fragment (self-contained, all CSS inline).
 */
export function buildProductionEmbed({ sanitize = true } = {}) {
  const layoutWrapper = fs.readFileSync('shell.html', 'utf8');
  let mapFragment = fs.readFileSync('map.fragment.html', 'utf8');

  const scriptIdx = mapFragment.indexOf('<script');
  if (scriptIdx === -1) throw new Error('map.fragment.html: missing <script>');
  let mapDiv = mapFragment.slice(0, scriptIdx).trim();
  let mapScript = mapFragment.slice(scriptIdx).trim();

  if (!mapDiv.startsWith('<div id="interactive-map"')) {
    throw new Error('map.fragment.html: expected root #interactive-map div');
  }

  mapDiv = wrapDetailCards(mapDiv);
  mapDiv = stripDetailServices(mapDiv);
  mapDiv = enhanceCountryChips(mapDiv);

  const pageBody = layoutWrapper.replace('{{MAP}}', mapDiv);

  let inlineCss = CSS_FILES.map((file) => fs.readFileSync(file, 'utf8').trim()).join('\n\n');

  if (sanitize) {
    inlineCss = stripCssComments(inlineCss);
    mapScript = mapScript.replace(/<script([^>]*)>([\s\S]*)<\/script>/, (_, attrs, body) => {
      return `<script${attrs}>\n${stripJsComments(body)}\n</script>`;
    });
  }

  let embed = `<style id="sgs-e-customs-map-embed">
${inlineCss}
</style>

${pageBody}

${mapScript}
`;

  if (sanitize) {
    embed = stripHtmlComments(embed);
  }

  return embed;
}

const embed = buildProductionEmbed();
fs.writeFileSync('index.html', embed);
console.log('Built production WPBakery embed: index.html (%d bytes)', embed.length);
