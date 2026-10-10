# bhavnabhavanishankar.com

Static rebuild of [bhavnabhavanishankar.com](https://www.bhavnabhavanishankar.com), originally made
with Wix, for hosting on GitHub Pages.

- `index.html`, `<page>/index.html` – desktop pages
- `m/…` – mobile pages (Wix serves a separate mobile layout; `assets/site.js` sends phones there)
- `assets/media`, `assets/fonts`, `assets/ui` – images and fonts downloaded from Wix
- `assets/site.js`, `assets/site.css` – small replacement for the Wix runtime: slideshow galleries,
  image zoom, menu layout, mobile hamburger menu and the contact form
- `tools/build.py` – regenerates the pages from Wix's server-rendered HTML

The contact form has no server behind it on GitHub Pages; submitting it opens the visitor's email app
with a message addressed to the contact address.

Append `?view=desktop` or `?view=mobile` to a URL to skip the automatic device switch.
