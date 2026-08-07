# numerouno

SGS E-Customs interactive Europe coverage map.

## Production embed (WordPress)

```bash
npm install
npm run assemble    # builds self-contained index.html for WPBakery
```

## Local development package

External CSS, JavaScript, and SVG — nothing inlined. Ready for local preview.

```bash
npm run package:local   # creates dist/sgs-e-customs-map-local.zip
npm run preview         # build + serve at http://localhost:3000
```

Extract the ZIP or open `dist/local-preview/`, then serve with any static HTTP server:

```bash
cd dist/local-preview
npx serve .
```

See `dist/local-preview/README.md` inside the package for full details.

## Verification

```bash
npm run verify:map
npm run verify:ui
npm run verify:production
```
