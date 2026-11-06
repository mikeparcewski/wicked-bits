// Every bit is a framed piece on a big screen (operator, 2026-11-05: "for the bits background we need to have
// black rails (so the bit doesn't look so empty on larger screens) - not the site - the actual live bit").
// Run `npm run build` first: node --test tests/rails.e2e.mjs
//
// A bit's stage (its body) is at most 1440px wide and centred. Wider than that, black rails fill both sides, top to
// bottom, in either colour scheme, and the stage keeps its own ground (the 3px reading-progress bar along the top
// still spans the window: a HUD that keeps its place). At 1440px and under (a phone included) there
// are no rails. The rails move nothing: every control, link and fixed HUD sits where it would without them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import config from '../astro.config.mjs';
import { BITS } from '../src/data/bits.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = (config.base ?? '/').replace(/\/?$/, '/');
const STAGE = 1440;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

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
  for (const b of BITS) assert.ok(existsSync(join(DIST, b.slug, 'index.html')), `dist/${b.slug}/index.html exists (run npm run build)`);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server.close(); });

/** the RGB of each [x, y] viewport point, read off a screenshot */
async function pixels(page, points) {
  const png = (await page.screenshot()).toString('base64');
  const lab = await page.context().newPage();
  try {
    return await lab.evaluate(async ({ png, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return points.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
    }, { png, points });
  } finally { await lab.close(); }
}

/** where every control, link and fixed or sticky element is, page-relative */
const PLACES = () => [...document.querySelectorAll('body *')]
  .filter((e) => e.matches('a,button,summary,input,select,textarea,[role=button],[tabindex]') ||
    ['fixed', 'sticky'].includes(getComputedStyle(e).position))
  .map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.className || e.tagName, Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)].join(' '); });
const NO_RAILS = 'html{background:var(--bg)!important}body{max-width:none!important;box-shadow:none!important}';

async function open(slug, width, height, scheme) {
  const phone = width < 600;
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${origin}${BASE}${slug}/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

for (const b of BITS) {
  for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
    for (const scheme of ['dark', 'light']) {
      test(`${b.slug}: black rails either side of a centred ${STAGE}px stage (${width}x${height}, ${scheme})`, async () => {
        const { ctx, page } = await open(b.slug, width, height, scheme);
        try {
          const body = await page.evaluate(() => { const r = document.body.getBoundingClientRect(); return { x: r.x, w: r.width }; });
          assert.equal(body.w, STAGE, 'the stage is 1440px wide');
          assert.equal(body.x, (width - STAGE) / 2, 'and centred');
          const edge = (width - STAGE) / 2;
          for (const where of ['top', 'middle', 'end']) {
            await page.evaluate((w) => scrollTo(0, w === 'top' ? 0 : w === 'end' ? document.documentElement.scrollHeight : document.documentElement.scrollHeight / 2), where);
            await page.waitForTimeout(150);
            const ys = [24, height >> 1, height - 3]; // clear of the reading-progress bar and its glow, which span the window as before
            const rails = await pixels(page, ys.flatMap((y) => [[2, y], [edge - 3, y], [width - edge + 2, y], [width - 3, y]]));
            rails.forEach((p, i) => assert.deepEqual(p, [0, 0, 0], `${where}: rail pixel ${i} is black`));
            const inside = await pixels(page, ys.flatMap((y) => [[edge + 3, y], [width - edge - 4, y]]));
            inside.forEach((p, i) => assert.ok(p.some((c) => c > 0), `${where}: stage pixel ${i} keeps the bit's ground, not black`));
          }
        } finally { await ctx.close(); }
      });
    }
  }

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`${b.slug}: no rails at ${width}x${height}; the stage fills the window`, async () => {
      const { ctx, page } = await open(b.slug, width, height, 'dark');
      try {
        const w = await page.evaluate(() => document.body.getBoundingClientRect().width);
        assert.equal(w, await page.evaluate(() => document.documentElement.clientWidth));
        const edges = await pixels(page, [[1, height >> 1], [width - 2, height >> 1]]);
        edges.forEach((p, i) => assert.ok(p.some((c) => c > 0), `edge pixel ${i} is the bit's ground, not a rail`));
      } finally { await ctx.close(); }
    });
  }

  for (const [width, height] of [[2560, 1440], [1920, 1080], [1440, 900], [390, 844]]) {
    test(`${b.slug}: the rails move nothing interactive (${width}x${height})`, async () => {
      const { ctx, page } = await open(b.slug, width, height, 'dark');
      try {
        for (const where of [0, 0.4]) {
          await page.evaluate((f) => scrollTo(0, f * document.documentElement.scrollHeight), where);
          await page.waitForTimeout(150);
          const railed = await page.evaluate(PLACES);
          assert.ok(railed.length > 5, 'the bit has controls to check');
          const style = await page.addStyleTag({ content: NO_RAILS });
          await page.waitForTimeout(100);
          const bare = await page.evaluate(PLACES);
          assert.deepEqual(railed, bare, `scrolled to ${where * 100}%: every control and HUD is where it is without rails`);
          await style.evaluate((s) => s.remove());
        }
      } finally { await ctx.close(); }
    });
  }
}
