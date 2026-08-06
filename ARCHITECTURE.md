# Architecture — SGS e-Customs Coverage Map

This document describes how the interactive Europe coverage map is built, how it runs in the browser, and where each concern lives in the repository.

## Overview

The project produces a **single self-contained HTML fragment** (`index.html`) for pasting into a **WPBakery Raw HTML** block on the SGS e-Customs WordPress site (The7 theme). The fragment includes:

- Inline CSS (all stylesheets concatenated)
- Page layout shell (header + card)
- Map markup (SVG + country popups)
- Interaction script (jQuery)

There is no separate build server, npm runtime on WordPress, or external asset URLs for map CSS/JS.

```
┌─────────────────────────────────────────────────────────────┐
│  index.html (production paste target)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ <style id="sgs-e-customs-map-embed">                  │  │
│  │   styles.css + page-layout.css                       │  │
│  │   + map-ui-chrome.css + map-presentation.css         │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ .map-page (page-layout.wrapper.html)                  │  │
│  │   header / title / subtitle                           │  │
│  │   .map-page__card                                     │  │
│  │     #interactive-map (map.fragment.html)              │  │
│  │       <svg> … country groups … legend                 │  │
│  │       .info-text[data-name] … (one per country)       │  │
│  └───────────────────────────────────────────────────────┘  │
│  <script> … jQuery interaction … </script>                │
└─────────────────────────────────────────────────────────────┘
```

## Source files

| File | Role |
|------|------|
| `map.fragment.html` | **Source of truth** for map HTML, SVG, popups, and JavaScript |
| `page-layout.wrapper.html` | Page shell template; `{{MAP}}` is replaced with map HTML (without `<script>`) |
| `styles.css` | Map cartography CSS — country fills, legend, legacy popup base rules. Scoped to `#interactive-map` |
| `page-layout.css` | Page shell — `.map-page`, header, card, typography tokens |
| `map-ui-chrome.css` | Popup glass styling, button, animations, desktop positioning overrides |
| `map-presentation.css` | Map canvas, depth, hover dimming. Requires `.map-page__card-inner` wrapper |
| `scripts/assemble-page.mjs` | Builds `index.html` from the sources above |
| `index.html` | **Generated** production embed — do not hand-edit; regenerate with `npm run assemble` |

## How the map works

### 1. SVG cartography

The map is an inline SVG (`#interactive-map-svg`) exported from Illustrator. Landmasses use path classes (`st0`, `st1`, …). Interactive countries are grouped as:

```html
<g id="netherlands">
  <circle class="st1 brokerage" … />
  …
</g>
```

The `id` on each `<g>` **must match** the `data-name` on the corresponding `.info-text` popup.

### 2. Service types (data model)

Each country has a **service type** applied as a CSS class on its SVG paths (set by JavaScript at init):

| `data-type` | SVG class | Default fill (CSS) | Marker colour |
|-------------|-----------|-------------------|---------------|
| `transit` | `.transit` | `#ff6600` | Orange |
| `brokerage` | `.brokerage` | `url(#brokeragestripes)` | Teal `#3F5C68` |
| `export` | `.export` | `url(#exportstripes)` | Burgundy `#900C3F` |
| `inactive` | *(none — no JS wiring)* | Grey `#D1D2D5` | None |

Inactive countries have popup HTML in the DOM but **no hover/click handlers**.

### 3. Popup content

Each country has a hidden HTML block:

```html
<div class="info-text"
     data-name="netherlands"
     data-url=""
     data-type="brokerage"
     style="display: none;">
  <h3>Netherlands</h3>
  <p>…</p>
</div>
```

- `data-name` — links popup to SVG `#netherlands`
- `data-url` — if set, a “Read more” CTA button is injected
- `data-type` — drives fill class and hover colours

### 4. Legend

The in-SVG legend (`<g class="legend">`) explains transit / brokerage / export markers. Legend styling is in `styles.css`.

## Where interactions are handled

All interaction logic lives in the `<script>` block at the bottom of **`map.fragment.html`** (lines ~1441–1682). It runs inside `jQuery(document).ready`.

### Init phase

On load, for each `.info-text` block the script:

1. Reads `data-name`, `data-url`, `data-type`
2. Adds the service class (`.transit`, `.brokerage`, `.export`) to paths inside `svg #<countryName>`
3. Adds `.has_url` if `data-url` is non-empty
4. For non-`inactive` countries: attaches event handlers to `svg #<countryName>`

### Runtime behaviour

| Action | Handler | Result |
|--------|---------|--------|
| Mouse enter (desktop, mouse pointer) | `mouseenter` on country `<g>` | Positions popup, shows it, applies hover fill |
| Mouse leave | `mouseleave` | Hides popup and resets fill **unless** country is selected |
| Click / tap | `click` on country `<g>` | Toggles **selected** state (pinned popup + hover fill) |
| Click map background | `$mapRoot` click | Deselects |
| Escape | `document` keydown | Deselects |
| Enter / Space | `keydown` on country `<g>` | Triggers click (keyboard) |
| Resize / orientation | `window` | Repositions popup if a country is selected |

### Key functions

| Function | Purpose |
|----------|---------|
| `positionPopup()` | Desktop: places popup beside country using `--popup-top` / `--popup-left` CSS variables |
| `showPopup()` / `hidePopup()` | CSS class `is-visible` animation (replaces jQuery fade) |
| `selectCountry()` / `deselectCountry()` | Pinned selection state |
| `applyHoverFill()` / `applyDefaultFill()` | Inline `fill` on paths (transit orange, pattern URLs for brokerage/export) |
| `ensureCta()` | Appends “Read more” link when `data-url` is set |

### Dependencies

- **jQuery** — must be loaded by the WordPress theme before this script runs
- **`#interactive-map`** — single root element; script uses `$('#interactive-map')`

## Where popup logic lives

Popup behaviour spans three layers:

| Layer | File | Responsibility |
|-------|------|----------------|
| **Structure & data** | `map.fragment.html` | `.info-text` HTML, `data-*` attributes, `<h3>` / `<p>` content |
| **Presentation** | `map-ui-chrome.css` | Glass card, typography, `is-visible` / `is-selected` / `is-positioned` states, mobile bottom sheet |
| **Legacy base** | `styles.css` | `position: absolute`, `pointer-events`, base dimensions (overridden by chrome when classes are applied) |
| **Behaviour** | `map.fragment.html` `<script>` | Show/hide, position, selection, CTA injection, fill swaps |

Desktop popup position: JavaScript sets CSS custom properties; `map-ui-chrome.css` rule `.info-text.is-positioned` applies them with `!important` to override legacy `top: 400px` from `styles.css`.

Mobile (≤1000px): popups use a fixed bottom sheet (`map-ui-chrome.css` media query); `positionPopup()` is skipped.

## CSS layer order (in assembled embed)

Styles are concatenated in this order (later rules win at equal specificity):

1. `styles.css` — map cartography + legacy popup base
2. `page-layout.css` — page shell
3. `map-ui-chrome.css` — popup chrome + motion
4. `map-presentation.css` — canvas, hover focus (needs layout wrapper)

## Build pipeline

```bash
npm run assemble          # Regenerate index.html
npm run verify:map        # SVG pixel-identical check (0% diff at rest)
npm run verify:ui         # Layout + hover smoke test
npm run verify:production # Full production checks
npm run compare:live      # Compare live WordPress DOM vs repo embed
```

`scripts/assemble-page.mjs`:

- Splits `map.fragment.html` at `<script>` — map HTML goes into wrapper, script appended after
- Joins four CSS files into one `<style id="sgs-e-customs-map-embed">` block
- Strips dev comments from CSS/JS/HTML for production

## Verification harness

Local tests wrap the embed in a The7/WPBakery-like DOM (`scripts/wp-harness.mjs`) and run Puppeteer checks. Output goes to `scripts/output/`.

## WordPress integration notes

- The embed is **not shadow-DOM isolated** — it participates in the global CSS cascade
- Theme custom CSS (`1243-scss-output.css`, `vc_custom-css`) must not contain duplicate unscoped map rules
- Only **one** `#interactive-map` per page
- See `DEPLOYMENT.md` for paste instructions and cleanup

## Locked vs editable regions

**Treat as locked** (changes break `verify:map` or cartography):

- SVG path `d` attributes and country geometry
- SVG `id` on country `<g>` elements (must match `data-name`)
- Pattern defs (`#brokeragestripes`, `#exportstripes`, hover variants) referenced by CSS/JS
- Core fill colours in `styles.css` for `.transit`, `.brokerage`, `.export`, `.st0` land grey

**Safe to edit:**

- `page-layout.wrapper.html` — titles, copy
- `.info-text` content and `data-url` / `data-type`
- `page-layout.css`, `map-ui-chrome.css`, `map-presentation.css`
- Interaction script in `map.fragment.html` (test thoroughly after changes)
