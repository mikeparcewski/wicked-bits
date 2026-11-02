// Checks the built site (run `npm run build` first): node --test tests/site.test.mjs
// The index lists every bit in src/data/bits.js under the site's base, each bit is served byte for
// byte as posted, and a CNAME ships exactly when the site sits at a domain root.
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

test('every site-relative link and asset on the index stays under the base', () => {
  const page = html();
  const local = [...page.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(local.includes(`${BASE}favicon.svg`), 'the favicon is base-aware');
  assert.deepEqual(local.filter((u) => !u.startsWith(BASE)), []);
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
