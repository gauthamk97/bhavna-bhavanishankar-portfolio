# bhavnabhavanishankar.com

Static rebuild of [bhavnabhavanishankar.com](https://www.bhavnabhavanishankar.com), originally made
with Wix, for hosting on GitHub Pages.

- `index.html`, `<page>/index.html` – desktop pages
- `m/…` – mobile pages (Wix serves a separate mobile layout; `assets/site.js` sends phones there)
- `assets/media`, `assets/fonts`, `assets/ui` – images and fonts downloaded from Wix
- `assets/site.js`, `assets/site.css` – replacement for the Wix runtime: galleries, image zoom,
  video players, carousels, menu layout and the mobile hamburger menu
- `tools/build.py` – regenerates the pages from Wix's server-rendered HTML

Append `?view=desktop` or `?view=mobile` to a URL to skip the automatic device switch.
