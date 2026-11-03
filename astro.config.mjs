import { defineConfig } from 'astro/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Where the site is served: the one place to change it. It is https://bits.wickedagile.com/, a
// domain root, so BASE is '/' and public/CNAME names the domain (README, "The domain"). On the
// Pages project URL it would be SITE = 'https://mikeparcewski.github.io', BASE = '/wicked-bits/'
// and no CNAME.
const SITE = 'https://bits.wickedagile.com';
const BASE = '/';

// Shared chrome lives in the `wicked-web` package. Develop against the local
// source when it sits beside this repo (../wicked-web), otherwise (CI) resolve
// the installed github:mikeparcewski/wicked-web package from node_modules.
const localUI = fileURLToPath(new URL('../wicked-web/src', import.meta.url));
const alias = existsSync(localUI) ? { 'wicked-web': localUI } : {};

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  // Astro's HTML compression deletes the space before inline tags (<b>, <code>) and fuses words.
  compressHTML: false,
  vite: {
    resolve: { alias },
    // Safari before 16.4 ignores media-query range syntax (`width <= 760px`), so the minifier must keep min-width and
    // max-width: the CSS targets name the oldest browsers the site supports (wicked-web#63, wickedagile#71).
    build: { cssTarget: ['chrome100', 'edge100', 'firefox100', 'safari14'] },
  },
});
