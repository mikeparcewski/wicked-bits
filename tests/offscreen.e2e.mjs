// The Work factory never animates where nobody can see it and never moves the page (operator, 2026-11-04:
// "when interactives are playing the scroll is scrolling back to them ... stop an animation when it's
// offscreen"). Run `npm run build` first: node --test tests/offscreen.e2e.mjs
//
// At 1440x900, 1280x720 and 390x844, for every station whose machines loop (CSS animations): they run on
// screen; off screen, and peeking in under a quarter at an edge, nothing in the station animates, moves on or
// changes for two of its loops, the page holds still and nothing takes focus; back on screen they run again.
// A click's one-shot effect (the scanner's 1 s scan) lands at once when its station leaves; a hidden tab stops
// the machines too, and the page opts out of scroll anchoring.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import config from '../astro.config.mjs';

const DIST = process.env.BITS_DIST ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = (config.base ?? '/').replace(/\/?$/, '/');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const SIZES = [[1440, 900], [1280, 720], [390, 844]];
const LOOP = 2400; // the longest station loop is 5.6 s (the hero's lift); two of most are under 5 s
const WAIT = 5000;
// the stations whose machines loop (each must run on screen, hold off screen and run again)
const LOOPING = ['top', 'receive', 'route', 'equip', 'run', 'prove', 'learn'];

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
  assert.ok(existsSync(join(DIST, 'the-work-factory', 'index.html')), 'dist/the-work-factory/index.html exists (run npm run build)');
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server.close(); });

/** scroll (instantly) so the station is on screen, well clear of it, or peeking in under a tenth at an edge;
 *  `wait` false returns at once (the caller takes the hold boundary itself) */
async function place(page, sel, where, wait = true) {
  await page.evaluate(({ sel, where }) => {
    // an animation the page lands on its end on purpose (finish(), when a station holds) is told apart from one that ran
    if (!Animation.prototype.__offHooked) {
      const finish = Animation.prototype.finish;
      Animation.prototype.finish = function () { this.__offSettled = true; return finish.call(this); };
      Animation.prototype.__offHooked = true;
    }
    const r = document.querySelector(sel).getBoundingClientRect(), vh = innerHeight;
    const top = r.top + scrollY, bottom = r.bottom + scrollY, max = document.documentElement.scrollHeight - vh;
    let y;
    if (where === 'on') y = top - 20;
    else if (where === 'off') y = bottom + vh * 0.6 <= max ? bottom + vh * 0.6 : top - vh * 1.6;
    else { const peek = Math.min(vh * 0.1, r.height * 0.15); y = top >= vh - peek ? top - vh + peek : bottom - peek; }
    window.scrollTo({ top: Math.max(0, Math.min(max, Math.round(y))), behavior: 'instant' });
  }, { sel, where });
  if (!wait) return 0;
  await page.waitForTimeout(450);
  return page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return Math.max(seen / Math.max(1, r.height), seen / innerHeight);
  }, sel);
}
const running = (page, sel) => page.evaluate((sel) => document.querySelector(sel).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length, sel);
const snapAnimations = (page, sel) => page.evaluate((sel) => {
  window.__an = document.querySelector(sel).getAnimations({ subtree: true }).map((a) => [a, a.currentTime]);
}, sel);
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
async function watch(page, sel, anims = true) {
  if (anims) await snapAnimations(page, sel);
  await page.evaluate((sel) => {
    window.__n = 0; window.__y = scrollY; window.__f = document.activeElement; window.__ys = [];
    clearInterval(window.__iv); window.__iv = setInterval(() => window.__ys.push(scrollY), 50);
    window.__mo?.disconnect(); window.__mo = new MutationObserver((rs) => { window.__n += rs.length; });
    window.__mo.observe(document.querySelector(sel), { subtree: true, childList: true, attributes: true, characterData: true });
  }, sel);
}
const read = (page, sel) => page.evaluate((sel) => ({
  mutations: window.__n,
  running: document.querySelector(sel).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
  // an animation that moved on during the window ran, even if it finished before the end of it
  advanced: window.__an.filter(([a, at]) => !a.__offSettled && at !== null && a.currentTime !== null && a.currentTime > at + 1).length,
  moved: Math.max(...window.__ys.concat([scrollY]).map((y) => Math.abs(y - window.__y))),
  focusMoved: document.activeElement !== window.__f,
}), sel);
async function expectStill(page, sel, where) {
  await place(page, sel, where, false);
  // animations, from the hold boundary (two frames after the scroll); the DOM once the hold has written its marks
  await frames(page);
  await snapAnimations(page, sel);
  await page.waitForTimeout(450);
  const share = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return Math.max(seen / Math.max(1, r.height), seen / innerHeight);
  }, sel);
  assert.ok(share < 0.2, `${sel}: the ${where} placement shows ${share.toFixed(2)} of it`);
  await watch(page, sel, false);
  await page.waitForTimeout(WAIT);
  const s = await read(page, sel);
  assert.ok(s.moved <= 1, `${sel}: the page moved by itself (${s.moved}px) while it was ${where} screen`);
  assert.equal(s.focusMoved, false, `${sel}: focus moved while it was ${where} screen`);
  assert.equal(s.mutations, 0, `${sel}: DOM changes while it was ${where} screen`);
  assert.equal(s.running, 0, `${sel}: animations running while it was ${where} screen`);
  assert.equal(s.advanced, 0, `${sel}: animations that moved on while it was ${where} screen`);
}

// the three sizes run side by side (each holds every looping station still for two windows)
describe('the factory, off screen', { concurrency: SIZES.length }, () => {
for (const [width, height] of SIZES) {
  test(`the factory's stations hold off screen and run again when they are back (${width}x${height})`, { timeout: 300_000 }, async () => {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.route('**/*', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
      await page.goto(`${origin}${BASE}the-work-factory/`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      for (const id of LOOPING) {
        const sel = `#${id}`;
        await place(page, sel, 'on');
        await page.waitForTimeout(300);
        assert.ok((await running(page, sel)) > 0, `${sel}: its machines run on screen`);
        const y0 = await page.evaluate(() => scrollY);
        await page.waitForTimeout(LOOP);
        assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y0) <= 1, `${sel}: the page moved while it ran`);
        await expectStill(page, sel, 'off');
        await expectStill(page, sel, 'edge');
        await place(page, sel, 'on');
        assert.ok((await running(page, sel)) > 0, `${sel}: its machines run again back on screen`);
      }
    } finally {
      await page.close();
    }
  });
}
});

test("a click's one-shot effect lands at once when its station leaves (1440x900)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}${BASE}the-work-factory/`, { waitUntil: 'load' });
    await place(page, '#route', 'on');
    await page.locator('#scan-job').click();
    assert.match(await page.locator('#scan-status').textContent(), /SCANNING/, 'the scan runs');
    await page.mouse.move(0, 0);
    await page.evaluate(() => { const r = document.getElementById('route').getBoundingClientRect(); window.scrollTo({ top: r.bottom + scrollY + innerHeight * 0.6, behavior: 'instant' }); });
    await page.waitForTimeout(250);
    assert.match(await page.locator('#scan-status').textContent(), /RECIPE READY/, 'leaving, the scan lands at once');
    await watch(page, '#route');
    await page.waitForTimeout(1500);
    const s = await read(page, '#route');
    assert.equal(s.mutations, 0, 'nothing in the station changes after it left');
  } finally {
    await page.close();
  }
});

test("an effect meant for a station that is already held lands at once: a job picked in Receive starts Route's scan (390x844)", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${origin}${BASE}the-work-factory/`, { waitUntil: 'load' });
    await place(page, '#receive', 'on');
    assert.ok(await page.evaluate(() => document.getElementById('route').hasAttribute('data-offscreen')), 'Route is held while Receive is read');
    await page.locator('#orders .job[aria-pressed="false"]').first().click();
    await page.waitForTimeout(150);
    assert.match(await page.locator('#scan-status').textContent(), /RECIPE READY/, "Route's scan landed at once");
    await watch(page, '#route');
    await page.waitForTimeout(1500);
    assert.equal((await read(page, '#route')).mutations, 0, 'nothing in Route changes later');
  } finally {
    await page.close();
  }
});

test('the page opts out of scroll anchoring', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${origin}${BASE}the-work-factory/`, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflowAnchor), 'none');
  } finally {
    await page.close();
  }
});

test('a hidden tab stops the machines on screen; visible again, they run (1440x900)', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}${BASE}the-work-factory/`, { waitUntil: 'load' });
    await place(page, '#top', 'on');
    assert.ok((await running(page, '#top')) > 0, 'the hero runs');
    const hide = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
    await hide(true);
    await page.waitForTimeout(200);
    assert.equal(await running(page, '#top'), 0, 'nothing runs in a hidden tab');
    await hide(false);
    await page.waitForTimeout(200);
    assert.ok((await running(page, '#top')) > 0, 'the hero runs once the tab is visible');
  } finally {
    await page.close();
  }
});
