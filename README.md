# wicked bits

Interactive pieces and media from Wicked Agile, at **https://bits.wickedagile.com/**
(see [the domain](#the-domain)).

| Bit | Kind | Path |
|---|---|---|
| The Work: the one-shift factory | Interactive | [`the-work-factory/`](https://bits.wickedagile.com/the-work-factory/) |

## Post a bit

1. Put the piece in its own folder under `public/`, as `public/<slug>/index.html` (plus any files it loads).
   It is served exactly as committed; the build does not touch it. Use relative links inside it, so it keeps
   working if the site moves under a path (as it was at `/wicked-bits/`). `npm test` checks that every `href`, `src`, `srcset`, CSS
   `url()` and `@import` in the bit's `index.html` stays under the base and exists. It doesn't yet read
   media attributes such as `poster` or `object data`, HTML files nested in the bit, or a `<base href>`
   ([#2](https://github.com/mikeparcewski/wicked-bits/issues/2)), so check those by eye if a bit uses them.
2. Add one entry, newest first, to `src/data/bits.js` (`slug`, `kind`, `title`, `desc`).
3. To feature it in the family footer's promo card, change `LATEST_BIT` in wicked-web's
   `src/data/family.js`, then re-pin wicked-web in the family sites.

## Develop

An Astro site at the repo root, wearing the family chrome from
[wicked-web](https://github.com/mikeparcewski/wicked-web) (a git dependency pinned by commit in
`package-lock.json`). With a `wicked-web` checkout beside this repo, local dev and builds use that
source instead; CI and the deploy have no such checkout, so they always build the pinned commit.

```bash
npm ci
npm run dev      # http://localhost:4321/
npm run build && npm test
npx playwright install chromium   # once
npm run test:e2e   # loads the index in Chromium: it opens at the top, the title below the header
```

A push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). To pick up a wicked-web
change, install its exact commit: `npm install "github:mikeparcewski/wicked-web#<40-char sha>"`.

## The background art

`src/art/bits-bg.svg` is the background art behind the page: media and play (a film strip, the player, a
waveform, the play button, ones and zeros, the factory belt, a controller, headphones, a clapperboard,
an edit timeline, the pointer, a film reel). Like the product sites, it is a mask: black strokes on
nothing, painted in the page's ink by one fixed `body::before` at 0.08 (0.06 in light), and it never
moves. A veil of the page colour behind the text column and inside the footer keeps the art at 40% or
less under any text. `npm test` checks the built rule and the emitted file; `npm run test:e2e` checks
that the art shifts the ground under text by no more than a 4% ink line, in both themes.

## The domain

The site is served at https://bits.wickedagile.com/, set in three places:

- **DNS** (Route 53, the wickedagile.com zone): `bits.wickedagile.com` is a `CNAME` to
  `mikeparcewski.github.io`, TTL 300, like the sibling `wc` and `we` records.
- **Pages** (`gh api repos/mikeparcewski/wicked-bits/pages`): the custom domain is `bits.wickedagile.com`,
  with HTTPS enforced. An Actions deploy takes the domain from this setting, not from `public/CNAME`.
  The github.io URL redirects to the domain. To change the setting, keep the domain in the same call:
  `gh api -X PUT repos/mikeparcewski/wicked-bits/pages -f cname=bits.wickedagile.com -F https_enforced=true`.
- **This repo:** `SITE` and `BASE` (`'/'`, a domain root) in `astro.config.mjs`, and `public/CNAME`
  (`npm test` checks a CNAME ships exactly when `BASE` is `'/'`). A new Pages setting serves the last
  deploy at the new address, built for the old `BASE`, so to move the site, merge the matching
  `SITE`/`BASE` change within minutes of changing the setting.

The family header, footer and promo card take the address from `BITS` in wicked-web's
`src/data/family.js`; each family site follows when it re-pins wicked-web.

To protect the name, verify `wickedagile.com` for the account: GitHub Settings → Pages → Add a verified
domain, then add the TXT record it gives (`_github-pages-challenge-mikeparcewski`) in Route 53. (As of
2026-11-02 there is no such TXT record.)

Check the site with a cache-buster, since the Pages CDN lags about 10 minutes:
`https://bits.wickedagile.com/?cb=1` and `https://bits.wickedagile.com/the-work-factory/?cb=1` serve 200.
