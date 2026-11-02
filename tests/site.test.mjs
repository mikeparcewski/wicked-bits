// Checks the built site (run `npm run build` first): node --test tests/site.test.mjs
// The index lists every bit in src/data/bits.js under the site's base, nothing on the index, its
// stylesheets or a bit points outside the base or at a missing file, each bit is served byte for byte
// as posted, and a CNAME ships exactly when the site sits at a domain root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../astro.config.mjs';
import { BITS } from '../src/data/bits.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (config.base ?? '/').replace(/\/?$/, '/');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const INDEX = join(ROOT, 'dist/index.html');
const html = () => {
  assert.ok(existsSync(INDEX), 'dist/index.html exists (run npm run build)');
  return readFileSync(INDEX, 'utf8');
};

test('the index carries the title, the intro and a card for every bit, linked under the base', () => {
  const page = html();
  assert.match(page, /<h1 class="bits-title"[^>]*>wicked bits<\/h1>/);
  assert.match(page, /class="bits-intro"/);
  assert.ok(BITS.length > 0);
  for (const b of BITS) {
    assert.match(b.slug, /^[a-z0-9-]+$/, `${b.title}: slug is one folder name`);
    assert.ok(page.includes(`href="${BASE}${b.slug}/"`), `${b.title}: linked at ${BASE}${b.slug}/`);
    assert.ok(page.includes(b.title), `${b.title}: titled`);
  }
});

// Every reference a page or stylesheet makes (href/src in any quoting, CSS url()), resolved against
// where it is deployed, the way a browser resolves it. Same-origin ones must stay under BASE and exist.
const PAGE = new URL(BASE, config.site);
const refs = (text) => [
  ...text.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi),
  ...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi),
].map((m) => m[1] ?? m[2] ?? m[3]);
const toDist = (url) => {
  const rel = decodeURIComponent(url.pathname.slice(BASE.length));
  return join(ROOT, 'dist', rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
};
function checkRefs(file, at, seen = new Set()) {
  const bad = [];
  for (const raw of refs(readFileSync(file, 'utf8'))) {
    const url = new URL(raw, at);
    if (url.origin !== PAGE.origin) continue; // other sites, data:, mailto:
    if (!url.pathname.startsWith(BASE)) { bad.push(`${raw} -> ${url.pathname} escapes ${BASE}`); continue; }
    const target = toDist(url);
    if (!existsSync(target)) { bad.push(`${raw} -> ${url.pathname} is not in dist`); continue; }
    if (target.endsWith('.css') && !seen.has(target)) { seen.add(target); bad.push(...checkRefs(target, url, seen)); }
  }
  return bad;
}

test('every same-origin reference on the index and in its stylesheets stays under the base and exists', () => {
  const page = html();
  assert.ok(page.includes(`href="${BASE}favicon.svg"`), 'the favicon is base-aware');
  const seen = new Set();
  assert.deepEqual(checkRefs(INDEX, PAGE, seen), []);
  assert.ok(seen.size > 0, 'the index links at least one stylesheet, and it was checked');
});

test('every same-origin reference in each bit stays under the base and exists', () => {
  for (const b of BITS) {
    assert.deepEqual(checkRefs(join(ROOT, 'dist', b.slug, 'index.html'), new URL(`${b.slug}/`, PAGE)), [], b.slug);
  }
});

test('every bit is served as posted: dist matches public byte for byte', () => {
  for (const b of BITS) {
    const src = join(ROOT, 'public', b.slug, 'index.html');
    assert.ok(existsSync(src), `${src} exists`);
    assert.equal(sha(join(ROOT, 'dist', b.slug, 'index.html')), sha(src), `${b.slug} is unchanged by the build`);
  }
});

test('a CNAME ships exactly when the site sits at a domain root (BASE "/")', () => {
  // On the Pages project URL a CNAME would redirect visitors to a domain that may not resolve yet.
  assert.equal(existsSync(join(ROOT, 'dist/CNAME')), BASE === '/');
});
