#!/usr/bin/env python3
"""Convert the Wix server-rendered pages into a self-contained static site.

Usage: python3 tools/build.py <raw_desktop_dir> <raw_mobile_dir>

Each raw dir holds one <page>.html per page (home.html for "/"), saved from
https://www.bhavnabhavanishankar.com with a desktop / mobile User-Agent.
Wix's runtime JavaScript is removed; media, fonts and CSS are downloaded into
assets/ and every reference is rewritten to a relative path, so the site works
both at a GitHub Pages project URL and on the custom domain.
"""
import concurrent.futures
import hashlib
import html
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.bhavnabhavanishankar.com"
PAGES = ["home", "about", "mse", "coastal-flavor", "enhancing-education", "finz",
         "home-1", "mgm-nexus", "spark-innovation-lab", "spatium",
         "copy-of-mse", "contact", "copy-of-finz", "copy-of-work", "clients"]
UA = {"desktop": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "mobile": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"}
EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
       "image/avif": ".avif", "image/svg+xml": ".svg", "image/x-icon": ".ico",
       "image/vnd.microsoft.icon": ".ico", "font/woff2": ".woff2", "font/woff": ".woff",
       "application/font-woff2": ".woff2", "application/font-woff": ".woff",
       "font/ttf": ".ttf", "text/css": ".css"}

# Wix image URLs contain commas (w_24,h_24,...), so a URL only ends at whitespace,
# a quote or a paren; a trailing comma is the srcset candidate separator.
MEDIA_RE = re.compile(r"(?:https?:)?//static\.wixstatic\.com/(?:media|shapes)/[^\s\"'()<>]*[^\s\"'()<>,]")
FONT_RE = re.compile(r"(?:https?:)?//static\.(?:parastorage\.com/[^\s\"'()<>]+?\.(?:woff2?|ttf|eot|otf)"
                     r"|wixstatic\.com/ufonts/[^\s\"'()<>]+?/file\.(?:woff2?|ttf|eot|otf))(?:\?[^\s\"'()<>]*)?")
# Images Wix's own component CSS uses (gallery arrows and the like).
UI_RE = re.compile(r"(?:https?:)?//static\.parastorage\.com/[^\s\"'()<>]+?\.(?:png|gif|svg|jpe?g|webp|cur)")
MANIFEST = os.path.join(ROOT, "tools", "assets-manifest.json")

downloaded = {}  # absolute url -> path relative to site root


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA["desktop"]})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get_content_type()


def local_name(url, ctype, sub):
    base = url.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
    stem = re.sub(r"[^A-Za-z0-9_.-]", "_", os.path.splitext(base)[0])[:40]
    ext = EXT.get(ctype) or os.path.splitext(base)[1] or ".bin"
    return f"assets/{sub}/{stem}-{hashlib.md5(url.encode()).hexdigest()[:10]}{ext}"


def download(url, sub):
    url = html.unescape(url)
    if url.startswith("//"):
        url = "https:" + url
    if url in downloaded and os.path.exists(os.path.join(ROOT, downloaded[url])):
        return downloaded[url]
    data, ctype = fetch(url)
    rel = local_name(url, ctype, sub)
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    downloaded[url] = rel
    return rel


def download_all(urls, sub):
    todo = sorted({u for u in urls if not resolved(u)})
    with concurrent.futures.ThreadPoolExecutor(16) as ex:
        for u, err in zip(todo, ex.map(lambda u: _safe(u, sub), todo)):
            if err:
                print("  ! failed", u, err)


def _safe(u, sub):
    try:
        download(u, sub)
    except Exception as e:  # noqa: BLE001 - report and keep going
        return e


def resolved(url):
    url = html.unescape(url)
    rel = downloaded.get("https:" + url if url.startswith("//") else url)
    return rel if rel and os.path.exists(os.path.join(ROOT, rel)) else None


def upgrade_lqip(doc):
    """Replace blurred low-quality placeholders with a full-size rendition."""
    def fix(m):
        tag = m.group(0)
        info = re.search(r'data-image-info="([^"]+)"', tag)
        if not info or "blur_" not in tag:
            return tag
        data = json.loads(html.unescape(info.group(1)))["imageData"]
        w, h, uri = data["width"], data["height"], data["uri"]
        scale = min(1.0, 1920 / max(w, h))
        w, h = round(w * scale), round(h * scale)
        full = (f"https://static.wixstatic.com/media/{uri}/v1/fill/w_{w},h_{h},al_c,q_90,"
                f"usm_0.66_1.00_0.01,enc_auto/{uri}")
        return re.sub(r'(<img[^>]*?\ssrc=")[^"]+"', lambda s: s.group(1) + full + '"', tag, count=1)
    return re.sub(r"<wow-image\b.*?</wow-image>", fix, doc, flags=re.S)


def version(rel):
    """Content hash used as a cache-busting query string."""
    with open(os.path.join(ROOT, rel), "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def page_path(page, variant):
    parts = ([] if variant == "desktop" else ["m"]) + ([] if page == "home" else [page])
    return "/".join(parts + ["index.html"])


def rel_prefix(page, variant):
    return "../" * (page_path(page, variant).count("/"))


def site_link(target, page, variant):
    """Relative link from (page, variant) to the given site path."""
    target = target.strip("/").split("?")[0]
    anchor = ""
    if "#" in target:
        target, anchor = target.split("#", 1)
        anchor = "#" + anchor
    if target and target not in PAGES:
        return None
    dest = (["m"] if variant == "mobile" else []) + ([target] if target else [])
    return (rel_prefix(page, variant) + "/".join(dest) + ("/" if dest else "")) or "./" + anchor


def convert(page, variant, src):
    doc = open(src, encoding="utf-8").read()

    # 1. Drop the Wix runtime: scripts, resource hints, noscript fallbacks.
    doc = re.sub(r"<script\b.*?</script>", "", doc, flags=re.S | re.I)
    doc = re.sub(r"<noscript\b.*?</noscript>", "", doc, flags=re.S | re.I)
    doc = re.sub(r'<link\b[^>]*rel="(?:preload|prefetch|preconnect|dns-prefetch|modulepreload)"[^>]*>',
                 "", doc, flags=re.I)
    doc = re.sub(r"<!--\s*(?:/?\$|.*?bundle.*?)\s*-->", "", doc)
    doc = re.sub(r"/\*#\s*sourceMappingURL=[^*]*\*/", "", doc)
    doc = re.sub(r'(<style\b[^>]*?)\sdata-(?:url|href)="[^"]*"', r"\1", doc)

    # The Wix "Carousel" widget renders as an empty block on the live site; keep
    # the sized container but drop its remote iframe source.
    doc = re.sub(r'(<(?:wix-)?iframe\b[^>]*?)\sdata-src="[^"]*Carousel[^"]*"', r"\1", doc)

    # 2. Swap blurred gallery placeholders for full-size images.
    doc = upgrade_lqip(doc)

    # 3. Inline external stylesheets.
    for href in set(re.findall(r'<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"', doc)):
        css = fetch(html.unescape(href))[0].decode("utf-8", "replace")
        doc = re.sub(r'<link\b[^>]*href="' + re.escape(href) + r'"[^>]*>',
                     lambda _: f"<style>{css}</style>", doc)

    # 4. Download media and fonts, then point every reference at the local copy.
    download_all(MEDIA_RE.findall(doc), "media")
    download_all(FONT_RE.findall(doc), "fonts")
    download_all(UI_RE.findall(doc), "ui")
    prefix = rel_prefix(page, variant)

    def to_local(m):
        rel = resolved(m.group(0))
        return prefix + rel if rel else m.group(0)
    doc = MEDIA_RE.sub(to_local, doc)
    doc = FONT_RE.sub(to_local, doc)
    doc = UI_RE.sub(to_local, doc)

    # 5. Internal links -> relative paths within the static site.
    def fix_link(m):
        link = site_link(m.group(2), page, variant)
        return f"{m.group(1)}{link}\"" if link is not None else m.group(0)
    doc = re.sub(r'(<a\b[^>]*?\shref=")' + re.escape(SITE) + r'(/?[^"]*)"', fix_link, doc)

    # 6. Wire in the replacement runtime (galleries, menu, form, device switch).
    other = "mobile" if variant == "desktop" else "desktop"
    alt = prefix + "/".join(page_path(page, other).split("/")[:-1])
    alt = alt + "/" if not alt.endswith("/") else alt
    head = (f'<meta name="site-variant" content="{variant}" data-alt="{alt or "./"}">'
            f'<script src="{prefix}assets/site.js?v={version("assets/site.js")}"></script>'
            f'<link rel="stylesheet" href="{prefix}assets/site.css?v={version("assets/site.css")}">')
    doc = doc.replace("</head>", head + "</head>", 1)

    out = os.path.join(ROOT, page_path(page, variant))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    leftovers = sorted(set(re.findall(r"https?://static\.(?:wixstatic|parastorage)\.com/[^\s\"'()<>]{0,60}", doc)))
    print(f"{page_path(page, variant)}: {len(doc):,} bytes, {len(leftovers)} remote wix refs")
    for l in leftovers[:5]:
        print("   ", l)


def main():
    if os.path.exists(MANIFEST):
        downloaded.update(json.load(open(MANIFEST)))
    raw = {"desktop": sys.argv[1], "mobile": sys.argv[2]}
    for variant, d in raw.items():
        for page in PAGES:
            convert(page, variant, os.path.join(d, page + ".html"))
    with open(MANIFEST, "w") as f:
        json.dump(dict(sorted(downloaded.items())), f, indent=0)
    print(f"{len(downloaded)} assets in manifest")


if __name__ == "__main__":
    main()
