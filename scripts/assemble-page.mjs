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

/**
 * Build the production WPBakery Raw HTML fragment (self-contained, all CSS inline).
 */
export function buildProductionEmbed({ sanitize = true } = {}) {
  const mapStyles = fs.readFileSync('styles.css', 'utf8');
  const layoutStyles = fs.readFileSync('page-layout.css', 'utf8');
  const uiChromeStyles = fs.readFileSync('map-ui-chrome.css', 'utf8');
  const presentationStyles = fs.readFileSync('map-presentation.css', 'utf8');
  const legendStyles = fs.readFileSync('map-legend.css', 'utf8');
  const markerStyles = fs.readFileSync('map-markers.css', 'utf8');
  const layoutWrapper = fs.readFileSync('page-layout.wrapper.html', 'utf8');
  const mapFragment = fs.readFileSync('map.fragment.html', 'utf8');

  const scriptIdx = mapFragment.indexOf('<script');
  if (scriptIdx === -1) throw new Error('map.fragment.html: missing <script>');
  const mapDiv = mapFragment.slice(0, scriptIdx).trim();
  let mapScript = mapFragment.slice(scriptIdx).trim();

  if (!mapDiv.startsWith('<div id="interactive-map">')) {
    throw new Error('map.fragment.html: expected root #interactive-map div');
  }

  const pageBody = layoutWrapper.replace('{{MAP}}', mapDiv);

  let inlineCss = [mapStyles, layoutStyles, uiChromeStyles, presentationStyles, legendStyles, markerStyles]
    .map((s) => s.trim())
    .join('\n\n');

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
