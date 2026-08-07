import fs from 'fs';
import { CSS_FILES, wrapDetailCards } from './map-html-utils.mjs';

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
