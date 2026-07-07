import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT = 'scripts/output';
fs.mkdirSync(OUT, { recursive: true });

async function inspectPage(page, label) {
  await new Promise((r) => setTimeout(r, 2500));

  const data = await page.evaluate(() => {
    const st0 = document.querySelector('#interactive-map path.st0');
    const link = document.querySelector('link[rel="stylesheet"]');

    let winningFill = null;
    let winningHref = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule.type !== CSSRule.STYLE_RULE) continue;
        if (!rule.selectorText?.includes('.st0')) continue;
        if (rule.style.fill) {
          winningFill = rule.style.fill;
          winningHref = sheet.href || 'inline';
        }
      }
    }

    const cs = st0 ? getComputedStyle(st0) : null;
    const styleSheets = Array.from(document.styleSheets).map((s) => ({
      href: s.href || 'inline',
      rules: (() => {
        try {
          return s.cssRules.length;
        } catch (e) {
          return `blocked: ${e.message}`;
        }
      })(),
    }));

    const stylesSheet = styleSheets.find((s) => String(s.href).includes('styles.css'));

    return {
      stylesheetLinkHref: link?.href || null,
      stylesCssEntry: stylesSheet || null,
      stylesCssLoaded: !!(stylesSheet && typeof stylesSheet.rules === 'number' && stylesSheet.rules > 0),
      st0: st0
        ? {
            computedFill: cs.fill,
            computedStroke: cs.stroke,
            computedStrokeWidth: cs.strokeWidth,
            winningRuleFill: winningFill,
            winningRuleStylesheet: winningHref,
          }
        : null,
    };
  });

  const clip = await page.evaluate(() => {
    const m = document.querySelector('#interactive-map');
    const r = m.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 720) };
  });
  const screenshot = path.join(OUT, `${label}.png`);
  await page.screenshot({ path: screenshot, clip });
  data.screenshot = screenshot;
  return data;
}

async function scenario(name, fn) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const networkLog = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('styles.css') || u.includes('fonts.googleapis')) {
      networkLog.push({ url: u, status: r.status(), ok: r.ok() });
    }
  });
  const url = await fn(page);
  const data = await inspectPage(page, name);
  await browser.close();
  return { label: name, url, networkLog, ...data };
}

const cwd = process.cwd();
const results = [];

results.push(
  await scenario('01-http-with-css', async (page) => {
    const { createServer } = await import('http');
    const server = createServer((req, res) => {
      const file = req.url === '/' ? 'index.html' : req.url.slice(1);
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        const type = file.endsWith('.css') ? 'text/css' : 'text/html';
        res.writeHead(200, { 'Content-Type': type });
        res.end(buf);
      });
    });
    await new Promise((r) => server.listen(9891, r));
    await page.goto('http://localhost:9891/', { waitUntil: 'networkidle2', timeout: 60000 });
    server.close();
    return 'http://localhost:9891/';
  })
);

results.push(
  await scenario('02-http-missing-css', async (page) => {
    const { createServer } = await import('http');
    const server = createServer((req, res) => {
      const file = req.url === '/' ? 'index.html' : req.url.slice(1);
      if (file === 'styles.css') {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buf);
      });
    });
    await new Promise((r) => server.listen(9892, r));
    await page.goto('http://localhost:9892/', { waitUntil: 'networkidle2', timeout: 60000 });
    server.close();
    return 'http://localhost:9892/ (styles.css 404)';
  })
);

results.push(
  await scenario('03-file-protocol', async (page) => {
    await page.goto(`file://${cwd}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    return `file://${cwd}/index.html`;
  })
);

results.push(
  await scenario('04-file-offline', async (page) => {
    await page.setOfflineMode(true);
    await page.goto(`file://${cwd}/index.html`, { waitUntil: 'load', timeout: 60000 });
    return `file://${cwd}/index.html (offline)`;
  })
);

fs.writeFileSync(path.join(OUT, 'browser-verification.json'), JSON.stringify(results, null, 2));

for (const r of results) {
  console.log(`\n=== ${r.label} ===`);
  console.log('URL:', r.url);
  console.log('styles.css loaded:', r.stylesCssLoaded, r.stylesCssEntry);
  console.log('network:', r.networkLog);
  if (r.st0) {
    console.log('computed fill:', r.st0.computedFill);
    console.log('computed stroke:', r.st0.computedStroke);
    console.log('winning rule:', r.st0.winningRuleStylesheet, '->', r.st0.winningRuleFill);
  }
  console.log('screenshot:', r.screenshot);
}
