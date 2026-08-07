export const CSS_FILES = [
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

const DETAIL_SERVICES = `
<ul class="ec-detail-card__services">
  <li class="ec-service ec-service--transit">
    <span class="ec-service__icon" aria-hidden="true">⬡</span>
    <span class="ec-service__text">
      <span class="ec-service__title">Transit operations</span>
      <span class="ec-service__sub">Full support across all borders</span>
    </span>
    <span class="ec-service__status" aria-hidden="true"></span>
  </li>
  <li class="ec-service ec-service--brokerage">
    <span class="ec-service__icon" aria-hidden="true">◫</span>
    <span class="ec-service__text">
      <span class="ec-service__title">Brokerage services</span>
      <span class="ec-service__sub">Import, export, and declarations</span>
    </span>
    <span class="ec-service__status" aria-hidden="true"></span>
  </li>
  <li class="ec-service ec-service--export">
    <span class="ec-service__icon" aria-hidden="true">▣</span>
    <span class="ec-service__text">
      <span class="ec-service__title">Export documentation</span>
      <span class="ec-service__sub">Declarations and compliance</span>
    </span>
    <span class="ec-service__status" aria-hidden="true"></span>
  </li>
  <li class="ec-service ec-service--support">
    <span class="ec-service__icon" aria-hidden="true">◉</span>
    <span class="ec-service__text">
      <span class="ec-service__title">Customs support</span>
      <span class="ec-service__sub">Consulting and certification</span>
    </span>
    <span class="ec-service__status" aria-hidden="true"></span>
  </li>
</ul>`;

export function wrapDetailCards(mapHtml) {
  return mapHtml.replace(
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
${DETAIL_SERVICES}
</div>` +
        close
      );
    }
  );
}

export function extractMapParts(mapFragment) {
  const scriptIdx = mapFragment.indexOf('<script');
  if (scriptIdx === -1) throw new Error('map.fragment.html: missing <script>');

  let mapDiv = mapFragment.slice(0, scriptIdx).trim();
  const mapScript = mapFragment.slice(scriptIdx).trim();

  const svgStart = mapDiv.indexOf('<svg');
  const svgEnd = mapDiv.indexOf('</svg>');
  if (svgStart === -1 || svgEnd === -1) throw new Error('map.fragment.html: missing <svg>');

  const svg = mapDiv.slice(svgStart, svgEnd + '</svg>'.length);
  const svgMount =
    '<div class="ec-map__svg-mount" data-svg="assets/svg/map.svg" aria-hidden="true"></div>';
  mapDiv = mapDiv.slice(0, svgStart) + svgMount + mapDiv.slice(svgEnd + '</svg>'.length);

  mapDiv = wrapDetailCards(mapDiv);

  const scriptBody = mapScript
    .replace(/^<script[^>]*>/, '')
    .replace(/<\/script>\s*$/, '')
    .trim();

  return { mapDiv, svg, scriptBody };
}
