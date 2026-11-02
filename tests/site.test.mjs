// Checks the built site (run `npm run build` first): node --test tests/site.test.mjs
// The index lists every bit in src/data/bits.js under the site's base, nothing on the index, its
// stylesheets or a bit points outside the base or at a missing file, each bit is served byte for byte
// as posted, and a CNAME ships exactly when the site sits at a domain root.
// Scope: href, src, srcset, CSS url() and @import in the index, its stylesheets and each bit's
// index.html. Media attributes (poster, object data), HTML nested in a bit and <base href> are not
// read yet (issue #2; the README's "Post a bit" says to check them by eye).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../astro.config.mjs';
import { BITS } from '../src/data/bits.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (config.base ?? '/').replace(/\/?$/, '/');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const DIST = join(ROOT, 'dist');
const INDEX = join(DIST, 'index.html');
// how Astro escapes text (html-escaper), so a title with & or quotes is found in the markup
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    assert.ok(page.includes(esc(b.title)), `${b.title}: titled`);
  }
});

// Every reference a page or stylesheet makes (href/src in any quoting, srcset candidates, CSS url()
// and @import), resolved against where it is deployed, the way a browser resolves it. Same-origin
// ones must stay under BASE and exist in dist (after decoding, so %2e%2e%2f cannot climb out).
const PAGE = new URL(BASE, config.site);
const QUOTED = String.raw`\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`;
const refs = (text) => {
  const one = (m) => m[1] ?? m[2] ?? m[3];
  const out = [
    ...[...text.matchAll(new RegExp(String.raw`\b(?:href|src)\s*=` + QUOTED, 'gi'))].map(one),
    ...[...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)].map(one),
    ...[...text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)].map(one),
  ];
  for (const m of text.matchAll(new RegExp(String.raw`\bsrcset\s*=` + QUOTED, 'gi'))) {
    out.push(...one(m).split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean));
  }
  return out;
};
const toDist = (url) => {
  const rel = decodeURIComponent(url.pathname.slice(BASE.length));
  const file = resolve(DIST, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
  return file.startsWith(DIST + sep) ? file : null;
};
function checkText(text, at, seen = new Set()) {
  const bad = [];
  for (const raw of refs(text)) {
    const url = new URL(raw, at);
    if (url.origin !== PAGE.origin) continue; // other sites, data:, mailto:
    if (!url.pathname.startsWith(BASE)) { bad.push(`${raw} -> ${url.pathname} escapes ${BASE}`); continue; }
    const target = toDist(url);
    if (!target) { bad.push(`${raw} -> ${url.pathname} escapes dist`); continue; }
    if (!existsSync(target)) { bad.push(`${raw} -> ${url.pathname} is not in dist`); continue; }
    if (target.endsWith('.css') && !seen.has(target)) { seen.add(target); bad.push(...checkText(readFileSync(target, 'utf8'), url, seen)); }
  }
  return bad;
}
const checkRefs = (file, at, seen) => checkText(readFileSync(file, 'utf8'), at, seen);

test('the reference check itself catches every escaping form', () => {
  html(); // needs dist
  const cases = [
    '<link rel="stylesheet" href="../missing.css">',          // a relative climb out of the base
    '<a href=/wicked-bits/../other/>x</a>',                     // a climb inside the path
    `<img src='nope.png'>`,                                     // a missing file
    '<style>.x{background:url(/escape.png)}</style>',           // CSS url()
    '<style>@import "/outside.css";</style>',                  // CSS @import
    '<img srcset="/escape.png 1x, /wicked-bits/nope2.png 2x">', // srcset candidates
    '<a href="/wicked-bits/%2e%2e%2fpackage.json">x</a>',       // an encoded climb out of dist
  ];
  for (const c of cases) assert.equal(checkText(c, PAGE).length > 0, true, c);
  assert.equal(checkText('<img srcset="/escape.png 1x, /wicked-bits/nope2.png 2x">', PAGE).length, 2);
  assert.deepEqual(checkText(`<a href="#top">x</a><a href="https://wickedagile.com">y</a><img src="${BASE}favicon.svg">`, PAGE), []);
});

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
