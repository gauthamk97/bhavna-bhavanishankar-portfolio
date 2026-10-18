# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static rebuild of a Wix portfolio site (https://www.bhavnabhavanishankar.com), hosted on GitHub Pages
from `main` / root. `CNAME` serves it at `www.bhavnabhavanishankar.com`, with DNS at Namecheap (BasicDNS:
four GitHub Pages A records plus a `www` CNAME to `gauthamk97.github.io`). Pushing to `main` deploys.
Check a deploy with:

```
gh api repos/gauthamk97/bhavna-bhavanishankar-portfolio/pages/builds/latest --jq '.status+" "+.commit[0:7]'
```

There is no package manager, test suite or linter. It is plain HTML/CSS/JS plus one Python 3 stdlib build script.

## Layout

- `index.html`, `<page>/index.html` are the desktop pages. `m/index.html` and `m/<page>/index.html` are the separate Wix
  mobile layouts. The page list is `PAGES` in `tools/build.py`; `home` maps to `/`.
- `assets/site.js` and `assets/site.css` replace Wix's runtime, which is stripped out. They cover:
  - the desktop/mobile redirect, done by user agent; `?view=desktop|mobile` overrides it.
  - slideshow galleries and the image zoom, with `?lightbox=` URLs and touch zoom on mobile.
  - pro-gallery sliders/grids and their fullscreen viewer (`?pgid=`).
  - the Wix-style video control bar, Carousel widgets, menu layout and the mobile hamburger.
  - Wix's eased anchor scrolling, tooltips, keyboard focus mode and the skip-to-content button.
- `assets/media`, `assets/fonts`, `assets/ui`, `assets/video` and `assets/carousel` hold everything downloaded from Wix.
  Pages reference only relative paths, so they work both at the github.io project URL and on the custom domain.
- `tools/build.py` turns Wix's server-rendered HTML plus per-page component props into the pages above.
  `tools/assets-manifest.json` caches the mapping from remote URLs to local files.

## How changes are made

- **The pages are generated.** Fix things in `tools/build.py`, `assets/site.js` or `assets/site.css`, not by hand
  in `index.html` files, so a fix applies to every page.
  - Pages load `site.js`/`site.css` with a `?v=<md5[:8]>` cache-buster. `build.py` writes it (see `version()`), so
    after editing either file the hash in every page must be updated.
- **Rebuild:** `python3 -I tools/build.py <raw_desktop_dir> <raw_mobile_dir>`. Each dir holds
  `<page>.html` saved from the live Wix site, plus a sibling `<dir>_data/<page>.json` with `{"compProps": …}`; see
  the module docstring. Every page must report `0 remote wix refs`.
  - **The raw inputs are not in the repo, and the copies used so far have been deleted** (they lived in a temp
    scratch directory).
  - The custom domain now points at GitHub, so they can't be re-fetched from it. Recapturing needs the Wix site
    at another URL while it still exists.
  - Without them, `build.py` can't be re-run. Edit `site.js`/`site.css`, then update the `?v=` hashes in all 30 pages
    directly, e.g. with a short Python script calling the same `hashlib.md5(...).hexdigest()[:8]`.
- **Desktop vs mobile:** mobile pages have `<body class='device-mobile-optimized'>`. Mobile-only fixes go in
  `site.css` under `.device-mobile-optimized` so desktop stays untouched.
  - **Changes the owner asked for:**
    - the footer contact form is removed site-wide, and the footer is laid out as a short band;
    - the footer copyright is 2026;
    - several mobile-only layout fixes (stale Wix section min-heights, empty mobile columns, oversized text
      indents, home project order, the mse methodology overview hidden on mobile).
  - Each is commented in `site.css`/`build.py` with the pages it targets. Selectors use Wix component ids
    (`comp-…`) and `data-mesh-id` grid containers, because that is how Wix's own CSS lays pages out.
- **Wix layout model:** each container is a CSS grid (`[data-mesh-id=<id>inlineContent-gridContainer]`). Children
  are placed by `grid-area` plus `margin`/`left` offsets in Wix's inline `<style>` rules. Override those rules,
  usually with `!important`; don't restructure the DOM.
- **Checking a change:** serve the repo with `python3 -m http.server 8000`, then open `/<page>/` or
  `/m/<page>/?view=mobile`. Use a cache-busting query string so you see the files currently on disk.

## Known limits of the static site

- Art Store purchase and cart don't work.
- Like ("love") counts are kept only in the visitor's browser.
- The spatium video is 720p because the 1080p file exceeds GitHub's 100 MB file limit.
- Wix's AVIF image variants are replaced by the original files.
