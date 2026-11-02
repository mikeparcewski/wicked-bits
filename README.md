# wicked bits

Interactive pieces and media from Wicked Agile, at **https://mikeparcewski.github.io/wicked-bits/**
(bits.wickedagile.com once its DNS record exists; see [the switch](#switch-to-bitswickedagilecom)).

| Bit | Kind | Path |
|---|---|---|
| The Work: the one-shift factory | Interactive | [`the-work-factory/`](https://mikeparcewski.github.io/wicked-bits/the-work-factory/) |

## Post a bit

1. Put the piece in its own folder under `public/`, as `public/<slug>/index.html` (plus any files it loads).
   It is served exactly as committed; the build does not touch it. Use relative links inside it, since the
   site may sit under a path (`/wicked-bits/`). `npm test` checks that every `href`, `src`, `srcset`, CSS
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
npm run dev      # http://localhost:4321/wicked-bits/
npm run build && npm test
```

A push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). To pick up a wicked-web
change, install its exact commit: `npm install "github:mikeparcewski/wicked-web#<40-char sha>"`.

## Switch to bits.wickedagile.com

The address lives in two places, each a single value: `SITE` and `BASE` in `astro.config.mjs` (this
site), and `BITS` in wicked-web's `src/data/family.js` (the family header, footer and promo card).

1. **Protect the name.** Verify `wickedagile.com` for the account first: GitHub Settings → Pages →
   Add a verified domain, then add the TXT record it gives (`_github-pages-challenge-mikeparcewski`) in
   Route 53. Without it, another account could claim `bits.wickedagile.com` between step 2's DNS record
   and step 4's Pages setting. (As of 2026-11-02 there is no such TXT record.)
2. **DNS (Route 53, the wickedagile.com zone):** UPSERT `bits.wickedagile.com` as a `CNAME` to
   `mikeparcewski.github.io`, with the TTL the `wc` and `wg` records use. Check it resolves:
   `dig +short bits.wickedagile.com`.
3. **wicked-web:** set `BITS = 'https://bits.wickedagile.com/'` (the promo's `LATEST_BIT.href` follows it)
   and merge. Nothing changes on any site until it re-pins.
4. **This repo, one PR, merged right after the domain is set:** set `SITE = 'https://bits.wickedagile.com'`
   and `BASE = '/'`, add `public/CNAME` with the line `bits.wickedagile.com` (`npm test` checks a CNAME
   ships exactly when `BASE` is `'/'`), re-pin wicked-web to step 3's commit, and update the URLs at the
   top of this README. Once its CI is green, set the custom domain and merge straight away:
   `gh api -X PUT repos/mikeparcewski/wicked-bits/pages -f cname=bits.wickedagile.com`.
   An Actions deploy takes the domain from this setting, not the CNAME file. Between the setting and the
   deploy, the domain serves the old `/wicked-bits/` paths, so keep that gap to minutes. The github.io
   URL then redirects to the domain.
5. **HTTPS:** wait for the certificate (`gh api repos/mikeparcewski/wicked-bits/pages --jq
   .https_certificate.state` reads `approved`), then enforce it, keeping the domain in the same call:
   `gh api -X PUT repos/mikeparcewski/wicked-bits/pages -f cname=bits.wickedagile.com -F https_enforced=true`.
6. **The family sites:** re-pin wicked-web in each, so their header, footer and promo point at the domain.
7. **Verify** with a cache-buster (the Pages CDN lags about 10 minutes):
   `https://bits.wickedagile.com/?cb=1` and `https://bits.wickedagile.com/the-work-factory/?cb=1` serve 200.
