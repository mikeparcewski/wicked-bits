// Loads the built site in Chromium (run `npm run build` first, and `npx playwright install chromium`
// once): node --test tests/load.e2e.mjs
// The index must open at the top, with the title fully below the sticky header, on a desktop and a
// phone viewport. The family chrome turns on scroll snapping and snaps the footer; on a page this
// short, Chrome used to snap to the footer at load and hide the title under the header.
// Then the family header: the path, the flask and the theme toggle (wicked-web bc5ca29 on).
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

// The family header (wicked-web bc5ca29 on), the way the product sites test theirs: the path
// "Wicked Agile / labs / wicked-bits" is whole and on screen, the flask (on a phone, the menu's
// first row) links the lab, and the theme is Wicked Dark until a click stores 'wa-theme-v3'.
test('the header path is whole on screen and the flask links the lab (1440x900)', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}${BASE}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const path = page.locator('.topbar').getByRole('navigation', { name: 'Breadcrumb' });
    const links = path.getByRole('link');
    assert.equal(await links.count(), 3);
    assert.equal(await links.nth(0).getAttribute('aria-label'), 'Wicked Agile');
    for (const l of await links.all()) {
      assert.ok(await l.isVisible(), `${await l.textContent()} is visible`);
      const r = await l.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= 1440 && r.y >= 0, 'in the window');
    }
    for (const name of ['labs', 'wicked-bits']) {
      const l = path.getByRole('link', { name, exact: true });
      assert.ok(await l.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name} is whole`);
    }
    const flask = page.locator('.topbar').getByRole('link', { name: 'Wicked Labs', exact: true });
    assert.ok(await flask.isVisible(), 'the flask shows on a desktop');
    assert.equal(await flask.getAttribute('href'), 'https://wickedlabs.ai/');
    assert.equal(await page.locator('#projectsBtn, #projectsMenu').count(), 0, 'the Experiments menu is gone');
  } finally {
    await page.close();
  }
});

test('on a phone the path keeps "labs / wicked-bits" whole and the menu leads with Wicked Labs (390x844)', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${origin}${BASE}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const path = page.locator('.topbar').getByRole('navigation', { name: 'Breadcrumb' });
    for (const name of ['labs', 'wicked-bits']) {
      const l = path.getByRole('link', { name, exact: true });
      assert.ok(await l.isVisible(), `${name} is visible`);
      const r = await l.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= 390, `${name} is in the window`);
      assert.ok(await l.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name} is whole`);
    }
    await page.locator('#menuBtn').click();
    const menu = page.locator('#mobileMenu');
    await menu.waitFor({ state: 'visible' });
    const first = menu.getByRole('link').first();
    assert.match(await first.textContent(), /Wicked Labs/);
    assert.equal(await first.getAttribute('href'), 'https://wickedlabs.ai/');
  } finally {
    await page.close();
  }
});

test('the theme is Wicked Dark until a click, which stores wa-theme-v3 and survives a reload', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${origin}${BASE}`, { waitUntil: 'load' });
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const stored = () => page.evaluate(() => localStorage.getItem('wa-theme-v3'));
    assert.equal(await theme(), 'dark');
    assert.equal(await stored(), null, 'loading a page stores nothing');
    await page.locator('#themeBtn').click();
    assert.equal(await theme(), 'light');
    assert.equal(await stored(), 'light');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await theme(), 'light', 'the no-flash init re-applies the stored theme');
    await page.locator('#themeBtn').click();
    assert.equal(await theme(), 'dark');
    assert.equal(await stored(), 'dark');
  } finally {
    await ctx.close();
  }
});

// The background art (src/art/bits-bg.svg). It sits behind everything (a fixed body::before at z -2,
// not clickable, never animated, 0.08 of the ink in dark and 0.06 in light), causes no sideways scroll,
// and never darkens or lightens the ground under text by more than the 4% ink line grid this page wore
// before it: the veil behind the text column and inside the footer holds it to 40% there. Measured, with
// the text hidden, as the largest channel change the art makes under any text box, art on vs art off,
// at the top of the page and at its end.
const TEXT_RECTS = () => {
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim() || getComputedStyle(n.parentElement).visibility !== 'visible') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const q of r.getClientRects()) {
      if (q.width >= 4 && q.height >= 6 && q.bottom > 0 && q.top < innerHeight) out.push({ x: q.left, y: q.top, w: q.width, h: q.height, t: n.textContent.trim().slice(0, 30) });
    }
  }
  return out;
};
const MAX_DIFF = async ({ on, off, rects }) => {
  const load = async (b64) => { const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return g; };
  const [a, b] = [await load(on), await load(off)];
  let worst = { d: 0, t: '' };
  for (const r of rects) {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const w = Math.min(a.canvas.width, Math.ceil(r.x + r.w)) - x, h = Math.min(a.canvas.height, Math.ceil(r.y + r.h)) - y;
    if (w < 1 || h < 1) continue;
    const da = a.getImageData(x, y, w, h).data, db = b.getImageData(x, y, w, h).data;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > worst.d) worst = { d, t: r.t };
    }
  }
  return worst;
};
const rgb = (page, v) => page.evaluate((v) => { const e = document.createElement('i'); e.style.color = `var(${v})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c.match(/[\d.]+/g).slice(0, 3).map(Number); }, v);

for (const [width, height] of [[1440, 900], [390, 844], [320, 640]]) {
  for (const theme of ['dark', 'light']) {
    test(`the background art sits behind the page and keeps text contrast (${width}x${height}, ${theme})`, async () => {
      const phone = width < 600;
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
      await ctx.addInitScript((t) => localStorage.setItem('wa-theme-v3', t), theme);
      const page = await ctx.newPage();
      const lab = await ctx.newPage();
      try {
        await page.goto(`${origin}${BASE}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const art = await page.evaluate(() => { const s = getComputedStyle(document.body, '::before'); return { position: s.position, z: s.zIndex, pe: s.pointerEvents, opacity: s.opacity, mask: s.maskImage || s.webkitMaskImage, anim: s.animationName }; });
        assert.deepEqual([art.position, art.z, art.pe, art.anim], ['fixed', '-2', 'none', 'none']);
        assert.equal(art.opacity, theme === 'dark' ? '0.08' : '0.06');
        assert.match(art.mask, /bits-bg\.[\w-]+\.svg/);
        assert.ok(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth), 'no sideways scroll');
        const [ink, canvas] = [await rgb(page, '--ink'), await rgb(page, '--canvas')];
        const limit = Math.ceil(0.04 * Math.max(...ink.map((c, i) => Math.abs(c - canvas[i])))) + 1;
        await page.addStyleTag({ content: '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important} svg{visibility:hidden!important}' });
        for (const where of ['top', 'end']) {
          await page.evaluate((w) => scrollTo(0, w === 'top' ? 0 : document.documentElement.scrollHeight), where);
          await page.waitForTimeout(150);
          const rects = await page.evaluate(TEXT_RECTS);
          const on = (await page.screenshot()).toString('base64');
          const off = await page.addStyleTag({ content: 'body::before{display:none!important}' });
          await page.waitForTimeout(100);
          const offShot = (await page.screenshot()).toString('base64');
          await off.evaluate((el) => el.remove());
          const worst = await lab.evaluate(MAX_DIFF, { on, off: offShot, rects });
          assert.ok(rects.length > 0, `text on screen at the ${where}`);
          assert.ok(worst.d <= limit, `at the ${where}, the art shifts the ground under "${worst.t}" by ${worst.d} (limit ${limit}, a 4% ink line)`);
        }
      } finally {
        await ctx.close();
      }
    });
  }
}
