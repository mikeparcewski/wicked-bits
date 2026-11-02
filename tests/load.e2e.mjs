// Loads the built site in Chromium (run `npm run build` first, and `npx playwright install chromium`
// once): node --test tests/load.e2e.mjs
// The index must open at the top, with the title fully below the sticky header, on a desktop and a
// phone viewport. The family chrome turns on scroll snapping and snaps the footer; on a page this
// short, Chrome used to snap to the footer at load and hide the title under the header.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import config from '../astro.config.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = (config.base ?? '/').replace(/\/?$/, '/');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// dist served under BASE, the way Pages serves it
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(BASE)) { res.writeHead(404).end(); return; }
  let file = resolve(DIST, path.slice(BASE.length));
  if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(404).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
let origin, browser;
before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'dist/index.html exists (run npm run build)');
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server.close(); });

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`the index opens at the top with the title below the header (${width}x${height})`, async () => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(`${origin}${BASE}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800); // let any load-time snap settle
      const m = await page.evaluate(() => ({
        y: scrollY,
        max: document.documentElement.scrollHeight - innerHeight,
        header: document.querySelector('.topbar').getBoundingClientRect().bottom,
        h1: document.querySelector('h1.bits-title').getBoundingClientRect().toJSON(),
        vh: innerHeight,
      }));
      assert.equal(m.y, 0, `loads at the top (scrollY ${m.y} of max ${m.max})`);
      assert.ok(m.h1.top >= m.header, `the title (top ${m.h1.top}) is below the header (bottom ${m.header})`);
      assert.ok(m.h1.bottom <= m.vh, `the title (bottom ${m.h1.bottom}) is in the viewport (${m.vh})`);
    } finally {
      await page.close();
    }
  });
}
