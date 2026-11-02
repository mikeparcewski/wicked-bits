# wicked bits

Interactive pieces and media from Wicked Agile, at **https://mikeparcewski.github.io/wicked-bits/**
(bits.wickedagile.com once its DNS record exists; see [the switch](#switch-to-bitswickedagilecom)).

| Bit | Kind | Path |
|---|---|---|
| The Work: the one-shift factory | Interactive | [`the-work-factory/`](https://mikeparcewski.github.io/wicked-bits/the-work-factory/) |

## Post a bit

1. Put the piece in its own folder under `public/`, as `public/<slug>/index.html` (plus any files it loads).
   It is served exactly as committed; the build does not touch it. Use relative links inside it, since the
   site may sit under a path (`/wicked-bits/`).
2. Add one entry, newest first, to `src/data/bits.js` (`slug`, `kind`, `title`, `desc`).
3. To feature it in the family footer's promo card, change `LATEST_BIT` in wicked-web's
   `src/data/family.js`, then re-pin wicked-web in the family sites.

## Develop

An Astro site at the repo root, wearing the family chrome from
[wicked-web](https://github.com/mikeparcewski/wicked-web) (a git dependency pinned by commit in
`package-lock.json`; with a `wicked-web` checkout beside this repo, dev uses that source).

```bash
npm ci
npm run dev      # http://localhost:4321/wicked-bits/
npm run build && npm test
```

A push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). To pick up a wicked-web
change, install its exact commit: `npm install "github:mikeparcewski/wicked-web#<40-char sha>"`.

## Switch to bits.wickedagile.com

The address lives in two single values: `SITE` and `BASE` in `astro.config.mjs` (this site), and `BITS`
in wicked-web's `src/data/family.js` (the family header, footer and promo card). When DNS is available:

1. **DNS (Route 53, the wickedagile.com zone):** UPSERT `bits.wickedagile.com` as a `CNAME` to
   `mikeparcewski.github.io`, with the TTL the `wc` and `wg` records use. Check it resolves
   (`dig +short bits.wickedagile.com`).
2. **This repo, in one PR:** set `SITE = 'https://bits.wickedagile.com'` and `BASE = '/'`, and add
   `public/CNAME` containing the line `bits.wickedagile.com` (`npm test` checks a CNAME ships exactly when
   `BASE` is `'/'`). Update the URLs at the top of this README.
3. **Pages settings:** set the custom domain:
   `gh api -X PUT repos/mikeparcewski/wicked-bits/pages -f cname=bits.wickedagile.com`.
   Wait for the certificate (`gh api repos/mikeparcewski/wicked-bits/pages --jq .https_certificate.state`
   reads `approved`), then enforce HTTPS: `gh api -X PUT repos/mikeparcewski/wicked-bits/pages -F https_enforced=true`.
   The old github.io URL then redirects to the new domain.
4. **wicked-web:** set `BITS = 'https://bits.wickedagile.com/'` (the promo's `LATEST_BIT.href` follows it),
   merge, then re-pin wicked-web here and in the family sites.
5. **Verify** with a cache-buster (the Pages CDN lags about 10 minutes):
   `https://bits.wickedagile.com/?cb=1` and `https://bits.wickedagile.com/the-work-factory/?cb=1` serve 200.
