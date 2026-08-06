# Maintenance Guide

Day-to-day operations for editors and developers maintaining the SGS e-Customs coverage map.

---

## Quick reference

| Task | Edit | Then run |
|------|------|----------|
| Change popup text | `map.fragment.html` | `npm run assemble` |
| Change country URL | `map.fragment.html` `data-url` | `npm run assemble` |
| Change service type | `map.fragment.html` `data-type` | `npm run assemble` + `verify:map` |
| Change page title/copy | `page-layout.wrapper.html` | `npm run assemble` |
| Change popup appearance | `map-ui-chrome.css` | `npm run assemble` |
| Change card/layout | `page-layout.css` | `npm run assemble` |
| Change hover/canvas effects | `map-presentation.css` | `npm run assemble` |
| Change country colours | `styles.css` (carefully) | `npm run assemble` + `verify:map` |
| Change interaction logic | `map.fragment.html` `<script>` | `npm run assemble` + `verify:production` |
| Deploy to WordPress | — | See `DEPLOYMENT.md` |

**Always regenerate and verify before deploying:**

```bash
npm run assemble
npm run verify:production
```

---

## How to update an existing country

### 1. Update popup content

Open `map.fragment.html` and find the country’s `.info-text` block:

```html
<div class="info-text" data-name="germany" data-url="" data-type="brokerage" style="display: none;">
  <h3>Germany</h3>
  <p>…</p>
</div>
```

Edit the `<h3>` title and `<p>` body text.

### 2. Set the “Read more” link

Add the destination URL to `data-url`:

```html
data-url="https://ecustoms.sgs.com/germany/"
```

The script injects a “Read more” button automatically when the URL is non-empty.

### 3. Change service type

Valid `data-type` values:

| Value | Meaning |
|-------|---------|
| `transit` | Orange marker and fill |
| `brokerage` | Teal striped fill |
| `export` | Burgundy striped fill |
| `inactive` | No interaction; grey land only |

```html
data-type="transit"
```

Changing `data-type` affects which CSS class is applied to SVG paths at init. Run `npm run verify:map` after changes.

### 4. Rebuild and verify

```bash
npm run assemble
npm run verify:production
```

### 5. Deploy

Copy the new `index.html` to WPBakery per `DEPLOYMENT.md`.

---

## How to add a new country

Adding a country requires **both** SVG markup and a matching popup block. The country `id` and `data-name` must be identical.

### Step 1 — Add SVG country group

In `map.fragment.html`, inside `<g id="map-container">`, add a group with a **unique** `id` (lowercase, no spaces):

```html
<g id="spain">
  <circle class="st3 transit" cx="…" cy="…" r="141.7"/>
  <!-- paths for country shape if needed -->
</g>
```

Use an existing country group as a template. The `id` must not duplicate any other element in the document.

**Important:** Editing SVG path geometry may change the pixel baseline. Always run `npm run verify:map` after SVG edits.

### Step 2 — Add popup block

After the closing `</svg>`, add:

```html
<div class="info-text" data-name="spain" data-url="" data-type="transit" style="display: none;">
  <h3>Spain</h3>
  <p>Service description here.</p>
</div>
```

Rules:

- `data-name="spain"` **must match** `<g id="spain">`
- `data-type` must be `transit`, `brokerage`, `export`, or `inactive`
- For `inactive`, the script skips event handlers (popup never shows)

### Step 3 — Verify wiring

The init script automatically:

1. Finds `svg #spain` paths and adds the service class
2. Attaches hover/click handlers (unless `inactive`)

No manual JavaScript changes needed for a standard country.

### Step 4 — Rebuild, verify, deploy

```bash
npm run assemble
npm run verify:map        # SVG regression
npm run verify:production # Interaction smoke test
```

### Step 5 — Update legend (if needed)

If the new country introduces a new service type combination, update the in-SVG legend group (`<g class="legend">`). Legend text is inside the SVG.

---

## How to deactivate a country

Set `data-type="inactive"` on the popup:

```html
data-type="inactive"
```

The script will not attach handlers. The country group can remain in the SVG (grey land) or be hidden in SVG if preferred.

To hide in SVG without removing paths (advanced):

```html
<g id="spain" style="display:none">
```

Prefer `inactive` type unless geography must disappear entirely.

---

## How to change colours safely

### Service / marker colours (safe — CSS only)

Edit `styles.css` under `#interactive-map`:

| Selector | Controls | Current value |
|----------|----------|---------------|
| `.transit` | Transit fill | `#ff6600` |
| `circle.transit` | Transit marker | `#ff6600` |
| `circle.st1.brokerage` | Brokerage marker | `#3F5C68` |
| `circle.st4.export` | Export marker | `#900C3F` |
| `.legend rect.transit` | Legend swatch | `#ff6600` |
| `.legend rect.brokerage` | Legend swatch | `#3F5C68` |
| `.legend rect.export` | Legend swatch | `#900C3F` |

Hover colours are set in JavaScript (`applyHoverFill` in `map.fragment.html`):

- Transit hover: `#ff8f1f`
- Brokerage hover: `url(#brokeragestripeshover)`
- Export hover: `url(#exportstripeshover)`

If you change base colours, update hover values for consistency.

### Land / background colours

| Selector | Controls | Current value |
|----------|----------|---------------|
| `.st0`–`.st10` paths | Default land grey | `#D1D2D5` |
| `map-presentation.css` `--map-sea` | Canvas background | `#eef1f5` |

### Pattern fills (brokerage / export stripes)

Stripes use SVG pattern defs referenced as `url(#brokeragestripes)` and `url(#exportstripes)`. These IDs are **document-global**.

- Do not rename pattern IDs without updating `styles.css` and the JavaScript `applyDefaultFill` / `applyHoverFill` functions
- Do not duplicate pattern IDs elsewhere on the page

### UI chrome colours (safe)

| File | Tokens |
|------|--------|
| `page-layout.css` | `--ui-accent`, `--ui-text`, `--ui-bg`, card shadows |
| `map-ui-chrome.css` | Popup glass, button `#CA4300` family |

### Verification after colour changes

```bash
npm run assemble
npm run verify:map
```

`verify:map` compares computed fill/stroke on probe elements and SVG screenshots at rest. **Any change to default land or service fills at rest will fail** unless the baseline is intentionally updated.

### What not to change without a full regression

- SVG path `fill` attributes inline on paths (prefer CSS classes)
- Pattern definition geometry inside SVG `<defs>`
- Country `id` attributes
- `viewBox` on the SVG root

---

## Interaction maintenance

### Where the script lives

`map.fragment.html` — bottom `<script>` block.

### Common adjustments

| Goal | Location |
|------|----------|
| Change desktop/mobile breakpoint | `desktopBreakpoint = 1000` |
| Change popup padding from country | `popupPadding = 12` |
| Change animation duration | `animMs` (respects `prefers-reduced-motion`) |
| Change hover fill colours | `applyHoverFill()` / `applyDefaultFill()` |
| Change CTA label | `ensureCta()` string |

After script changes:

```bash
npm run assemble
npm run verify:production
```

### jQuery dependency

The script requires global `jQuery`. It is provided by the The7 theme on WordPress. Do not remove jQuery from the theme while this embed is active.

---

## CSS maintenance

### File responsibilities

| File | Edit when… |
|------|------------|
| `styles.css` | Country colours, legend, land styles, legacy popup base |
| `page-layout.css` | Header, card, page spacing, title typography |
| `map-ui-chrome.css` | Popup glass, button, animations, desktop position overrides |
| `map-presentation.css` | Sea canvas, hover dimming, SVG shadow |

### Specificity notes

- `styles.css` uses many `!important` rules (legacy from WordPress)
- `map-ui-chrome.css` overrides popup rules when `.is-positioned`, `.is-visible`, `.is-selected` classes are applied by JS
- Do not add unscoped selectors (`.info-text`, `.button-map`) — always prefix with `#interactive-map`

### Presentation layer dependency

`map-presentation.css` selectors start with `.map-page__card-inner #interactive-map`. The layout wrapper must be present. Do not deploy `map.fragment.html` alone.

---

## Verification commands

```bash
# Regenerate production embed
npm run assemble

# SVG locked — 0% pixel diff at rest, probe colours
npm run verify:map

# Layout + single-country hover
npm run verify:ui

# Full production suite
npm run verify:production

# Compare live WordPress site to repo
npm run compare:live

# Compare against live URL explicitly
node scripts/compare-live-dom.mjs https://ecustoms.sgs.com/
```

Reports are written to `scripts/output/`:

| File | Contents |
|------|----------|
| `map-locked-verify.json` | SVG pixel diff, probe values |
| `ui-verify-report.json` | Layout + hover checks |
| `production-verify.json` | Full suite results |
| `live-dom-compare.json` | Live vs repo deploy status |

---

## Content backlog (before public launch)

- [ ] Replace Lorem ipsum in 13 inactive-country popups
- [ ] Fix `austria` heading casing
- [ ] Populate `data-url` for countries that need “Read more” CTAs
- [ ] Review Spain (`data-type="inactive"` but has full copy)

---

## WordPress-specific maintenance

### Do not duplicate map CSS in theme files

All map CSS belongs in the embed. Remove duplicates from:

- WPBakery page Custom CSS
- `1243-scss-output.css`
- Templatera templates

### One embed per page

Never have two `#interactive-map` elements. IDs and SVG pattern URLs are document-global.

### Cache after every deploy

Always purge WP, theme, and CDN caches after pasting a new `index.html`.

### Revision history

Use WordPress page revisions as rollback before major embed updates.

---

## Getting help

| Question | See |
|----------|-----|
| How is the project structured? | `ARCHITECTURE.md` |
| How do I deploy? | `DEPLOYMENT.md` |
| What changed recently? | `CHANGELOG.md` |
| WP isolation / conflict issues | Prior audit notes in project history |
