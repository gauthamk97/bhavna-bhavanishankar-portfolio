#!/usr/bin/env python3
"""Convert the Wix server-rendered pages into a self-contained static site.

Usage: python3 tools/build.py <raw_desktop_dir> <raw_mobile_dir>

Each raw dir holds one <page>.html per page (home.html for "/"), saved from
https://www.bhavnabhavanishankar.com with a desktop / mobile User-Agent, and
next to it a <raw_dir>_data/<page>.json with the page's component props
({"compProps": {...}}, from the siteassets "thunderbolt-features" JSON the live
page loads). Wix renders galleries, videos and carousels from those props at
runtime, so the server HTML alone is incomplete.
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
    with urllib.request.urlopen(req, timeout=600) as r:
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


def div_end(doc, start):
    """Index just past the </div> closing the <div> that starts at `start`."""
    depth = 0
    for m in re.compile(r"<div\b|</div>").finditer(doc, start):
        depth += 1 if m.group(0) == "<div" else -1
        if not depth:
            return m.end()
    raise ValueError("unbalanced div at %d" % start)


def media_url(uri, w, h, q=85):
    return (f"https://static.wixstatic.com/media/{uri}/v1/fill/w_{round(w)},h_{round(h)},al_c,q_{q},"
            f"usm_0.66_1.00_0.01,enc_auto/{uri}")


def box_size(doc, comp):
    m = re.search(r"#" + re.escape(comp) + r"\{width:(\d+)px;height:(\d+)px;\}", doc)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def expand_galleries(doc, props):
    """The server HTML only holds a window of each slideshow's slides (first,
    second, last); rebuild the hidden ghost list from the full item list."""
    for m in list(re.finditer(r'<div id="(comp-[^"]+)" data-testid="slide-show-gallery"', doc))[::-1]:
        items = props.get(m.group(1), {}).get("items")
        first = doc.find('data-testid="gallery-item-ghost"', m.end())
        if not items or first < 0:
            continue
        start = doc.rfind("<div", 0, first)
        end = start
        while doc.startswith("<div", end) and 'data-testid="gallery-item-ghost"' in doc[end:doc.find(">", end)]:
            end = div_end(doc, end)
        tpl = doc[start:div_end(doc, start)]
        old_title = re.search(r'data-testid="gallery-item-title"[^>]*>([^<]*)<', tpl).group(1)
        ghosts = []
        for i, it in enumerate(items):
            img = it["image"]
            info = json.loads(html.unescape(re.search(r'data-image-info="([^"]+)"', tpl).group(1)))
            info["imageData"].update(width=img["width"], height=img["height"], uri=img["uri"])
            title = html.escape(it.get("title", ""))
            g = tpl.replace(f'aria-label="{old_title}"', f'aria-label="{title}"')
            g = g.replace(f'alt="{old_title}"', f'alt="{title}"')
            g = re.sub(r'(data-testid="gallery-item-title"[^>]*>)[^<]*', lambda s: s.group(1) + title, g)
            g = re.sub(r'(data-testid="gallery-item-description"[^>]*>)[^<]*',
                       lambda s: s.group(1) + html.escape(it.get("description", "")), g)
            g = re.sub(r'data-image-info="[^"]+"',
                       lambda _: 'data-image-info="' + html.escape(json.dumps(info, separators=(",", ":"))) + '"', g)
            g = re.sub(r"describedby_item-\d+-", f"describedby_item-{i}-", g)
            # Wix's zoom view puts ?lightbox=<item id> in the URL.
            g = g.replace('data-testid="gallery-item-ghost"',
                          f'data-testid="gallery-item-ghost" data-item-id="{html.escape(it.get("id", ""))}"', 1)
            ghosts.append(g)  # upgrade_lqip swaps in the full-size src from data-image-info
        doc = doc[:start] + "".join(ghosts) + doc[end:]
    return doc


# Wix Art Store galleries show the item info in a side bar in the fullscreen view.
ART_STORE_APP = "147ab90e-91c5-21b2-d6ca-444c28c8a23b"


def warmup_galleries(doc):
    """Pro-gallery item lists (in display order) from the page's warmup data."""
    m = re.search(r'<script type="application/json" id="wix-warmup-data">(.*?)</script>', doc, re.S)
    out = {}
    for app, data in (json.loads(m.group(1)).get("appsWarmupData", {}) if m else {}).items():
        for key, val in (data or {}).items():
            if key.endswith("_galleryData") and isinstance(val, dict) and val.get("items"):
                out[key[:-len("_galleryData")]] = (app, val["items"])
    return out


def item_blocks(g):
    """(start, end) of each item's outermost element inside a pro-gallery."""
    blocks = []
    for m in re.finditer(r'<div data-id="[^"]+" class="item-link-wrapper"', g):
        start = m.start()
        outer = g.rfind("<div", 0, start)
        if outer >= 0 and g.startswith('<div data-hook="group-view"', outer) and g.find(">", outer) + 1 == start:
            start = outer  # slider items are wrapped in a group-view
        blocks.append((start, div_end(g, start)))
    return blocks


def item_box(block):
    style = re.search(r'data-hook="item-container"[^>]*style="([^"]*)"', block).group(1)
    num = lambda k: float(re.search(r"(?:^|;)" + k + r":(-?[\d.]+)", style).group(1))
    return num("left"), num("top"), num("width"), num("height")


def media_with_token(uri, mode, w, h, token=None):
    url = (f"https://static.wixstatic.com/media/{uri}/v1/{mode}/w_{round(w)},h_{round(h)},q_90,"
           f"usm_0.66_1.00_0.01,enc_auto/{uri}")
    return url + (f"?token={token}" if token else "")


def new_item(tpl, old, it, i, box, tbox):
    """Clone the template item block for warmup item `it` at index i, size and
    position `box` (template: `old`, `tbox`)."""
    md, omd = it["metaData"], old["metaData"]
    (l, t, w, h), (tl, tt, tw, th) = box, tbox
    g = tpl
    for a, b in ((old["itemId"], it["itemId"]), (old["itemId"].replace("-", ""), it["itemId"].replace("-", ""))):
        g = g.replace(a, b)
    g = re.sub(r'(id="pgi[0-9a-f]+_)\d+"', lambda m: f'{m.group(1)}{i}"', g)
    g = re.sub(r'data-idx="\d+"', f'data-idx="{i}"', g)
    # Wix uses the item's own alt text for the image and its action label
    # ("image" when there is none).
    alt = html.escape(md.get("alt", ""))
    g = re.sub(r'(<img\b[^>]*?\salt=")[^"]*"', lambda m: m.group(1) + alt + '"', g)
    g = re.sub(r'(data-hook="item-action"[^>]*?\saria-label=")[^"]*"|(\saria-label=")[^"]*("[^>]*data-hook="item-action")',
               lambda m: (m.group(1) + (alt or "image") + '"') if m.group(1) else (m.group(2) + (alt or "image") + m.group(3)), g)
    fmt = lambda v: ("%g" % round(v, 3))
    g = re.sub(r"\bwidth:" + re.escape(fmt(tw)) + "px", "width:" + fmt(w) + "px", g)
    g = re.sub(r"\bheight:" + re.escape(fmt(th)) + "px", "height:" + fmt(h) + "px", g)
    g = re.sub(r"(data-hook=\"item-container\"[^>]*style=\"[^\"]*?)top:[^;]*;left:[^;]*;",
               lambda m: f"{m.group(1)}top:{fmt(t) + 'px' if t else 0};left:{fmt(l) + 'px' if l else 0};", g)
    g = re.sub(r"--group-left:[\d.]+px", f"--group-left:{fmt(l)}px", g)
    g = re.sub(r"--group-width:([\d.]+)px", lambda m: f"--group-width:{fmt(float(m.group(1)) - tw + w)}px", g)
    ouri, nuri = omd["name"], md["name"]
    ostem, oext = os.path.splitext(ouri)
    nstem, next_ = os.path.splitext(nuri)

    def url(m):
        u = m.group(0)
        if ouri not in u:
            return u
        u = u.split("?token=")[0]
        p = re.search(r"/v1/(fit|fill)/w_(\d+),h_(\d+)", u)
        k = int(p.group(2)) / tw
        nw, nh = w * k, h * k
        if p.group(1) == "fit" and nw > md["width"]:
            nw, nh = md["width"], md["width"] * h / w
        u = u.replace(p.group(0), f"/v1/{p.group(1)}/w_{round(nw)},h_{int(nh)}")
        u = u.replace(f"/media/{ouri}/", f"/media/{nuri}/")
        u = re.sub(re.escape(ostem) + r"\.(\w+)$", lambda e: nstem + (next_ if "." + e.group(1) == oext else "." + e.group(1)), u)
        return u + (f"?token={it['token']}" if it.get("token") else "")
    return MEDIA_RE.sub(url, g)


def fill_pro_galleries(doc, galleries):
    """Wix renders only the first items of a pro-gallery on the server and adds
    the rest in the browser; render every item from the warmup data (same
    markup and geometry as Wix's), and tag each with what site.js needs for
    the fullscreen view."""
    for comp, (app, items) in galleries.items():
        gstart = doc.find(f'<div id="pro-gallery-{comp}" class="pro-gallery"')
        if gstart < 0:
            continue
        gend = div_end(doc, gstart)
        g = doc[gstart:gend]
        blocks = item_blocks(g)
        have = {re.search(r'data-id="([^"]+)"', g[s:e]).group(1): g[s:e] for s, e in blocks}
        by_id = {it["itemId"]: it for it in items}
        if not have or set(have) - set(by_id) or any(blocks[k][1] != blocks[k + 1][0] for k in range(len(blocks) - 1)):
            continue
        boxes = [item_box(b) for b in have.values()]
        row = all(b[1] == boxes[0][1] for b in boxes)
        gap = boxes[1][0] - boxes[0][0] - boxes[0][2] if row and len(boxes) > 1 else 10
        tpl_id, tpl = list(have.items())[-1]
        tbox = item_box(tpl)
        out, placed = [], []
        for i, it in enumerate(items):
            if it["itemId"] in have:
                block = have[it["itemId"]]
                box = item_box(block)
            else:
                md, tmd = it["metaData"], by_id[tpl_id]["metaData"]
                w, h = tbox[2], tbox[3]
                if abs(tbox[2] / tbox[3] - tmd["width"] / tmd["height"]) < 0.02:
                    w = round(h * md["width"] / md["height"])  # sized by aspect ratio
                if row:
                    prev = placed[-1]
                    box = (prev[0] + prev[2] + gap, prev[1], w, h)
                else:
                    cols = sum(1 for b in boxes if b[1] == boxes[0][1])
                    base, pitch = placed[i - cols], boxes[cols][1] - boxes[0][1]
                    box = (base[0], base[1] + pitch, w, h)
                block = new_item(tpl, by_id[tpl_id], it, i, box, tbox)
            placed.append(box)
            md = it["metaData"]
            scale = min(1.0, 1920 / max(md["width"], md["height"]))
            full = media_with_token(md["name"], "fit", md["width"] * scale, md["height"] * scale, it.get("token"))
            attrs = (f' data-title="{html.escape(md.get("title", ""))}" data-full="{full}"'
                     f' data-w="{md["width"]}" data-h="{md["height"]}"')
            block = re.sub(r'(<div [^>]*data-hook="item-container")', lambda m: m.group(1) + attrs, block, count=1)
            out.append(block)
        first, last = blocks[0][0], blocks[-1][1]
        g = g[:first] + "".join(out) + g[last:]
        info = ' data-pg-info="side"' if app == ART_STORE_APP else ""
        g = g.replace('class="pro-gallery"', f'class="pro-gallery" data-pg-fullscreen{info}', 1)
        doc = doc[:gstart] + g + doc[gend:]
    return doc


def sharpen_prerendered(doc):
    """Galleries Wix lays out only in the browser (e.g. the Albums widget) are
    re-laid out by site.js at the real width; fetch their images large enough."""
    for m in list(re.finditer(r'class="pro-gallery-prerender"', doc))[::-1]:
        start = doc.rfind('<div id="pro-gallery-', 0, m.start())
        end = div_end(doc, start)

        def big(u):
            p = re.search(r"/v1/fill/w_(\d+),h_(\d+)", u.group(0))
            if not p:
                return u.group(0)
            k = 800 / max(int(p.group(1)), int(p.group(2)))
            return u.group(0).replace(p.group(0), f"/v1/fill/w_{round(int(p.group(1)) * k)},h_{round(int(p.group(2)) * k)}")
        doc = doc[:start] + MEDIA_RE.sub(big, doc[start:end]) + doc[end:]
    return doc


SKIP_BUTTON = ('<button id="SKIP_TO_CONTENT_BTN" class="SKIP_TO_CONTENT_BTN BqYkvS has-custom-focus" tabindex="0">'
               'Skip to Main Content</button>')


def add_skip_button(doc):
    """Wix renders its "Skip to Main Content" button in the browser, after the
    top-of-page anchor, when the header has something focusable."""
    header = re.search(r"<header\b.*?</header>", doc, re.S)
    if not header or not re.search(r"<(?:a\b[^>]*\shref=|button\b|input\b|select\b|textarea\b)", header.group(0)):
        return doc
    m = re.search(r'<div id="SCROLL_TO_TOP"[^>]*>.*?</div>', doc, re.S)
    return doc[:m.end()] + SKIP_BUTTON + doc[m.end():] if m else doc


PLAY_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin slice" viewBox="0 0 36 36">'
            '<g fill="none" fill-rule="evenodd"><circle cx="18" cy="18" r="17" stroke="#fff" stroke-width="2"></circle>'
            '<path fill="#fff" d="m23.935 17.708-10.313 6.033V11.676z"></path></g></svg>')


def fill_videos(doc, props, prefix, variant):
    """Wix-hosted video players: the server HTML is an empty box. Render Wix's
    resting state (poster under the play-button cover) and keep a local copy of
    the video for site.js to play."""
    vp = re.search(r"VideoPlayer\d+", doc)
    pc = re.search(r"PlayableCover\d+", doc)

    def fill(m):
        comp = m.group(1)
        p = props.get(comp)
        if not p or "video.wixstatic.com" not in p.get("src", "") or not vp or not pc:
            return m.group(0)
        src, small = p["src"], p["src"].replace("/1080p/", "/720p/")
        # GitHub rejects files over 100MB; fall back to 720p for very large ones.
        if not resolved(src) and (resolved(small) or int(urllib.request.urlopen(
                urllib.request.Request(src, method="HEAD"), timeout=60).headers["Content-Length"]) > 50e6):
            src = small
        video = prefix + download(src, "video")
        poster = p.get("playableConfig", {}).get("poster", {})
        w, h = box_size(doc, comp)
        cls = f"{pc.group(0)}__root {vp.group(0)}__cover" + (f" {vp.group(0)}--isMobileView" if variant == "mobile" else "")
        img = ""
        if poster.get("uri"):
            img = (f'<wow-image class="Qh0lWW"><img alt="" src="{media_url(poster["uri"], 2 * w, 2 * h)}" '
                   f'style="width:100%;height:100%;object-fit:cover"></wow-image>')
        cover = (f'<div data-testid="playable-cover" id="cover-{comp}" class="{cls}">{img}'
                 f'<div class="{pc.group(0)}__overlay"><button class="{pc.group(0)}__playButton" '
                 f'aria-label="Play video">{PLAY_SVG}</button></div></div>')
        attrs = (f' data-video="{video}" data-loop="{str(p.get("loop", False)).lower()}"'
                 f' data-muted="{str(p.get("muted", False)).lower()}"')
        return m.group(0)[:-len("></div>")] + attrs + ">" + cover + "</div>"
    return re.sub(r'<div id="(comp-[^"]+)" class="VideoPlayer\d+__root[^"]*"[^>]*></div>', fill, doc)


carousel_html = None


def attr_json(value):
    """JSON for a single-quoted attribute; keeps media URLs quote-delimited."""
    return (json.dumps(value, separators=(",", ":")).replace("&", "&amp;")
            .replace("'", "&#39;").replace("<", "&lt;"))


def carousel_widget(url):
    """Self-host Wix's "Carousel" widget page and the scripts it loads."""
    global carousel_html
    if carousel_html is None:
        page = fetch(url.split("?")[0])[0].decode("utf-8")
        for src in set(re.findall(r'<script[^>]*src="((?:https?:)?//[^"]+)"', page)):
            rel = download(src, "carousel")
            page = page.replace(f'src="{src}"', f'src="{os.path.basename(rel)}"')
        carousel_html = f"assets/carousel/Carousel-{hashlib.md5(page.encode()).hexdigest()[:10]}.html"
        with open(os.path.join(ROOT, carousel_html), "w", encoding="utf-8") as f:
            f.write(page)
    return carousel_html


def fill_carousels(doc, props, prefix):
    """Point the Carousel iframes at the local widget and attach the settings
    the Wix page posts to it (site.js sends them when the widget is ready)."""
    def fix(m):
        comp, src = m.group(1), html.unescape(m.group(2))
        p = props.get(comp)
        if not p or not p.get("images"):
            return re.sub(r'\sdata-src="[^"]*"', "", m.group(0))
        w, h = box_size(doc, comp)
        # The widget shows each image at most 1/2.4 of its width; keep 2x that.
        tw = max(w / 2.4 * 2, 600)
        items = []
        for im in p["images"]:
            scale = min(1.0, tw / im["width"])
            items.append(dict(im, uri=media_url(im["uri"], im["width"] * scale, im["height"] * scale, 90)))
        params = {"props": p.get("compProps", {}), "quality": p.get("quality", {}),
                  "marketingLandingPage": False, "items": items, "mainPageId": p.get("mainPageId")}
        local = prefix + carousel_widget(src) + "?" + src.split("?", 1)[1]
        frame = (f'<iframe class="{m.group(3)}" src="{html.escape(local)}" loading="lazy" scrolling="no" '
                 f"data-carousel='{attr_json(params)}'></iframe>")
        return re.sub(r'\sdata-src="[^"]*"', "", m.group(0)[:m.group(0).find("<iframe")]) + frame
    return re.sub(r'<wix-iframe id="(comp-[^"]+)"[^>]*data-src="([^"]*Carousel[^"]*)"[^>]*>'
                  r'<iframe class="([^"]*)"[^>]*></iframe>', fix, doc)


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
    if anchor and (target or "home") == page:
        return anchor  # same page: jump without reloading
    dest = (["m"] if variant == "mobile" else []) + ([target] if target else [])
    return (rel_prefix(page, variant) + "/".join(dest) + ("/" if dest else "") or "./") + anchor


def convert(page, variant, src, data):
    doc = open(src, encoding="utf-8").read()
    galleries = warmup_galleries(doc)
    props = json.load(open(data))["compProps"] if os.path.exists(data) else {}
    prefix = rel_prefix(page, variant)

    # 1. Drop the Wix runtime: scripts, resource hints, noscript fallbacks.
    doc = re.sub(r"<script\b.*?</script>", "", doc, flags=re.S | re.I)
    doc = re.sub(r"<noscript\b.*?</noscript>", "", doc, flags=re.S | re.I)
    doc = re.sub(r'<link\b[^>]*rel="(?:preload|prefetch|preconnect|dns-prefetch|modulepreload)"[^>]*>',
                 "", doc, flags=re.I)
    doc = re.sub(r"<!--\s*(?:/?\$|.*?bundle.*?)\s*-->", "", doc)
    doc = re.sub(r"/\*#\s*sourceMappingURL=[^*]*\*/", "", doc)
    doc = re.sub(r'(<style\b[^>]*?)\sdata-(?:url|href)="[^"]*"', r"\1", doc)

    # 2. Components Wix renders from its page data: every slideshow slide,
    #    video players, the "Carousel" widget and every pro-gallery item.
    doc = expand_galleries(doc, props)
    doc = fill_videos(doc, props, prefix, variant)
    doc = fill_carousels(doc, props, prefix)
    doc = fill_pro_galleries(doc, galleries)
    doc = sharpen_prerendered(doc)
    doc = add_skip_button(doc)

    # Swap blurred gallery placeholders for full-size images.
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
            convert(page, variant, os.path.join(d, page + ".html"),
                    os.path.join(d.rstrip("/") + "_data", page + ".json"))
    with open(MANIFEST, "w") as f:
        json.dump(dict(sorted(downloaded.items())), f, indent=0)
    print(f"{len(downloaded)} assets in manifest")


if __name__ == "__main__":
    main()
