// Checks the built site (run `npm run build` first): node --test tests/site.test.mjs
// The index lists every bit in src/data/bits.js under the site's base, nothing on the index, its
// stylesheets or a bit points outside the base or at a missing file, each bit is served byte for byte
// as posted, a CNAME ships exactly when the site sits at a domain root, the header is the family's
// product path (wicked-web bc5ca29 on), package.json and the lockfile pin the same wicked-web, and the
// built CSS has no media-query range syntax.
// Scope: href, src, srcset, CSS url() and @import in the index, its stylesheets and each bit's
// index.html. Media attributes (poster, object data), HTML nested in a bit and <base href> are not
// read yet (issue #2; the README's "Post a bit" says to check them by eye).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
const toDist = (url, base = BASE) => {
  const rel = decodeURIComponent(url.pathname.slice(base.length));
  const file = resolve(DIST, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
  return file.startsWith(DIST + sep) ? file : null;
};
// `base` is BASE except in the self-test, which also checks a site under a path.
function checkText(text, at, seen = new Set(), base = BASE) {
  const bad = [];
  for (const raw of refs(text)) {
    const url = new URL(raw, at);
    if (url.origin !== PAGE.origin) continue; // other sites, data:, mailto:
    if (!url.pathname.startsWith(base)) { bad.push(`${raw} -> ${url.pathname} escapes ${base}`); continue; }
    const target = toDist(url, base);
    if (!target) { bad.push(`${raw} -> ${url.pathname} escapes dist`); continue; }
    if (!existsSync(target)) { bad.push(`${raw} -> ${url.pathname} is not in dist`); continue; }
    if (target.endsWith('.css') && !seen.has(target)) { seen.add(target); bad.push(...checkText(readFileSync(target, 'utf8'), url, seen, base)); }
  }
  return bad;
}
const checkRefs = (file, at, seen) => checkText(readFileSync(file, 'utf8'), at, seen);

test('the reference check itself catches every escaping form', () => {
  html(); // needs dist
  const cases = [
    '<link rel="stylesheet" href="../missing.css">',          // a relative climb
    `<a href=${BASE}../other/>x</a>`,                           // a climb inside the path
    `<img src='nope.png'>`,                                     // a missing file
    '<style>.x{background:url(/escape.png)}</style>',           // CSS url()
    '<style>@import "/outside.css";</style>',                  // CSS @import
    `<img srcset="/escape.png 1x, ${BASE}nope2.png 2x">`,       // srcset candidates
    `<a href="${BASE}%2e%2e%2fpackage.json">x</a>`,             // an encoded climb out of dist
  ];
  for (const c of cases) assert.equal(checkText(c, PAGE).length > 0, true, c);
  assert.equal(checkText(`<img srcset="/escape.png 1x, ${BASE}nope2.png 2x">`, PAGE).length, 2);
  // the encoded climb is caught as an escape, not only as a missing file, wherever the base sits
  assert.match(checkText(`<a href="${BASE}%2e%2e%2fpackage.json">x</a>`, PAGE).join(), /escapes dist/);
  assert.deepEqual(checkText(`<a href="#top">x</a><a href="https://wickedagile.com">y</a><img src="${BASE}favicon.svg">`, PAGE), []);
  // At a domain root nothing same-origin is outside the base, so check the base rule with the site
  // under a path, against files that exist: only the escape can fail them.
  const SUB = '/sub/', at = new URL(SUB, PAGE);
  for (const c of ['<link href="../favicon.svg">', '<link href="/sub/../favicon.svg">', '<img src="/favicon.svg">']) {
    assert.deepEqual(checkText(c, at, new Set(), SUB), [`${c.match(/"([^"]*)"/)[1]} -> /favicon.svg escapes ${SUB}`], c);
  }
  assert.deepEqual(checkText('<img src="favicon.svg"><a href="/sub/the-work-factory/">x</a>', at, new Set(), SUB), []);
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

// The family chrome (wicked-web bc5ca29 on): the header is the product path "Wicked Agile / labs /
// wicked-bits", three links, and the flask links the lab. The old chrome's Experiments menu
// (#projectsBtn / #projectsMenu) is gone, and the theme is stored under 'wa-theme-v3'.
// On the old pin (cecfe2e) the header had no Breadcrumb path and still carried the menu.
const attr = (attrs, name) => attrs.match(new RegExp(String.raw`\b${name}="([^"]*)"`))?.[1] ?? null;
test('the header is the family path Wicked Agile / labs / wicked-bits, and the flask links the lab', () => {
  const page = html();
  const header = page.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(header, 'the index carries the family header');
  const crumbs = header[1].match(/<nav class="crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/);
  assert.ok(crumbs, 'the header carries the Breadcrumb path');
  const links = [...crumbs[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: attr(attrs, 'href'), label: attr(attrs, 'aria-label'), current: attr(attrs, 'aria-current'),
    text: inner.replace(/<[^>]*>/g, '').trim(),
  }));
  assert.equal(links.length, 3, 'three links');
  assert.deepEqual([links[0].href, links[0].label], ['https://wickedagile.com/', 'Wicked Agile']);
  assert.deepEqual([links[1].href, links[1].text], ['https://wickedlabs.ai/', 'labs']);
  // the last crumb is this site's home, and on the index it is the current page. The Topbar links '/'
  // because wicked-web's family manifest lists no wicked-bits site (its not-in-manifest fallback);
  // if the manifest gains one, this crumb takes that href and this check needs the new address.
  assert.deepEqual([links[2].href, links[2].text, links[2].current], [BASE, 'wicked-bits', 'page']);
  const flask = [...header[1].matchAll(/<a\b([^>]*)>/g)].map(([, a]) => a).filter((a) => attr(a, 'aria-label') === 'Wicked Labs');
  assert.deepEqual(flask.map((a) => attr(a, 'href')), ['https://wickedlabs.ai/'], 'one flask, linking the lab');
  assert.doesNotMatch(page, /id="projects(Btn|Menu)"/, 'the Experiments menu is gone');
  assert.match(page, /'wa-theme-v3'/, 'the theme is read from wa-theme-v3');
});

test('package.json and package-lock.json pin the same wicked-web commit', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const pin = pkg.dependencies['wicked-web'].match(/^github:mikeparcewski\/wicked-web#([0-9a-f]{40})$/);
  assert.ok(pin, 'wicked-web is pinned by a 40-char commit');
  assert.equal(lock.packages[''].dependencies['wicked-web'], pkg.dependencies['wicked-web']);
  assert.ok(lock.packages['node_modules/wicked-web'].resolved.endsWith(`#${pin[1]}`), 'the lockfile resolves that commit');
});

// The background art (src/art/bits-bg.svg): one fixed layer behind the page, painted in the ink through
// the art as a mask, like the product sites. Vite emits the file under the base; the index's stylesheet
// must carry it on body::before, at 0.08 (0.06 in light), below the veil and the glow (z -2), and the
// emitted file must be the committed art.
test('the background art is the committed SVG, masked onto a fixed body::before at 0.08 (0.06 light)', () => {
  const page = html();
  const css = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map(([, href]) => readFileSync(toDist(new URL(href, PAGE)), 'utf8')).join('\n');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
  const art = rules.filter((r) => r.sel === 'body:before' && /mask:url\(/.test(r.body));
  assert.equal(art.length, 1, 'one body::before rule carries the art mask');
  const d = art[0].body;
  for (const decl of ['position:fixed', 'z-index:-2', 'pointer-events:none', 'background-color:var(--ink)', 'background-image:none', 'opacity:.08']) {
    assert.ok(d.includes(decl), `body::before has ${decl}`);
  }
  // inset:0, or its four longhands where the CSS targets predate inset (Safari 14.0, the cssTarget's floor)
  const decls = d.split(';').map((x) => x.trim());
  assert.ok(decls.includes('inset:0') || ['top:0', 'right:0', 'bottom:0', 'left:0'].every((x) => decls.includes(x)), 'body::before covers the viewport (inset 0)');
  assert.ok(!/animation/.test(d), 'the art never moves');
  const urls = [...d.matchAll(/mask:url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.equal(urls.length, 2, 'the -webkit- and the standard mask');
  assert.equal(new Set(urls).size, 1, 'both masks are the same file');
  assert.match(urls[0], new RegExp(`^${BASE}_astro/bits-bg\\.[\\w-]+\\.svg$`), 'the art is emitted under the base');
  assert.equal(sha(toDist(new URL(urls[0], PAGE))), sha(join(ROOT, 'src/art/bits-bg.svg')), 'the emitted art is the committed file');
  assert.ok(rules.some((r) => /^\[data-theme=["']?light["']?\]\s*body:before$/.test(r.sel) && r.body.includes('opacity:.06')), 'light theme: 0.06');
  // only where the veil can be drawn (color-mix) and masks work; elsewhere wicked-web's layer stays
  const at = css.indexOf(art[0].body);
  const gate = css.lastIndexOf('@supports', at);
  assert.ok(gate >= 0 && !css.slice(gate, at).includes('}'), 'the art rule sits inside an @supports block');
  const cond = css.slice(gate, css.indexOf('{', gate));
  assert.match(cond, /color-mix\(/, 'the gate requires color-mix');
  assert.match(cond, /mask/, 'the gate requires a mask');
});

// Safari before 16.4 ignores media-query range syntax (`(width <= 760px)`), so on those iPhones the site keeps its
// desktop layout. The build's CSS minifier rewrites max-width and min-width into that syntax unless the CSS targets
// name an older Safari (astro.config.mjs, vite.build.cssTarget; wicked-web#63). This reads what ships: every
// dist/**/*.css and every inline <style> in dist/**/*.html, posted bits included. A media query's prelude is the text
// between @media and its `{`, comments dropped (a commented-out rule is no rule, and a comment can hold a `{`); range
// syntax is the only way a `<` or `>` gets there.
const preludes = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@media([^{]*)\{/gi)].map((m) => m[1].trim());
const ranged = (css) => preludes(css).filter((p) => /[<>]/.test(p));
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

test('the range check catches each form the minifier writes, and passes min-width and max-width', () => {
  for (const css of ['@media (width<=760px){a{b:c}}', '@media (width >= 40rem) {', '@media (400px<=width<=800px){',
    '@media screen and (width>600px){', '@media (height<640px){', '@media (min-width:0),(width<1px){',
    '@media /* { */ (width <= 760px){body{color:red}}']) {
    assert.equal(ranged(css).length, 1, css);
  }
  for (const css of ['@media (max-width:760px){', '@media (min-width: 40rem) and (max-width: 60rem) {',
    '@media (prefers-reduced-motion:no-preference){', '@media screen and (max-height:640px){',
    '/* @media (width > 760px) { } */ a{b:c}']) {
    assert.deepEqual(ranged(css), [], css);
  }
});

test('the built CSS uses min-width and max-width, never range syntax Safari before 16.4 ignores (wicked-web#63)', () => {
  html(); // needs dist
  const files = walk(DIST).filter((f) => /\.(css|html)$/.test(f));
  assert.ok(files.some((f) => f.endsWith('.css')), 'the build ships a stylesheet');
  let read = 0;
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const css = f.endsWith('.html') ? [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') : text;
    read += preludes(css).length;
    for (const q of ranged(css)) bad.push(`${relative(DIST, f)}: @media ${q}`);
  }
  assert.ok(read > 0, 'the scan read media queries (or it checks nothing)');
  assert.deepEqual(bad, []);
});
