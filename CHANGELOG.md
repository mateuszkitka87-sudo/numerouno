# Changelog

All notable changes to the SGS e-Customs coverage map embed.

Format based on [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows the git release tag when tagged; otherwise use commit date.

---

## [Unreleased]

### Added

- Phase 1 interaction layer:
  - Contextual popup positioning on desktop (anchored to hovered country)
  - Persistent country selection (click to pin, Escape / background to dismiss)
  - Unified CSS popup animation (`is-visible` class, spring timing)
  - Touch interaction improvements (mouse-only hover, `touch-action: manipulation`)
  - Consistent “Read more” CTA on all viewports when `data-url` is set
  - Keyboard accessibility (focusable countries, Enter/Space, ARIA attributes)
- Map presentation layer (`map-presentation.css`) — sea canvas, SVG depth, hover dimming
- Production documentation: `ARCHITECTURE.md`, `DEPLOYMENT.md`, `MAINTENANCE.md`, `CHANGELOG.md`
- Verification scripts: `verify:map`, `verify:ui`, `verify:production`, `compare:live`
- WPBakery/The7 test harness (`scripts/wp-harness.mjs`)

### Changed

- Production embed built via `scripts/assemble-page.mjs` from modular source files
- Page layout shell (`.map-page`) integrated into production `index.html`
- Card width expanded to `min(1600px, 95vw)`
- Popup chrome redesigned (glass styling, pill button, native chevron)
- Desktop click behaviour: select/deselect country instead of immediate `window.open`

### Fixed

- Layout CSS hardened for The7 theme (`!important` on title/card where needed)
- Production embed sanitized (dev comments stripped from CSS/JS/HTML)
- `pointer-events` on `.button-map` inside popups for CTA clickability

### Known issues

- Live site (ecustoms.sgs.com) not yet updated with new embed — see `DEPLOYMENT.md`
- 13 inactive-country popups still contain Lorem ipsum placeholder text
- All `data-url` attributes empty — “Read more” CTAs do not render
- Legacy `1243-scss-output.css` on live site contains unscoped global map rules
- Popup z-index may render behind SVG until chrome CSS is adjusted

---

## [2026-03] — Production-ready embed refactor

### Added

- `map.fragment.html` as single source for map HTML + SVG + script
- `styles.css` scoped to `#interactive-map` (extracted from live WordPress)
- `scripts/verify-map-locked.mjs` — pixel-identical SVG regression guard
- Self-contained `index.html` for WPBakery Raw HTML paste

### Changed

- Replaced multi-file dev setup with assemble pipeline
- Removed obsolete preview/dev artifacts from repo

### Removed

- Duplicate CSS generation paths
- Unused SVG metadata/editor cruft (via clean script)

---

## [2026-03] — Apple-inspired layout (Step 1 & 2)

### Added

- `page-layout.css` — page shell, header, card chrome
- `page-layout.wrapper.html` — layout template with `{{MAP}}` placeholder
- `map-ui-chrome.css` — popup and button styling

### Changed

- Map wrapped in `.map-page` hero layout
- Typography and spacing tokens aligned to system font stack

---

## Earlier history

| Commit area | Summary |
|-------------|---------|
| `77432d7` | Initial self-contained WPBakery embed |
| `bf04ea1` | Map CSS extracted verbatim from live WordPress |
| `a790704` | Fix black map when styles fail to load |
| `7467512` | Project cleanup for production single embed |
| `cadd085` | Renamed `map.html.txt` → `index.html` |

---

## Upgrade notes

### From legacy live embed to current repo

1. Remove all legacy `#interactive-map` rules from WP custom CSS and `1243-scss-output.css`
2. Replace Raw HTML content with full new `index.html`
3. Remove duplicate Coverage headings from theme blocks
4. Run `npm run compare:live` to confirm deploy
5. Populate `data-url` and replace Lorem ipsum before public launch

### For developers

After any change to source files:

```bash
npm run assemble
npm run verify:production
```

Never hand-edit `index.html` — it is regenerated on every assemble.
