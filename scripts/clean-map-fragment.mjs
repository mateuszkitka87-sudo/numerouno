import fs from 'fs';

/**
 * Strip Illustrator/Inkscape editor cruft from the map SVG.
 * Does not change visible geometry, markers, legend, or popups.
 */
export function cleanMapSvg(html) {
  let out = html;

  out = out.replace(/<\?xml[^?]*\?>\s*/gi, '');

  out = out.replace(/\sid="svg2"/, ' id="interactive-map-svg"');

  out = out.replace(/<!--\s*<pattern[\s\S]*?<\/pattern>\s*-->\s*/gi, '');

  out = out.replace(/<metadata[\s\S]*?<\/metadata>\s*/gi, '');

  out = out.replace(/<defs>[\s\S]*?<\/defs>\s*/gi, '');

  out = out.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>\s*/gi, '');

  return out;
}

export function cleanMapScript(js) {
  return js
    .replace(/\r?\n\t\tvar typeInactive = [^\r\n]+\r?\n/, '\n')
    .replace(/\r?\n[\t ]*\/\/ window\.open\([^)]*\);\r?\n/, '\n');
}

export function cleanMapFragment(fragment) {
  const styleEnd = fragment.indexOf('</style>');
  if (fragment.trimStart().startsWith('<style')) {
    fragment = fragment.slice(styleEnd + '</style>'.length).trimStart();
  }

  const mapStart = fragment.indexOf('<div id="interactive-map">');
  const scriptStart = fragment.indexOf('<script', mapStart);
  const mapEnd = fragment.lastIndexOf('</div>', scriptStart) + '</div>'.length;
  const scriptEnd = fragment.indexOf('</script>', scriptStart) + '</script>'.length;

  let mapDiv = fragment.slice(mapStart, mapEnd);
  let script = fragment.slice(scriptStart, scriptEnd);

  mapDiv = cleanMapSvg(mapDiv);
  script = cleanMapScript(script);

  return `${mapDiv}\n\n${script}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] || 'index.html';
  const output = process.argv[3] || 'map.fragment.html';
  const raw = fs.readFileSync(input, 'utf8');
  fs.writeFileSync(output, cleanMapFragment(raw));
  console.log('Wrote', output);
}
