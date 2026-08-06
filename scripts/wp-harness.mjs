import fs from 'fs';
import path from 'path';
import { buildProductionEmbed } from './assemble-page.mjs';

/**
 * Wrap the WPBakery Raw HTML fragment in a The7 + WPBakery harness for local verification.
 */
export function buildWpHarness(embedHtml, { themeCss = '', outPath = null } = {}) {
  const harness = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  ${themeCss ? `<style id="theme-css">${themeCss.replace(/<\/style/gi, '<\\/style')}</style>` : ''}
  <style>html, body { margin: 0; padding: 0; min-height: 100%; background: #ffffff; }</style>
</head>
<body id="the7-body" class="home wp-singular page">
  <div id="page" class="closed-mobile-header">
    <div id="main" class="sidebar-none">
      <div class="wf-wrap">
        <div id="content" class="content">
          <div class="wpb-content-wrapper">
            <div class="vc_row wpb_row vc_row-fluid">
              <div class="wpb_column vc_column_container vc_col-sm-12">
                <div class="vc_column-inner">
                  <div class="wpb_wrapper">
                    <div class="wpb_raw_code wpb_raw_html wpb_content_element">
                      <div class="wpb_wrapper">
                        ${embedHtml}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  if (outPath) fs.writeFileSync(outPath, harness);
  return harness;
}

/**
 * Layout-matched baseline: same production embed and card shell, header hidden for stable screenshots.
 */
export function buildLayoutBaselineHarness({ outPath = null } = {}) {
  const embed = buildProductionEmbed();
  const baselineEmbed = `${embed}
<style id="verify-layout-baseline">
.map-page__header { display: none !important; }
.map-page__header,
.map-page__title,
.map-page__subtitle,
.map-page__card,
.map-page__badge { animation: none !important; }
</style>`;
  return buildWpHarness(baselineEmbed, { outPath });
}

export function wpHarnessFileUrl(outPath = 'scripts/output/wp-harness.html') {
  return 'file://' + process.cwd() + '/' + outPath;
}
