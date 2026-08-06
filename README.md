# SGS e-Customs — Europe Coverage Map

Self-contained interactive map embed for WordPress (WPBakery + The7).

## Quick start

```bash
npm install
npm run assemble          # Build index.html
npm run verify:production # Run all checks
```

Deploy **`index.html`** to the WPBakery Raw HTML block. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the map works, file roles, interaction flow |
| [DEPLOYMENT.md](DEPLOYMENT.md) | WordPress / WPBakery deploy steps |
| [MAINTENANCE.md](MAINTENANCE.md) | Update countries, colours, popups |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Source layout

```
map.fragment.html          Map SVG, popups, JavaScript (source of truth)
page-layout.wrapper.html   Page shell template
styles.css                 Map cartography CSS
page-layout.css            Layout / card CSS
map-ui-chrome.css          Popup & button CSS
map-presentation.css       Canvas & hover presentation CSS
index.html                 Generated production embed (do not hand-edit)
scripts/assemble-page.mjs  Build script
```

## Verification

```bash
npm run verify:map         # SVG pixel-identical regression
npm run verify:ui          # Layout + hover smoke test
npm run verify:production  # Full production checks
npm run compare:live       # Live site deploy gate
```
