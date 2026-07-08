import fs from 'fs';

/**
 * Build the production WPBakery Raw HTML fragment (self-contained, all CSS inline).
 */
export function buildProductionEmbed() {
  const mapStyles = fs.readFileSync('styles.css', 'utf8');
  const layoutStyles = fs.readFileSync('page-layout.css', 'utf8');
  const uiChromeStyles = fs.readFileSync('map-ui-chrome.css', 'utf8');
  const layoutWrapper = fs.readFileSync('page-layout.wrapper.html', 'utf8');
  const mapFragment = fs.readFileSync('map.fragment.html', 'utf8');

  const scriptIdx = mapFragment.indexOf('<script');
  if (scriptIdx === -1) throw new Error('map.fragment.html: missing <script>');
  const mapDiv = mapFragment.slice(0, scriptIdx).trim();
  const mapScript = mapFragment.slice(scriptIdx).trim();

  if (!mapDiv.startsWith('<div id="interactive-map">')) {
    throw new Error('map.fragment.html: expected root #interactive-map div');
  }

  const pageBody = layoutWrapper.replace('{{MAP}}', mapDiv);

  const inlineCss = `/* SGS e-Customs — WPBakery Raw HTML embed (auto-generated) */

/* --- Map styles (locked; scoped to #interactive-map) --- */
${mapStyles.trim()}

/* --- Page layout --- */
${layoutStyles.trim()}

/* --- Popup & button chrome --- */
${uiChromeStyles.trim()}`;

  return `<style id="sgs-e-customs-map-embed">
${inlineCss}
</style>

${pageBody}

${mapScript}
`;
}

const embed = buildProductionEmbed();
fs.writeFileSync('index.html', embed);
console.log('Built production WPBakery embed: index.html (%d bytes)', embed.length);
