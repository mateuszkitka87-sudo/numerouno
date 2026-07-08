import fs from 'fs';

const mapStyles = fs.readFileSync('styles.css', 'utf8');
const layoutStyles = fs.readFileSync('page-layout.css', 'utf8');
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

const embed = `<style id="interactive-map-styles">
${mapStyles.trim()}
</style>
<style id="map-page-layout-styles">
${layoutStyles.trim()}
</style>

${pageBody}

${mapScript}
`;

fs.writeFileSync('index.html', embed);

const preview = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SGS e-Customs — European Coverage Map</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; background: #f5f5f7; }
  </style>
</head>
<body>
${embed}
</body>
</html>
`;

fs.writeFileSync('preview.html', preview);
console.log('Assembled index.html (%d bytes)', embed.length);
console.log('Assembled preview.html (%d bytes)', preview.length);
