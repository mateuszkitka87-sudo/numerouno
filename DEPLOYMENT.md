# Deployment — WordPress + WPBakery

This guide covers deploying the SGS e-Customs coverage map to production on the The7 + WPBakery site.

**Production URL:** https://ecustoms.sgs.com/  
**Target block:** WPBakery Raw HTML element on the Coverage section (homepage)

---

## Prerequisites

- [ ] Node.js installed locally (for building and verification)
- [ ] WordPress admin access with permission to edit WPBakery page content
- [ ] Ability to edit theme custom CSS / Templatera templates (or delegate to site admin)
- [ ] Cache purge access (WP cache plugin, CDN, SGS hosting)

---

## 1. Build the production embed

From the repository root:

```bash
npm install
npm run assemble
npm run verify:production
```

All verification steps must pass before deploying.

| Command | What it checks |
|---------|----------------|
| `npm run verify:map` | SVG unchanged at rest (0% pixel diff) |
| `npm run verify:ui` | Layout shell + hover popup |
| `npm run verify:production` | Full embed + multi-country hover |
| `npm run compare:live` | Live site DOM vs repo (post-deploy gate) |

The file to deploy is **`index.html`** in the repository root (~166 KB).

---

## 2. Pre-deploy cleanup (critical)

The live site currently loads **legacy map CSS** that conflicts with the new embed. Complete these steps **before or during** deploy:

### A. Remove legacy map rules from page custom CSS

In WPBakery → Page Settings → **Custom CSS** (or theme customizer), remove all rules targeting:

- `#interactive-map`
- `.info-text`, `.button-map`
- `.st0`–`.st10`, `.transit`, `.brokerage`, `.export`
- `#map-container`, `#ukraine`, etc.

These rules now live inside the embed’s `<style id="sgs-e-customs-map-embed">`.

### B. Clean theme custom code file

Edit or remove map-related rules in:

`wp-content/custom_codes/1243-scss-output.css`

That file contains **unscoped global selectors** (`.info-text`, `.button-map`, `.st0`, …) that leak across the entire site. Remove the map block or scope it under `#interactive-map` if other parts of the file must stay.

### C. Fix Templatera top-bar CSS

Some map CSS was saved inside `<p>` tags in a Templatera template (rules render as text, not styles). Locate and fix or remove those paragraphs.

### D. Remove duplicate page headings (optional but recommended)

The embed includes its own header:

- Eyebrow: “SGS e-Customs”
- Title: “European customs coverage”

If the page still has a separate The7 **Coverage** `h2.pagetitle` / `h5` above the map block, hide or remove them to avoid duplicate headings.

---

## 3. Deploy to WPBakery

### Step-by-step

1. Log in to WordPress admin
2. Edit the **homepage** (or Coverage page) in WPBakery
3. Locate the **Raw HTML** element in the Coverage row
4. Open the Raw HTML editor
5. **Select all** existing content and delete it
6. Open `index.html` from the repo in a plain-text editor
7. **Copy the entire file** — from `<style id="sgs-e-customs-map-embed">` through the closing `</script>`
8. Paste into the Raw HTML block
9. Save the page and **Publish**

### Important

| Do | Don't |
|----|-------|
| Paste the **full** `index.html` | Paste only `map.fragment.html` (missing layout + styles) |
| Replace **all** old embed content | Append new embed alongside old map |
| Keep one Raw HTML block | Add a second map block (duplicate `#interactive-map` IDs) |
| Ensure jQuery loads on the page (The7 default) | Assume a CDN or defer that loads jQuery after the embed script |

### WPBakery wrapper

The embed expects to render inside:

```html
<div class="wpb_raw_code wpb_raw_html wpb_content_element">
  <div class="wpb_wrapper">
    … embed …
  </div>
</div>
```

WPBakery adds this automatically for Raw HTML elements. Do not wrap the embed in extra containers unless testing.

---

## 4. Post-deploy verification

### Automated

```bash
npm run compare:live
```

This checks the live DOM for:

- `#sgs-e-customs-map-embed` style block present
- `.map-page` layout wrapper present
- Title text “European customs coverage”
- `.map-page__card` container
- Single `#interactive-map` instance
- SVG `id="interactive-map-svg"` (not legacy `svg2`)
- No legacy `#metadata7`

### Manual smoke test

- [ ] Page loads without JavaScript console errors
- [ ] Map displays with card shell and header
- [ ] Hover Netherlands (desktop) — popup appears beside country
- [ ] Click Germany — popup stays on mouse leave
- [ ] Press Escape — selection clears
- [ ] Resize browser — selected popup repositions
- [ ] Mobile — tap a country, bottom sheet appears
- [ ] Tab to a country, press Enter — popup opens

### View-source checks

Search page source for:

```
sgs-e-customs-map-embed
European customs coverage
interactive-map-svg
```

---

## 5. Cache purge

After publishing, purge all caches:

1. WordPress cache plugin (if any)
2. The7 / theme cache
3. SGS CDN / reverse proxy
4. Browser hard refresh (Ctrl+Shift+R)

Verify again with `npm run compare:live` or an incognito window.

---

## 6. Rollback

1. Restore the previous Raw HTML content from WordPress revision history (Pages → Revisions)
2. Re-enable legacy custom CSS if it was removed (not recommended long-term)
3. Purge caches

Keep a copy of the previous embed in version control or a WP revision before each deploy.

---

## 7. Deploy checklist (printable)

```
PRE-DEPLOY
[ ] npm run assemble
[ ] npm run verify:production — PASS
[ ] Content review: no Lorem ipsum in popups
[ ] data-url values populated where CTAs are needed
[ ] Legacy page custom CSS map rules identified for removal
[ ] 1243-scss-output.css map rules identified for removal

DEPLOY
[ ] Full index.html pasted into Raw HTML block
[ ] Old embed fully replaced (not appended)
[ ] Page published

POST-DEPLOY
[ ] Caches purged
[ ] npm run compare:live — PASS
[ ] Desktop hover + click tested
[ ] Mobile tap tested
[ ] No duplicate Coverage heading
[ ] View-source: sgs-e-customs-map-embed present
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Map shows but no popups | jQuery not loaded or script stripped | Confirm jQuery in theme; check user role allows `<script>` in Raw HTML |
| Old grey map, no card shell | Partial paste or cache | Paste full `index.html`; purge cache |
| Double map / broken layout | Two embeds on page | Remove duplicate Raw HTML block |
| Popups behind map | z-index stacking | See MAINTENANCE.md; may need chrome CSS fix |
| Styles look wrong | Legacy CSS still active | Remove `1243-scss-output.css` map rules and `vc_custom-css` duplicates |
| “Read more” never appears | `data-url=""` empty | Set URL in `map.fragment.html`, rebuild |
| Theme heading + embed title | Duplicate blocks | Remove theme Coverage heading |

---

## Environment reference

| Item | Value |
|------|-------|
| Embed style ID | `sgs-e-customs-map-embed` |
| Map root ID | `interactive-map` |
| SVG ID | `interactive-map-svg` |
| Layout root class | `map-page` |
| Desktop breakpoint | 1000px |
| jQuery dependency | Required (The7 provides) |
