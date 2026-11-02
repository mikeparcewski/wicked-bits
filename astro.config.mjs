import { defineConfig } from 'astro/config';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Where the site is served: the one place to change it. Today it is the GitHub Pages project
// URL, https://mikeparcewski.github.io/wicked-bits/. For bits.wickedagile.com, set
// SITE = 'https://bits.wickedagile.com' and BASE = '/' and add public/CNAME (README, "Switch to
// bits.wickedagile.com").
const SITE = 'https://mikeparcewski.github.io';
const BASE = '/wicked-bits/';

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
  vite: { resolve: { alias } },
});
