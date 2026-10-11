// Replaces the bits of Wix's runtime this site relies on: the desktop/mobile
// page switch, slideshow galleries, image zoom, pro-gallery sliders and
// fullscreen view, video players, and carousels.
(function () {
  var meta = document.querySelector('meta[name="site-variant"]');
  var variant = meta.getAttribute('content');
  var isMobile = /Mobi|Android|iPhone|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if ((variant === 'mobile') !== isMobile && !/[?&]view=/.test(location.search)) {
    location.replace(meta.getAttribute('data-alt') + location.hash);
  }

  function initGallery(gallery) {
    var ghosts = gallery.querySelectorAll('[data-testid="gallery-item-ghost"]');
    var stage = gallery.querySelector('[data-testid="slide-show-gallery-items"]');
    var counter = gallery.querySelector('[data-testid="gallery-counter"]');
    if (!ghosts.length || !stage) return;
    var current = 0;
    zoomSets.push(ghosts);

    function show(i) {
      current = (i + ghosts.length) % ghosts.length;
      var item = ghosts[current].cloneNode(true);
      item.setAttribute('data-testid', 'gallery-item-item');
      stage.innerHTML = '';
      stage.appendChild(item);
      if (counter) counter.textContent = (current + 1) + '/' + ghosts.length;
    }

    var prev = gallery.querySelector('[data-testid="gallery-prevButton"]');
    var next = gallery.querySelector('[data-testid="gallery-nextButton"]');
    if (prev) prev.addEventListener('click', function () { show(current - 1); });
    if (next) next.addEventListener('click', function () { show(current + 1); });
    stage.addEventListener('click', function (e) {
      if (e.target.closest('[data-testid="gallery-item-click-action-image-zoom"]')) openZoom(ghosts, current);
    });
    // Enter or Space on the focused slide opens the zoom too.
    stage.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-testid="gallery-item-click-action-image-zoom"]')) {
        e.preventDefault();
        openZoom(ghosts, current);
      }
    });
    show(0);
  }

  function itemData(ghost) {
    var img = ghost.querySelector('img');
    var title = ghost.querySelector('[data-testid="gallery-item-title"]');
    var desc = ghost.querySelector('[data-testid="gallery-item-description"]');
    return { src: img && img.getAttribute('src'), alt: img && img.alt,
             title: title ? title.textContent : '', desc: desc ? desc.textContent : '' };
  }

  // Every slideshow's slides, for ?lightbox=<item id> links and history moves.
  var zoomSets = [];
  var zoom = null;

  function lightboxParam() { return new URLSearchParams(location.search).get('lightbox'); }
  function lightboxItem(id) {
    for (var k = 0; k < zoomSets.length; k++) {
      for (var j = 0; j < zoomSets[k].length; j++) {
        if (zoomSets[k][j].getAttribute('data-item-id') === id) return { ghosts: zoomSets[k], index: j };
      }
    }
    return null;
  }
  // Wix pushes a history entry with ?lightbox=<item id> for every item shown
  // and one without it when the zoom closes.
  function pushLightbox(id) {
    var url = new URL(location.href);
    if (id) url.searchParams.set('lightbox', id); else url.searchParams.delete('lightbox');
    var next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
  }

  // Wix's zoom scroll lock: the body is fixed and the site shifted up by the
  // scroll offset (so the page stays put behind the overlay), then restored.
  var zoomScroll = 0;
  function lockZoomScroll(on) {
    var site = document.getElementById('SITE_CONTAINER');
    if (on) {
      zoomScroll = window.scrollY;
      document.body.classList.add('siteScrollingBlocked');
      if (site) site.style.marginTop = 'calc(-' + zoomScroll + 'px)';
    } else {
      document.body.classList.remove('siteScrollingBlocked');
      if (site) site.style.removeProperty('margin-top');
      window.scrollTo(0, zoomScroll);
    }
  }

  // The focusable slide currently shown in a slideshow.
  function shownSlide(ghosts) {
    var gallery = ghosts[0].closest('[data-testid="slide-show-gallery"]');
    return gallery && gallery.querySelector('[data-testid="gallery-item-item"] [data-testid="gallery-item-click-action-image-zoom"]');
  }

  function openZoom(ghosts, start, fromHistory) {
    if (zoom) zoom.close(true);
    if (variant === 'mobile') return openTouchZoom(ghosts, start, fromHistory);
    var i = start;
    // Wix sizes the image to fit 120px from the sides and leaves 143px for
    // padding and caption (at least 15px above), never upscaling.
    var box = document.createElement('div');
    box.className = 'site-zoom site-zoom--sized';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.tabIndex = 0;
    box.innerHTML =
      '<figure class="site-zoom__figure"><img alt=""><figcaption>' +
      '<div class="site-zoom__title"></div><div class="site-zoom__desc"></div></figcaption></figure>' +
      '<button class="site-zoom__close" aria-label="close"><svg viewBox="0 0 180 180" width="18" height="18">' +
      '<path d="M5 5 L175 175 M175 5 L5 175"/></svg></button>' +
      '<button class="site-zoom__nav site-zoom__next" aria-label="next"><svg viewBox="0 0 180 310" width="18" height="31">' +
      '<path d="M10 10 L170 161 M170 150 L10 300"/></svg></button>' +
      '<button class="site-zoom__nav site-zoom__prev" aria-label="previous"><svg viewBox="0 0 180 310" width="18" height="31">' +
      '<path d="M170 10 L10 161 M10 150 L170 300"/></svg></button>';
    var img = box.querySelector('img');
    var figure = box.querySelector('figure');
    var closeButton = box.querySelector('.site-zoom__close');

    function layout() {
      var info = JSON.parse(ghosts[i].querySelector('[data-image-info]').getAttribute('data-image-info')).imageData;
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var s = Math.min((vw - 240) / info.width, (vh - 173) / info.height, 1);
      var w = Math.round(info.width * s), h = Math.round(info.height * s);
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      figure.style.width = w + 'px';
      figure.style.marginTop = Math.round((vh - h - 143) / 2) + 'px';
    }
    function render() {
      var d = itemData(ghosts[i]);
      img.src = d.src;
      img.alt = d.alt || '';
      box.querySelector('.site-zoom__title').textContent = d.title;
      box.querySelector('.site-zoom__desc').textContent = d.desc;
      layout();
    }
    // As on Wix, a step fades the picture out (0.5s), swaps it, then fades
    // the new one in.
    var swapTimer = 0;
    function go(step) {
      i = (i + step + ghosts.length) % ghosts.length;
      pushLightbox(ghosts[i].getAttribute('data-item-id'));
      figure.style.opacity = 0;
      clearTimeout(swapTimer);
      swapTimer = setTimeout(function () {
        render();
        var show = function () { figure.style.opacity = 1; };
        if (img.decode) img.decode().then(show, show); else show();
      }, 550);
    }
    function close(quiet) {
      clearTimeout(swapTimer);
      window.removeEventListener('resize', layout);
      box.remove();
      lockZoomScroll(false);
      zoom = null;
      if (!quiet) pushLightbox(null);
      var slide = shownSlide(ghosts);
      if (slide) slide.focus({ preventScroll: true });
    }

    // Keys as on Wix: the arrows step while focus is in the zoom, Escape only
    // closes from the close button, and Enter/Space don't press the controls.
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape' && e.target === closeButton) close();
      else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) e.preventDefault();
    });
    box.addEventListener('keyup', function (e) {
      if (e.key === ' ' && e.target.closest('button')) e.preventDefault();
    });
    closeButton.addEventListener('click', function () { close(); });
    box.querySelector('.site-zoom__prev').addEventListener('click', function () { go(-1); });
    box.querySelector('.site-zoom__next').addEventListener('click', function () { go(1); });
    window.addEventListener('resize', layout);
    if (ghosts.length < 2) box.classList.add('site-zoom--single');
    lockZoomScroll(true);
    document.body.appendChild(box);
    render();
    if (!fromHistory) pushLightbox(ghosts[i].getAttribute('data-item-id'));
    box.focus({ preventScroll: true });
    zoom = { close: close, ghosts: ghosts, show: function (j) { i = j; render(); } };
  }

  // Mobile: Wix's full-screen touch zoom (its markup and classes; the styles
  // are in site.css). Black page, image fitted to the screen, title over a
  // gradient at the bottom, the outer thirds step, a swipe of over 100px in
  // under 500ms steps too; no keyboard handling. Each step fades the image out
  // (.5s), swaps it after 250ms and fades it back in once loaded.
  function openTouchZoom(ghosts, start, fromHistory) {
    var i = start, step = 0;
    var box = document.createElement('div');
    box.className = 'imageZoomComp c8MB3Z zwdzEv';
    box.id = 'imageZoomComp';
    box.setAttribute('data-testid', 'container');
    var arrow = '<svg viewBox="0 0 180 310" class="EAex_q" tabindex="0" role="button" aria-label="';
    box.innerHTML =
      '<div class="UOelX6 vkDW7n"><wow-image id="img_imageZoomComp" class="Qh0lWW "><img alt=""></wow-image></div>' +
      '<div class="BNGB3e" data-testid="close"><svg viewBox="0 0 180 180" class="MyPUn_" tabindex="0" role="button" ' +
      'aria-label="close" data-testid="closeIcon"><path d="M5 5 L175 175 M175 5 L5 175"></path></svg></div>' +
      '<div class="IUNMZY" data-testid="next">' + arrow + 'next" data-testid="nextIcon">' +
      '<path d="M10 10 L170 161 M170 150 L10 300"></path></svg></div>' +
      '<div class="tVi4X8" data-testid="prev">' + arrow + 'previous" data-testid="prevIcon">' +
      '<path d="M170 10 L10 161 M10 150 L170 300"></path></svg></div>';
    var wrap = box.firstChild, pic = wrap.firstChild, img = pic.firstChild;
    var caption = null;

    function info() {
      return JSON.parse(ghosts[i].querySelector('[data-image-info]').getAttribute('data-image-info')).imageData;
    }
    function layout() {
      var d = info();
      img.style.cssText = 'width: ' + Math.min(box.clientWidth, d.width) + 'px; height: ' +
        Math.min(box.clientHeight, d.height) + 'px; object-fit: contain; object-position: center center;';
    }
    function setItem() {
      var d = info();
      wrap.setAttribute('data-testselectedimageindex', i);
      wrap.style.cssText = 'max-height: ' + d.height + 'px; max-width: ' + d.width + 'px;';
      pic.style.setProperty('--wix-img-max-width', 'max(' + d.width + 'px, 100%)');
      layout();
    }
    function setImage(token) {
      img.onload = function () { if (token === step) reveal(); };
      img.src = itemData(ghosts[i]).src;
      if (img.complete && img.naturalWidth) reveal();
    }
    function reveal() {
      img.onload = null;
      void wrap.offsetWidth;  // fade in even when the image is already loaded
      wrap.classList.remove('vkDW7n');
      var title = itemData(ghosts[i]).title;
      if (caption || !title) return;
      caption = document.createElement('div');
      caption.className = 'VVx1CG';
      caption.innerHTML = '<p itemprop="name" class="Tnsweu"></p>';
      caption.firstChild.textContent = title;
      wrap.after(caption);
    }
    function show(j) {
      var token = ++step;
      i = (j + ghosts.length) % ghosts.length;
      if (caption) { caption.remove(); caption = null; }
      wrap.classList.add('vkDW7n');
      setTimeout(function () {
        if (token !== step) return;
        setItem();
        setTimeout(function () { if (token === step) setImage(token); }, 250);
      }, 250);
    }
    function go(d) {
      show(i + d);
      pushLightbox(ghosts[i].getAttribute('data-item-id'));
    }
    function close(quiet) {
      step++;
      window.removeEventListener('resize', layout);
      box.remove();
      lockZoomScroll(false);
      zoom = null;
      if (!quiet) pushLightbox(null);
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }

    box.querySelector('[data-testid="close"]').addEventListener('click', function () { close(); });
    box.querySelector('[data-testid="next"]').addEventListener('click', function () { go(1); });
    box.querySelector('[data-testid="prev"]').addEventListener('click', function () { go(-1); });
    var touch = null;
    box.addEventListener('touchstart', function (e) {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, t: e.timeStamp } : null;
    }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (!touch) return;
      var dx = e.changedTouches[0].clientX - touch.x;
      if (Math.abs(dx) > 100 && e.timeStamp - touch.t < 500) go(dx < 0 ? 1 : -1);
      touch = null;
    });
    window.addEventListener('resize', layout);
    lockZoomScroll(true);
    (document.getElementById('main_MF') || document.body).appendChild(box);
    setItem();
    setImage(step);
    if (!fromHistory) pushLightbox(ghosts[i].getAttribute('data-item-id'));
    zoom = { close: close, ghosts: ghosts, show: show };
  }

  // Back/forward between zoom entries shows that item, or closes the zoom.
  window.addEventListener('popstate', function () {
    var id = lightboxParam(), hit = id && lightboxItem(id);
    if (!hit) { if (zoom) zoom.close(true); return; }
    if (zoom && zoom.ghosts === hit.ghosts) zoom.show(hit.index);
    else openZoom(hit.ghosts, hit.index, true);
  });

  // Wix lays out dropdown menus at runtime: labels are centred in the item's
  // height and the "More" overflow item is hidden when every item fits.
  // Each item gets its measured width rounded up, as Wix sets it inline.
  function initMenu(menu) {
    var items = menu.querySelectorAll('li:not([data-index="__more__"])');
    function size() {
      [].forEach.call(items, function (li) { li.removeAttribute('style'); });
      var widths = [].map.call(items, function (li) { return Math.ceil(li.getBoundingClientRect().width); });
      [].forEach.call(items, function (li, k) {
        var h = li.clientHeight;
        if (!h) return;
        li.style.cssText = 'width: ' + widths[k] + 'px; height: ' + h + 'px; position: relative; box-sizing: border-box; ' +
          'overflow: visible; visibility: inherit;';
        var label = li.querySelector('p');
        if (label) label.style.lineHeight = h + 'px';
      });
    }
    [].forEach.call(items, function (li) { li.setAttribute('aria-hidden', 'false'); });
    size();
    if (document.fonts) document.fonts.ready.then(size);
    var more = menu.querySelector('li[data-index="__more__"]');
    var drop = menu.querySelector('[id$="moreContainer"]');
    if (more && drop && !drop.children.length) {
      // Out of flow, so the visible items right-align within the menu like on Wix.
      more.setAttribute('aria-hidden', 'true');
      more.style.cssText = 'height: 0px; overflow: hidden; position: absolute; visibility: hidden;';
      var moreLabel = more.querySelector('p');
      if (moreLabel) moreLabel.setAttribute('tabindex', '-1');
    }
  }

  // Wix's keyboard mode: Tab turns the focus rings on (and pro-galleries'
  // "accessible" styles); a mouse press turns the rings off until the next Tab.
  function initFocusMode() {
    var site = document.getElementById('SITE_CONTAINER');
    if (!site) return;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      site.classList.add('focus-ring-active', 'keyboard-tabbing-on');
      [].forEach.call(document.querySelectorAll('div.pro-gallery.inline-styles:not(.accessible)'), function (g) {
        g.className = g.className.replace(/ (ltr|rtl) /, ' accessible  $1 ');
      });
    });
    document.addEventListener('mousedown', function () { site.classList.remove('keyboard-tabbing-on'); }, true);
  }

  // Wix's scroll lock: Wix's own CSS fixes the body in place and offsets the
  // site by the saved scroll position; restore that position when unlocking.
  var blockedAt = 0;
  function blockScroll(on) {
    var body = document.body;
    if (on === body.classList.contains('blockSiteScrolling')) return;
    if (on) {
      blockedAt = window.scrollY;
      body.style.setProperty('--blocked-site-scroll-margin-top', blockedAt + 'px');
      body.classList.add('blockSiteScrolling');
    } else {
      body.classList.remove('blockSiteScrolling');
      body.style.removeProperty('--blocked-site-scroll-margin-top');
      if (!body.getAttribute('style')) body.removeAttribute('style');
      window.scrollTo(0, blockedAt);
    }
  }

  // Image-button tooltip: Wix shows the button's label in a black
  // box above it 2s after the pointer enters (or it gets focus) and removes it
  // as soon as the pointer leaves (or focus moves away).
  function initTooltip(root) {
    var link = root.querySelector('a, [role="button"]');
    var slot = root.querySelector('[data-testid="linkImageContainer"]');
    var label = link && link.getAttribute('aria-label');
    if (!slot || !label) return;
    var timer = null, tip = null;
    function show() {
      timer = null;
      tip = document.createElement('div');
      tip.id = root.getAttribute('aria-describedby') || '';
      tip.className = 'X2JC73';
      tip.innerHTML = '<div role="tooltip" class="IyPPl_" data-testid="imageButtonTooltip" style="top: 0px;">' +
        '<span></span><span class="SRjxKM"></span></div>';
      tip.firstChild.firstChild.textContent = label;
      slot.insertBefore(tip, slot.firstChild);
      tip.firstChild.style.top = -(tip.firstChild.offsetHeight + 8) + 'px';
    }
    function start() { if (!timer && !tip) timer = setTimeout(show, 2000); }
    function stop() {
      clearTimeout(timer);
      timer = null;
      if (tip) { tip.remove(); tip = null; }
    }
    root.addEventListener('mouseenter', start);
    root.addEventListener('mouseleave', stop);
    link.addEventListener('focus', start);
    link.addEventListener('blur', stop);
  }

  // Wix's animated scroll: easeInOutSine over a duration that grows with the
  // distance (Wix's desktop/mobile tables, seconds by pixels); a wheel or
  // touch move aborts it.
  var SCROLL_TIMES = {
    desktop: [[0, .6], [360, .8], [720, 1], [1440, 1.2], [7200, 2.8], [9600, 3], [1e4, 3]],
    mobile: [[0, .5], [360, .7], [720, .9], [1440, 1.1], [7200, 2.7], [9600, 2.9], [1e4, 2.9]]
  };
  function scrollDuration(distance) {
    var t = SCROLL_TIMES[variant === 'mobile' ? 'mobile' : 'desktop'], k = 0;
    while (k < t.length - 2 && distance > t[k + 1][0]) k++;
    return 1000 * ((t[k + 1][1] - t[k][1]) / (t[k + 1][0] - t[k][0]) * (distance - t[k][0]) + t[k][1]);
  }
  function animatedScrollTo(target, done) {
    var from = window.scrollY, duration = scrollDuration(Math.abs(target - from)), start = performance.now();
    var aborted = false;
    function listen(on) {
      var method = on ? 'addEventListener' : 'removeEventListener';
      window[method]('wheel', abort, { passive: true });
      window[method]('touchmove', abort, { passive: true });
    }
    function abort() {
      aborted = true;
      listen(false);
    }
    listen(true);
    requestAnimationFrame(function step(now) {
      if (aborted) return;
      var elapsed = now - start, p = Math.min(elapsed / duration, 1);
      window.scrollTo(0, from + -(Math.cos(Math.PI * p) - 1) / 2 * (target - from));
      if (elapsed < duration) return requestAnimationFrame(step);
      window.scrollTo(0, target);
      listen(false);
      done();
    });
  }
  function docTop(el) {
    return el.getBoundingClientRect().top - document.body.getBoundingClientRect().top;
  }

  // Same-page anchor links (and Wix's "Up" button) scroll with Wix's animation,
  // then focus the target (the page's first section for "Up"), labelled
  // "main content" as Wix does.
  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-anchor]');
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = a.getAttribute('href') || '';
      var top = a.getAttribute('data-anchor') === 'SCROLL_TO_TOP';
      var target = top ? document.getElementById('SCROLL_TO_TOP')
        : document.getElementById(a.getAttribute('data-anchor-comp-id') || '') ||
          (href.charAt(0) === '#' && document.getElementById(decodeURIComponent(href.slice(1))));
      if (!target) return;
      e.preventDefault();
      // Wix starts two frames after the click, measuring the target then.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          animatedScrollTo(docTop(target), function () {
            var y = docTop(target);
            if (Math.abs(window.scrollY - y) > .5) window.scrollTo(0, y);
            var focus = top && document.querySelector('main section') || target;
            focus.setAttribute('tabindex', '-1');
            focus.setAttribute('aria-label', 'main content');
            focus.focus({ preventScroll: true });
          });
        });
      });
    });
  }

  // Wix's "Skip to Main Content" button focuses the page content.
  function initSkip(button) {
    button.addEventListener('click', function () {
      var main = document.querySelector('[data-main-content]') ||
        document.querySelector('[data-main-content-parent]>section:first-of-type');
      if (main) main.focus();
    });
  }

  // Mobile hamburger ("tiny menu"): Wix renders the open menu from the hidden
  // SEO link list into the full-screen overlay when the button is pressed.
  function initTinyMenu(nav) {
    var button = nav.querySelector('[data-testid="tinymenu-menubutton"]');
    var slot = nav.querySelector('.wnBX6j');
    var links = nav.querySelectorAll('[data-testid="tinymenu-seolist-item"] a');
    if (!button || !slot || !links.length) return;
    var here = location.pathname.replace(/index\.html$/, '');

    function open() {
      var list = '<div class="pu1NwP"><ul id="menuItems' + nav.id + '" class="S6He1V vlrgcZ c1Ehg0">';
      [].forEach.call(links, function (a, i) {
        var selected = new URL(a.getAttribute('href'), location.href).pathname === here;
        list += '<li class="EFQsWg" data-testid="tinymenu-item-' + i + (selected ? '-selected' : '') + '">' +
          '<a data-testid="linkElement" href="' + a.getAttribute('href') + '" target="_self" class="S60BpP' +
          (selected ? ' xWu3lt' : '') + '">' + a.textContent + '</a></li>';
      });
      slot.innerHTML = list + '</ul></div>';
      nav.classList.add('kgNViD');
      button.setAttribute('aria-expanded', 'true');
      button.querySelector('svg').setAttribute('preserveAspectRatio', '');
      blockScroll(true);
    }
    function close() {
      slot.innerHTML = '';
      nav.classList.remove('kgNViD');
      button.setAttribute('aria-expanded', 'false');
      button.querySelector('svg').setAttribute('preserveAspectRatio', 'none');
      blockScroll(false);
    }
    button.addEventListener('click', function () {
      if (nav.classList.contains('kgNViD')) close(); else open();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('kgNViD')) close();
    });
  }

  // Video player: the cover (poster + play button) is swapped for Wix's
  // Playable control bar (markup and classes below, styled by the page CSS)
  // driven by the video element; touch devices keep the native controls.
  var PLAYER_HTML = '<div data-player-name="Playable" data-testid="playable" class="@@VP@@__playerContainer" aria-label="Your Video Title Video Player"><div data-playable-hook="player-container" dir="ltr" data-playable-dir="ltr" class="zOCV0a T19tts"><div class="upGNDJ" data-playable-component=""></div><div class="KE_jFc lJAVgj QGS4E_" data-playable-hook="screen-block" data-playable-component=""><video playsinline="true"></video></div><div class="nD83ou" data-playable-component=""><div class="i466Wq"><div class="zCT2p8" data-playable-component=""><div class="chEfQZ TJLRFP" role="tooltip"><div class="b3332a" data-playable-hook="tooltip-inner">Mute</div></div></div></div><div data-playable-hook="bottom-block" class="h6tO2q KeMNgX n4zOLX dGEJNK"><div class="e0gLfY" data-playable-hook="screen-bottom-background"></div><div class="DeVBBk" data-playable-hook="progress-bar-container"><div data-playable-hook="progress-control" class="zkN8A4"><div class="F937Xv"><div class="n9U43a gSxZz0"></div><div data-playable-hook="progress-buffered" class="n9U43a qvWDEb"></div><div data-playable-hook="progress-seek-to" class="n9U43a CBrvgf wix-playable--progress-seek-to"></div><div data-playable-hook="progress-played" class="n9U43a HWlKFg wix-playable--progress-played"></div></div><div data-playable-hook="progress-hitbox" class="If2iq7"></div><div data-playable-hook="progress-seek-button" class="gXgLSk"><div class="NJb7BF wix-playable--progress-seek-btn"></div></div></div></div><div class="klgBC8"><div class="eCyqCF" data-playable-hook="controls-container-left"><div class="CQHhb9" data-playable-hook="play-container"><div class="G6YQoM" data-playable-hook="playback-control" data-playable-is-playing="true"><button class="DrDrQb Dgk9zI" data-playable-hook="playback-control" aria-label="Pause" type="button"><div class="kBerBD"><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" class="f9lBoW" width="100%"><path class="wix-playable--play-svg-fill" d="M8 6v14l10.25-7.18L8 6z"></path></svg><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" class="ynsnWE" width="100%"><path class="wix-playable--play-svg-fill" d="M10 7v21l16-11L10 7z"></path></svg></div><div class="dMFut_"><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" class="f9lBoW" width="100%"><path class="wix-playable--play-svg-fill" d="M15 6h3v14h-3V6zM8 6h3v14H8V6z"></path></svg><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" class="ynsnWE" width="100%"><path class="wix-playable--play-svg-fill" d="M10 7h5v21h-5V7zm10 0h5v21h-5V7z"></path></svg></div></button></div></div><div class="hcWOJc" data-playable-hook="volume-container"><div class="rposrv" data-playable-hook="volume-control" data-playable-is-muted="false"><button class="AC5beo YHoSg4 sBQrEF" data-playable-hook="mute-button" aria-label="Mute" type="button"><div class="TpPqAj WFWwGW"><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" class="zX3rZk" width="100%"><path fill-rule="evenodd" class="wix-playable--volume-svg-fill" d="M 18.5 14.0476 L 16.154 16.3936 L 15.372 15.6116 L 17.718 13.2656 L 15.372 10.9196 L 16.154 10.1376 L 18.5 12.4836 L 20.846 10.1376 L 21.628 10.9196 L 19.282 13.2656 L 21.628 15.6116 L 20.846 16.3936 L 18.5 14.0476 Z M 7 9.76563 L 13 5.76563 L 13 19.7656 L 7 15.7656 L 4 15.7656 L 4 9.76563 L 7 9.76563 Z"></path></svg><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" class="Llxf2g" width="100%"><path fill-rule="evenodd" class="wix-playable--volume-svg-fill" d="M23.586 18.04l-2.829-2.828 1.415-1.415L25 16.626l2.828-2.83 1.415 1.416-2.829 2.828 2.829 2.828-1.415 1.415L25 19.453l-2.828 2.83-1.415-1.415 2.829-2.828zM9 13.04l7-5v19l-7-5H5v-9h4z"></path></svg></div><div class="_AY9eW"><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" class="zX3rZk" width="100%"><path fill-rule="evenodd" class="wix-playable--volume-svg-fill" d="M 7 9.8025 L 13 5.8025 L 13 19.8025 L 7 15.8025 L 4 15.8025 L 4 9.8025 L 7 9.8025 Z M 17.243 17.4285 L 16.216 16.4025 A 4.548 4.548 0 0 0 16.216 9.9705 L 17.243 8.9435 A 6 6 0 0 1 17.243 17.4285 Z"></path></svg><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" class="Llxf2g" width="100%"><path class="wix-playable--volume-svg-fill" d="M9 13l7-5v19l-7-5H5v-9h4zm12.884 11.407l-1.414-1.414a7.174 7.174 0 000-10.146l1.414-1.414a9.174 9.174 0 010 12.974z" fill-rule="evenodd"></path></svg></div><div class="fVJUwk"><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" class="zX3rZk" width="100%"><path fill-rule="evenodd" class="wix-playable--volume-svg-fill" d="M 7 9.8025 L 13 5.8025 L 13 19.8025 L 7 15.8025 L 4 15.8025 L 4 9.8025 L 7 9.8025 Z M 20.071 20.1975 L 19.047 19.1725 A 8.552 8.552 0 0 0 19.047 7.0795 L 20.071 6.0545 C 23.976 9.9605 23.976 16.2915 20.071 20.1975 Z M 17.243 17.4285 L 16.216 16.4025 A 4.548 4.548 0 0 0 16.216 9.9705 L 17.243 8.9435 A 6 6 0 0 1 17.243 17.4285 Z"></path></svg><svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" class="Llxf2g" width="100%"><path fill-rule="evenodd" class="wix-playable--volume-svg-fill" d="M9 13.04l7-5v19l-7-5H5v-9h4zm16.897 15.794l-1.414-1.414c5.237-5.238 5.237-13.73 0-18.966l1.414-1.414c6.018 6.018 6.018 15.776 0 21.794zm-4.013-4.387l-1.414-1.414a7.174 7.174 0 000-10.146l1.414-1.414a9.174 9.174 0 010 12.974z"></path></svg></div></button><div class="zlb1tU" data-playable-hook="volume-input-block" aria-label="Volume control" aria-valuemin="0" aria-valuemax="100" value="100"><div class="ALyB63 NNEF0d wix-playable--volume-progress-background"></div><div class="ALyB63 ntj3pK wix-playable--volume-progress" data-playable-hook="volume-input"></div></div></div></div><div class="_Jar1y" data-playable-hook="time-container"><div data-playable-hook="time-control" class="Y2IrWm wix-playable--time-text"><span data-playable-hook="current-time-indicator" class="ppKMt5">00:04</span><span data-playable-hook="duration-time-indicator" class="ppKMt5 X9c9dJ">00:45</span></div></div></div><div class="h8pU3d" data-playable-hook="controls-container-right"><div class="WYxGM3" data-playable-hook="picture-in-picture-container"><div class="me1Viv" data-playable-hook="picture-in-picture-control" data-is-picture-in-picture="false"><button class="LVC3T9 oelO2C" data-playable-hook="picture-in-picture-control" aria-label="Play Picture-in-Picture" type="button"><div class="NP8Nag"><svg class="R2Sp_B" xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" width="100%"><g fill-rule="evenodd" class="wix-playable--picture-in-picture-svg-fill"><path d="M11 19H5V6h15v5h-2V8H7v9h4v2z"></path><path d="M13 13h9v8h-9v-8zm2 2v4h5v-4h-5z"></path></g></svg><svg class="uIhFwa" viewbox="0 0 35 35" version="1" xmlns="http://www.w3.org/2000/svg" preserveaspectratio="xMidYMin slice" width="100%"><g fill-rule="evenodd" class="wix-playable--picture-in-picture-svg-fill"><path d="M14 26H5V7h22v7h-2V9H7v15h7v2z"></path><path d="M17 17h12v11H17V17zm2 2v7h8v-7h-8z"></path></g></svg></div><div class="Qj8pk8"><svg class="R2Sp_B" xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" width="100%"><g fill-rule="evenodd" class="wix-playable--picture-in-picture-svg-fill"><path d="M12 19H5V6h15v5h-2V8H7v9h5v2z"></path><path d="M21 15h-7v-2h7v2z"></path><path d="M16 20v-7h-2v7h2z"></path><path d="M21.279 18.95l-1.415 1.414-4.95-4.95L16.329 14l4.95 4.95z"></path></g></svg><svg class="uIhFwa" viewbox="0 0 35 35" version="1" xmlns="http://www.w3.org/2000/svg" preserveaspectratio="xMidYMin slice" width="100%"><g fill-rule="evenodd" class="wix-playable--picture-in-picture-svg-fill"><path d="M17 26H5V7h22v9h-2V9H7v15h10v2z"></path><path d="M28 21h-8v-2h8v2z"></path><path d="M22 27v-8h-2v8h2z"></path><path d="M29 27l-1 1-7-6 2-2 6 7z"></path></g></svg></div></button></div></div><div class="ES2lfl" data-playable-hook="full-screen-container"><div class="Rge5wA" data-playable-hook="full-screen-control"><button class="jcZoTL XqQ0Rk" data-playable-hook="full-screen-button" aria-label="Enter full screen" type="button"><svg class="XnkpkU" xmlns="http://www.w3.org/2000/svg" viewbox="0 0 26 26" preserveaspectratio="xMidYMin slice" width="100%"><path class="wix-playable--full-screen-svg-fill" fill-rule="evenodd" d="M8 16H6v4h4v-2H8v-2zM6 7v3h2V8h2V6H6v1zm14-1h-4v2h2v2h2V6zm-2 12h-2v2h4v-4h-2v2z"></path></svg><svg class="AZEFhQ" xmlns="http://www.w3.org/2000/svg" viewbox="0 0 35 35" preserveaspectratio="xMidYMin slice" width="100%"><path class="wix-playable--full-screen-svg-fill" fill-rule="evenodd" d="M11 28h2v-6H7v2h4v4zm2-21h-2v4H7v2h6V7zm9 6h6v-2h-4V7h-2v6zm2 11h4v-2h-6v6h2v-4z"></path></svg></button></div></div></div></div></div></div></div></div>';

  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    var m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function initVideo(root) {
    var cover = root.querySelector('[data-testid="playable-cover"]');
    if (!cover) return;
    cover.addEventListener('click', function () {
      var src = root.getAttribute('data-video');
      var loop = root.getAttribute('data-loop') === 'true';
      var muted = root.getAttribute('data-muted') === 'true';
      var img = cover.querySelector('img');
      if (/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)) {
        var native = document.createElement('video');
        native.className = 'site-video';
        native.src = src;
        native.controls = true;
        native.playsInline = true;
        native.loop = loop;
        native.muted = muted;
        if (img) native.poster = img.src;
        root.appendChild(native);
        cover.remove();
        native.play();
        return;
      }
      var vp = (root.className.match(/VideoPlayer\d+/) || ['VideoPlayer'])[0];
      var wrap = document.createElement('div');
      wrap.innerHTML = PLAYER_HTML.replace(/@@VP@@/g, vp);
      wrap = wrap.firstChild;
      root.appendChild(wrap);
      cover.remove();
      buildPlayer(root, wrap, src, loop, muted, img && img.src);
    });
  }

  function buildPlayer(root, wrap, src, loop, muted, poster) {
    var $ = function (h) { return wrap.querySelector('[data-playable-hook="' + h + '"]'); };
    var pc = $('player-container'), screen = $('screen-block'), bottom = $('bottom-block');
    var video = wrap.querySelector('video');
    var playBtn = wrap.querySelector('button[data-playable-hook="playback-control"]');
    var playState = wrap.querySelector('div[data-playable-hook="playback-control"]');
    var muteBtn = $('mute-button'), volCtl = $('volume-control'), volBlock = $('volume-input-block');
    var volBar = $('volume-input'), progress = $('progress-control');
    var played = $('progress-played'), buffered = $('progress-buffered');
    var seekTo = $('progress-seek-to'), seekBtn = $('progress-seek-button');
    var cur = $('current-time-indicator'), dur = $('duration-time-indicator');
    var pipBtn = wrap.querySelector('button[data-playable-hook="picture-in-picture-control"]');
    var pipCtl = $('picture-in-picture-control'), fsBtn = $('full-screen-button');
    var tip = wrap.querySelector('[role="tooltip"]'), tipText = tip.firstChild;
    var idle = 0, dragging = null, keyNav = false;

    video.src = src;
    video.loop = loop;
    video.muted = muted;
    video.preload = 'auto';
    if (poster) video.poster = poster;
    pc.tabIndex = 0;
    if (!document.pictureInPictureEnabled) bottom.classList.add('eNEoBr');

    function frac(e, el) {
      var r = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    }
    function showControls() {
      bottom.classList.add('dGEJNK');
      screen.classList.remove('aXrXkB');
      clearTimeout(idle);
      if (!video.paused && !dragging) idle = setTimeout(hideControls, 2000);
    }
    function hideControls() {
      if (video.paused || wrap.querySelector('.AC5beo:hover, .zlb1tU:hover, [data-playable-hook="progress-control"]:hover')) return;
      bottom.classList.remove('dGEJNK');
      screen.classList.add('aXrXkB');
    }
    function updateTime() {
      var d = video.duration || 0, p = d ? video.currentTime / d : 0;
      cur.textContent = fmtTime(video.currentTime);
      dur.textContent = fmtTime(d);
      played.style.transform = 'scaleX(' + p + ')';
      seekBtn.style.transform = 'translateX(' + p * progress.getBoundingClientRect().width + 'px)';
      progress.setAttribute('aria-valuenow', (p * 100).toFixed(2));
      progress.setAttribute('aria-valuetext', 'Already played ' + (p * 100).toFixed(2) + '%');
    }
    function updateBuffer() {
      var d = video.duration, b = video.buffered;
      buffered.style.width = (d && b.length ? b.end(b.length - 1) / d * 100 : 0) + '%';
    }
    function updatePlay() {
      playBtn.classList.toggle('U10_e9', video.paused);
      playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
      playState.setAttribute('data-playable-is-playing', String(!video.paused));
      if (video.paused) showControls();
      else showControls();
    }
    function updateVolume() {
      var m = video.muted || video.volume === 0;
      muteBtn.classList.remove('sBQrEF', 'C4iBa_', 'LSYah9', 'rbNMd9');
      if (m) muteBtn.classList.add('LSYah9', 'rbNMd9');
      else muteBtn.classList.add(video.volume < 0.5 ? 'C4iBa_' : 'sBQrEF');
      muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
      volCtl.setAttribute('data-playable-is-muted', String(m));
      volCtl.setAttribute('data-playable-volume-percent', Math.round(video.volume * 100));
      volBar.style.width = (m ? 0 : video.volume * 100) + '%';
      volBlock.setAttribute('aria-valuenow', Math.round(video.volume * 100));
    }
    function toggle() { if (video.paused) video.play(); else video.pause(); }
    function sizes() {
      var w = pc.getBoundingClientRect().width;
      var s = [280, 300, 350, 400, 550].filter(function (b) { return w <= b; }).join('px ');
      if (s) pc.setAttribute('data-playable-max-width', s + 'px');
      else pc.removeAttribute('data-playable-max-width');
      updateTime();
    }
    function tooltip(btn, text) {
      if (!btn) { tip.classList.remove('D_qOXi'); return; }
      tipText.textContent = text;
      var box = tip.parentNode.getBoundingClientRect(), r = btn.getBoundingClientRect();
      var left = r.left + r.width / 2 - box.left - tip.offsetWidth / 2;
      tip.style.cssText = 'left:' + Math.max(0, Math.min(left, box.width - tip.offsetWidth)) + 'px;top:initial;bottom:0px';
      tip.classList.add('D_qOXi');
    }
    [muteBtn, pipBtn, fsBtn].forEach(function (b) {
      b.addEventListener('mouseenter', function () { tooltip(b, b.getAttribute('aria-label')); });
      b.addEventListener('mouseleave', function () { tooltip(null); });
      b.addEventListener('click', function () { if (b.matches(':hover')) tooltip(b, b.getAttribute('aria-label')); });
    });

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('durationchange', function () { updateTime(); updateBuffer(); });
    video.addEventListener('loadedmetadata', sizes);
    video.addEventListener('progress', updateBuffer);
    video.addEventListener('play', updatePlay);
    video.addEventListener('pause', updatePlay);
    video.addEventListener('volumechange', updateVolume);
    video.addEventListener('click', toggle);
    playBtn.addEventListener('click', toggle);
    muteBtn.addEventListener('click', function () {
      if (video.muted || video.volume === 0) { video.muted = false; if (video.volume === 0) video.volume = 1; }
      else video.muted = true;
    });
    pc.addEventListener('mousemove', showControls);
    pc.addEventListener('touchstart', showControls, { passive: true });
    pc.addEventListener('keydown', function () { keyNav = true; wrap.setAttribute('data-playable-focus-source', 'key'); showControls(); });
    pc.addEventListener('mousedown', function () { keyNav = false; wrap.removeAttribute('data-playable-focus-source'); });
    pc.addEventListener('focusin', function (e) {
      if (keyNav) e.target.classList.add('focus-within');
    });
    pc.addEventListener('focusout', function (e) { e.target.classList.remove('focus-within'); });

    function drag(el, move) {
      el.addEventListener('pointerdown', function (e) {
        dragging = el;
        el.setPointerCapture(e.pointerId);
        move(e);
        e.preventDefault();
      });
      el.addEventListener('pointermove', function (e) { if (dragging === el) move(e); });
      el.addEventListener('pointerup', function () { dragging = null; showControls(); });
    }
    drag(progress, function (e) {
      if (video.duration) video.currentTime = frac(e, progress) * video.duration;
      updateTime();
    });
    progress.addEventListener('mousemove', function (e) { seekTo.style.width = frac(e, progress) * 100 + '%'; });
    progress.addEventListener('mouseleave', function () { seekTo.style.width = '0%'; });
    progress.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
      if (step) { video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + step)); e.preventDefault(); }
    });
    drag(volBlock, function (e) {
      video.muted = false;
      video.volume = frac(e, volBlock);
    });
    volBlock.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.1 : 0;
      if (step) { video.muted = false; video.volume = Math.min(1, Math.max(0, video.volume + step)); e.preventDefault(); }
    });

    fsBtn.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (pc.requestFullscreen) pc.requestFullscreen();
    });
    document.addEventListener('fullscreenchange', function () {
      var on = document.fullscreenElement === pc;
      if (on) pc.setAttribute('data-playable-in-full-screen', 'true');
      else pc.removeAttribute('data-playable-in-full-screen');
      fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
      sizes();
    });
    pipBtn.addEventListener('click', function () {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (video.requestPictureInPicture) video.requestPictureInPicture();
    });
    video.addEventListener('enterpictureinpicture', function () {
      pipCtl.setAttribute('data-is-picture-in-picture', 'true');
      pipBtn.setAttribute('aria-label', 'Exit Picture-in-Picture');
    });
    video.addEventListener('leavepictureinpicture', function () {
      pipCtl.setAttribute('data-is-picture-in-picture', 'false');
      pipBtn.setAttribute('aria-label', 'Play Picture-in-Picture');
    });
    window.addEventListener('resize', sizes);

    updateVolume();
    updateTime();
    sizes();
    video.play();
    updatePlay();
  }

  // Wix pro-gallery slider: the arrows centre the next/previous item with a
  // 400ms transform (as Wix does), then commit the scroll position.
  function initSlider(root) {
    var scroller = root.querySelector('.gallery-horizontal-scroll');
    var next = root.querySelector('[data-hook="nav-arrow-next"]');
    if (!scroller || !next) return;
    var inner = scroller.querySelector('.gallery-horizontal-scroll-inner') || scroller.firstElementChild;
    var items = [].slice.call(scroller.querySelectorAll('[data-hook="item-container"]'));
    var back = next.cloneNode(true);
    back.setAttribute('data-hook', 'nav-arrow-back');
    back.setAttribute('aria-label', 'Previous Item');
    back.style.left = next.style.right;
    back.style.right = '';
    var svg = back.querySelector('svg');
    if (svg) svg.style.transform = 'scaleX(-1) scale(1)';
    next.parentNode.insertBefore(back, next);
    var moving = false;

    function maxScroll() { return scroller.scrollWidth - scroller.clientWidth; }
    // As on Wix: the current item is the last one starting left of the view's
    // centre; Previous hides on the first item or at the start, Next on the
    // last item or at the end.
    function update() {
      var i = current();
      back.style.display = i > 0 && scroller.scrollLeft >= 1 ? '' : 'none';
      next.style.display = i < items.length - 1 && scroller.scrollLeft < maxScroll() - 1 ? '' : 'none';
    }
    function left(item) {
      return item.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    }
    function center(item) {
      return left(item) + item.getBoundingClientRect().width / 2;
    }
    function current() {
      var mid = scroller.scrollLeft + scroller.clientWidth / 2, best = 0;
      items.forEach(function (item, i) { if (left(item) <= mid) best = i; });
      return best;
    }
    function go(step) {
      if (moving || !items.length) return;
      var i = Math.max(0, Math.min(items.length - 1, current() + step));
      var target = Math.round(Math.max(0, Math.min(maxScroll(), center(items[i]) - scroller.clientWidth / 2)));
      var delta = target - scroller.scrollLeft;
      if (!delta) return;
      moving = true;
      scroller.style.scrollSnapType = 'none';
      inner.style.transition = 'transform 400ms cubic-bezier(0.46, 0.1, 0.25, 1)';
      void inner.offsetWidth;
      inner.style.transform = 'translateX(' + -delta + 'px)';
      setTimeout(function () {
        inner.style.transition = 'none';
        inner.style.transform = 'translateX(0px)';
        scroller.scrollLeft = target;
        scroller.style.scrollSnapType = '';
        moving = false;
        update();
      }, 400);
    }
    [[back, -1], [next, 1]].forEach(function (a) {
      a[0].addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        go(a[1]);
      });
    });
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Wix's mobile pro-gallery scales its spacing by 320 / screen width (the
  // server renders for a 320px screen) and re-lays the items out: slider
  // items keep their size inside floor(size + 2 * margin) boxes, stacked grid
  // items grow to fill ceil(size + spacing) steps.
  function mobileScale() {
    if (variant !== 'mobile') return 1;
    var landscape = window.matchMedia && matchMedia('(orientation: landscape)').matches;
    var w = landscape ? Math.max(screen.width, screen.height) : screen.width;
    return w ? 320 / w : 1;
  }
  function px(v) { return parseFloat(v) || 0; }
  function sizeAll(el, sel, w, h) {
    [].forEach.call(el.querySelectorAll(sel), function (e) {
      e.style.width = w + 'px';
      e.style.height = h + 'px';
    });
  }
  function rescaleMobile(root) {
    var r = mobileScale();
    var items = [].slice.call(root.querySelectorAll('[data-hook="item-container"]'));
    // Only Wix Pro Gallery widgets (not the Albums widget) do this.
    if (r === 1 || !items.length || !root.hasAttribute('data-pg-fullscreen')) return;
    var inner = '[data-hook="item-wrapper"], [data-hook="image-item"], [data-hook="gallery-item-image-img"]';
    var parent = root.querySelector('.pro-gallery-parent-container');
    var container = root.querySelector('[id^="pro-gallery-container-"]');
    var scroller = root.querySelector('.gallery-horizontal-scroll');
    if (scroller && parent) {
      var m0 = px(items[0].style.margin), m = m0 * r, W = px(parent.style.width), H = px(parent.style.height);
      var x = 0, h = Math.floor(H + 2 * m) - 2 * m;
      if (!m0) return;
      parent.style.margin = -m + 'px';
      [container, scroller].forEach(function (el) {
        el.style.width = Math.ceil(W + 2 * m) + 'px';
        el.style.height = Math.floor(H + m) + 'px';
      });
      items.forEach(function (it) {
        var outer = Math.floor(px(it.style.width) + 2 * m), group = it.closest('[data-hook="group-view"]');
        if (group) {
          group.style.setProperty('--group-left', x + 'px');
          group.style.setProperty('--group-width', outer + 'px');
        }
        it.style.margin = m + 'px';
        it.style.left = x + 'px';
        it.style.width = outer - 2 * m + 'px';
        it.style.height = h + 'px';
        sizeAll(it, inner, outer - 2 * m, h);
        x += outer;
      });
      [].forEach.call(root.querySelectorAll('[data-hook^="nav-arrow"]'), function (a) {
        a.style.right = px(a.style.right) - m0 + m + 'px';
        a.style.top = 'calc(50% + ' + m / 2 + 'px - ' + px(a.style.height) / 2 + 'px - 0px)';
      });
      return;
    }
    // One-column grid: items stacked with a spacing between them.
    if (items.length < 2 || px(items[1].style.left) !== px(items[0].style.left)) return;
    var gap = px(items[1].style.top) - px(items[0].style.top) - px(items[0].style.height), s = gap * r, y = 0;
    items.forEach(function (it) {
      var step = Math.ceil(px(it.style.height) + s), size = step - s;
      it.style.top = y + 'px';
      it.style.width = size + 'px';
      it.style.height = size + 'px';
      sizeAll(it, inner, size, size);
      y += step;
    });
    if (container) container.style.height = y - s + 'px';
  }

  // Galleries Wix lays out only in the browser (server HTML hides the items):
  // fit the columns to the real width, keeping Wix's gaps and info height.
  function initPrerendered(root) {
    var pre = root.querySelector('.pro-gallery-prerender');
    if (!pre) return;
    var items = [].slice.call(root.querySelectorAll('[data-hook="item-container"]'));
    if (!items.length) return;
    var boxes = items.map(function (it) {
      var wrap = it.querySelector('[data-hook="item-wrapper"]');
      return { left: px(it.style.left), top: px(it.style.top), w: px(it.style.width), h: px(it.style.height),
               img: wrap ? px(wrap.style.height) : px(it.style.height) };
    });
    var cols = boxes.filter(function (b) { return b.top === boxes[0].top; }).length;
    var gap = cols > 1 ? boxes[1].left - boxes[0].left - boxes[0].w : 0;
    var containers = root.querySelectorAll('[id^="pro-gallery-container-"], [id^="pro-gallery-margin-container-"]');
    pre.classList.remove('pro-gallery-prerender');

    function layout() {
      var width = root.clientWidth;
      if (!width) return;
      var w = (width - gap * (cols - 1)) / cols, bottom = 0, rowTop = 0, rowH = 0;
      items.forEach(function (it, i) {
        var b = boxes[i], img = w * boxes[0].img / boxes[0].w, h = img + b.h - b.img;
        if (i && i % cols === 0) { rowTop += rowH + gap; rowH = 0; }
        rowH = Math.max(rowH, h);
        it.style.left = (i % cols) * (w + gap) + 'px';
        it.style.top = rowTop + 'px';
        it.style.width = w + 'px';
        it.style.height = h + 'px';
        it.style.opacity = '1';
        it.style.display = 'block';
        [].forEach.call(it.querySelectorAll('[data-hook="item-wrapper"], [data-hook="image-item"], ' +
            '.item-hover-flex-container, [data-hook^="item-hover-"]'), function (el) {
          el.style.width = w + 'px';
          el.style.height = img + 'px';
        });
        bottom = Math.max(bottom, rowTop + h);
      });
      [].forEach.call(containers, function (c) { c.style.height = bottom + 'px'; });
    }
    layout();
    window.addEventListener('resize', layout);
  }

  // Pro-gallery fullscreen view (Wix's "expand" mode), rebuilt with the class
  // names Wix's per-gallery colour/font rules in the page target.
  var HEART_HOLE = 'M8.1816,5.0039 C7.9276,5.0039 7.6696,5.0279 7.4106,5.0759 C5.7326,5.3909 4.3566,6.8479 4.0646,8.6189 ' +
    'C3.9346,9.4039 4.0036,10.2029 4.2616,10.9319 C4.2636,10.9379 4.2656,10.9439 4.2676,10.9499 C5.1716,13.8579 10.2066,17.4019 ' +
    '11.7286,18.4189 C11.8966,18.5329 12.1076,18.5309 12.2746,18.4189 C13.7956,17.4019 18.8266,13.8589 19.7326,10.9499 ' +
    'C19.9966,10.2029 20.0646,9.4039 19.9356,8.6189 C19.6426,6.8479 18.2666,5.3909 16.5896,5.0759 C14.9596,4.7749 13.3646,5.4459 ' +
    '12.4126,6.8369 C12.2256,7.1099 11.7736,7.1099 11.5876,6.8369 C10.7866,5.6669 9.5276,5.0039 8.1816,5.0039 ';
  var HEART_FILLED = 'M12.0016,19.5029 C11.7136,19.5029 11.4246,19.4189 11.1726,19.2509 C9.1366,17.8899 4.2966,14.3869 ' +
    '3.3156,11.2559 C3.0036,10.3719 2.9216,9.4039 3.0776,8.4569 C3.4436,6.2429 5.1106,4.4889 7.2266,4.0939 C9.0226,3.7539 ' +
    '10.8006,4.3809 11.9996,5.7409 C13.1996,4.3829 14.9766,3.7569 16.7736,4.0939 C18.8896,4.4899 20.5566,6.2429 20.9216,8.4569 ' +
    'C21.0786,9.4069 20.9956,10.3789 20.6816,11.2659 C19.7116,14.3819 14.8676,17.8889 12.8306,19.2509 C12.5786,19.4189 ' +
    '12.2896,19.5029 12.0016,19.5029';
  var ARROW_SVG = '<svg fill="currentColor" stroke="none" width="15" height="27" viewBox="0 0 15 27"><path fill-rule="nonzero" ' +
    'd="M.198 25.926l1.06 1.06 13.259-13.258L1.258.47.198 1.53l12.197 12.198z"></path></svg>';
  var LOVES_KEY = 'site-pg-loves';
  var pageTitle = document.title;

  function storedLoves() {
    try { return JSON.parse(localStorage.getItem(LOVES_KEY)) || {}; } catch (e) { return {}; }
  }
  function setUrl(pgid) {
    var url = new URL(location.href);
    if (pgid) url.searchParams.set('pgid', pgid); else url.searchParams.delete('pgid');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  function openFullscreen(root, start) {
    var items = [].slice.call(root.querySelectorAll('[data-hook="item-container"][data-full]'));
    if (!items[start]) return;
    var comp = root.id.replace(/^pro-gallery-/, '');
    var mobile = variant === 'mobile';
    var side = root.getAttribute('data-pg-info') === 'side';
    var openedPgid = new URLSearchParams(location.search).get('pgid');
    var index = start;
    var love = '<span class="fullscreen-social-love-container"><button class="fullscreen-social-love' +
      (mobile ? '' : ' fullscreen-icon') + ' has-custom-focus" role="checkbox" aria-checked="false" title="Love">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fill-rule="evenodd"></path></svg>' +
      '</button><i class="fullscreen-social-love-count"></i></span>';
    // Art Store viewers also show Cart and Share icons (inert here) before the heart.
    var store = side && !mobile;
    var storeIcons = store
      ? '<span class="fullscreen-icon fullscreen-cart-icon has-custom-focus" title="Cart" aria-label="Cart" tabindex="0">' +
        '<button tabindex="-1"><svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18.7529,17.5742 C18.7159,17.8162 18.5039,18.0002 18.2589,18.0002 L5.7409,18.0002 C5.4959,18.0002 5.2839,17.8162 5.2469,17.5742 L4.0029,9.2872 C3.9879,9.1882 4.0329,9.1192 4.0609,9.0872 C4.0889,9.0542 4.1499,9.0002 4.2499,9.0002 L19.7499,9.0002 C19.8499,9.0002 19.9109,9.0542 19.9399,9.0872 C19.9669,9.1192 20.0119,9.1882 19.9969,9.2872 L18.7529,17.5742 Z M8.9999,7.9982 C8.9999,6.3452 10.3459,5.0002 11.9999,5.0002 C13.6539,5.0002 14.9999,6.3452 14.9999,7.9982 L14.9999,8.0002 L8.9999,8.0002 L8.9999,7.9982 Z M20.6969,8.4342 C20.4589,8.1582 20.1139,8.0002 19.7499,8.0002 L15.9999,8.0002 L15.9999,7.9982 C15.9999,5.7942 14.2059,4.0002 11.9999,4.0002 C9.7949,4.0002 7.9999,5.7942 7.9999,7.9982 L7.9999,8.0002 L4.2499,8.0002 C3.8859,8.0002 3.5409,8.1582 3.3029,8.4342 C3.0649,8.7102 2.9599,9.0752 3.0139,9.4352 L4.2579,17.7222 C4.3679,18.4512 5.0049,19.0002 5.7409,19.0002 L18.2589,19.0002 C18.9949,19.0002 19.6319,18.4512 19.7419,17.7222 L20.9859,9.4352 C21.0399,9.0752 20.9349,8.7102 20.6969,8.4342 L20.6969,8.4342 Z" ' +
        'fill-rule="evenodd"></path></svg></button></span><div class="fullscreen-icon fullscreen-social-share-box pro-fullscreen-store ">' +
        '<button class="fullscreen-social-share-icon has-custom-focus" tabindex="0" title="Share" aria-haspopup="menu" ' +
        'aria-pressed="false">' + SHARE_SVG + '</button></div>'
      : '';
    var bar = mobile
      ? '<div class="fullscreen-mobile-bar site-pgfs__bar"><button class="fullscreen-close progallery-svg-font-icons-back" ' +
        'aria-label="Exit expand mode"></button><div class="fullscreen-social">' + love + '</div></div>'
      : '<div class="site-pgfs__bar"><div class="fullscreen-social"><button class="fullscreen-icon has-custom-focus fullscreen-expand ' +
        'progallery-svg-font-icons-expand-arrow" title="Open in fullscreen"></button>' + storeIcons + love + '</div>' +
        '<div class="fullscreen-nav"><button class="fullscreen-icon fullscreen-close progallery-svg-font-icons-close-x" ' +
        'aria-label="Exit expand mode"></button></div></div>';
    var info = function (title) {
      return '<div class="site-pgfs__info' + (side && !mobile ? ' fullscreen-side-bar' : '') + '">' +
        '<div class="fullscreen-side-bar-info-container"' + (mobile ? '' : ' tabindex="0"') + '><div class="fullscreen-side-bar-title"><h1>' + title +
        '</h1></div></div></div>';
    };
    var body = mobile
      ? '<div class="site-pgfs__track">' + items.map(function (it) {
          return '<div class="site-pgfs__slide"><img alt=""><div class="site-pgfs__slide-info">' + info('') + '</div></div>';
        }).join('') + '</div>'
      : (side ? '<div class="site-pgfs__stage"></div>' : '<div class="site-pgfs__expand"><div class="site-pgfs__stage"></div></div>') +
        info('') +
        '<button class="fullscreen-icon site-pgfs__arrow site-pgfs__prev" aria-label="Previous Item" tabindex="-1">' + ARROW_SVG + '</button>' +
        '<button class="fullscreen-icon site-pgfs__arrow site-pgfs__next" aria-label="Next Item" tabindex="-1">' + ARROW_SVG + '</button>';
    var host = document.createElement('div');
    host.className = 'fullscreen-comp-wrapper ' + comp + ' site-pgfs-host';
    host.innerHTML = '<div class="pro-fullscreen-wrapper site-pgfs" id="pro-fullscreen-wrapper">' +
      '<div id="fullscreen-view" data-hook="fullscreen-view" class="fullscreen pro-fullscreen pro-fullscreen-inline-styles ' +
      'inline-styles pro-fullscreen-v2 fullscreen-bright site-pgfs__view' + (mobile ? ' site-pgfs--mobile' : '') +
      (side ? ' site-pgfs--side' : '') + '" role="dialog" aria-modal="true" tabindex="-1" ' +
      'aria-label="Gallery item, detailed view">' + bar + body +
      '<div tabindex="0" aria-label="Gallery item, detailed view"></div></div></div>';
    var wrapper = host.firstChild, view = wrapper.firstChild;
    var loveBtn = view.querySelector('.fullscreen-social-love');
    var count = view.querySelector('.fullscreen-social-love-count');
    var expand = view.querySelector('.fullscreen-expand');
    var track = view.querySelector('.site-pgfs__track');
    var stage = view.querySelector('.site-pgfs__stage');
    var prev = view.querySelector('.site-pgfs__prev');
    var nextBtn = view.querySelector('.site-pgfs__next');

    function data(i) {
      var img = items[i].querySelector('img');
      return { id: items[i].getAttribute('data-id'), title: items[i].getAttribute('data-title') || '',
               src: items[i].getAttribute('data-full'), alt: img ? img.alt : '',
               w: +items[i].getAttribute('data-w'), h: +items[i].getAttribute('data-h') };
    }
    // Wix fits the image into the stage without ever enlarging it.
    function fit(img, i) {
      var d = data(i), k = Math.min(stage.clientWidth / d.w, stage.clientHeight / d.h, 1);
      img.style.width = d.w * k + 'px';
      img.style.height = d.h * k + 'px';
    }
    function refit() {
      [].forEach.call(stage.querySelectorAll('img'), function (img) { fit(img, +img.getAttribute('data-index')); });
    }
    function renderLove() {
      var loved = !!storedLoves()[data(index).id];
      loveBtn.classList.toggle('pro-gallery-loved', loved);
      loveBtn.setAttribute('aria-checked', String(loved));
      loveBtn.querySelector('path').setAttribute('d', loved ? HEART_FILLED : HEART_HOLE + HEART_FILLED);
      count.textContent = loved ? '1' : '';
    }
    // Wix keeps ?pgid=<gallery>-<item> and "<item> | <page>" while an item is open.
    function select(i) {
      index = i;
      var d = data(i);
      setUrl(comp.replace(/^comp-/, '') + '-' + d.id);
      document.title = (d.title ? d.title + ' | ' : '') + pageTitle.split(' | ')[0];
      renderLove();
      if (prev) {
        prev.style.display = i > 0 ? '' : 'none';
        nextBtn.style.display = i < items.length - 1 ? '' : 'none';
      }
    }
    function show(i, fade) {
      if (i < 0 || i >= items.length) return;
      var d = data(i), img = document.createElement('img');
      img.alt = d.alt;
      img.src = d.src;
      img.setAttribute('data-index', i);
      if (fade) {
        img.style.opacity = '0';
        img.addEventListener('transitionend', function () {
          [].slice.call(stage.querySelectorAll('img')).forEach(function (old) { if (old !== img) old.remove(); });
        });
      } else {
        stage.innerHTML = '';
      }
      stage.appendChild(img);
      fit(img, i);
      if (fade) { void img.offsetWidth; img.style.opacity = '1'; }
      view.querySelector('.site-pgfs__info h1').textContent = d.title;
      select(i);
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('resize', refit);
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      host.remove();
      blockScroll(false);
      document.title = pageTitle;
      setUrl(openedPgid);  // Wix keeps a deep link's ?pgid= after closing
    }
    function go(step) {
      if (track) track.scrollTo({ left: (index + step) * track.clientWidth, behavior: 'smooth' });
      else show(index + step, true);
    }
    function onKey(e) {
      if (e.key === 'Tab') {  // Wix keeps Tab inside the viewer
        var stops = [].filter.call(view.querySelectorAll('button, [tabindex]'), function (el) {
          return el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null || el === view.lastChild;
        });
        var first = stops[0], last = stops[stops.length - 1];
        if (!view.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        return;
      }
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    function onFullscreen() {
      if (!expand) return;
      var on = !!document.fullscreenElement;
      expand.classList.toggle('progallery-svg-font-icons-expand-arrow', !on);
      expand.classList.toggle('progallery-svg-font-icons-shrink-arrow', on);
      expand.title = on ? 'Exit fullscreen' : 'Open in fullscreen';
    }

    view.querySelector('.fullscreen-close').addEventListener('click', close);
    loveBtn.addEventListener('click', function () {
      var loves = storedLoves(), id = data(index).id;
      if (loves[id]) delete loves[id]; else loves[id] = 1;
      try { localStorage.setItem(LOVES_KEY, JSON.stringify(loves)); } catch (e) { /* not persisted */ }
      renderLove();
    });
    if (expand) {
      expand.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
        else if (host.requestFullscreen) host.requestFullscreen().catch(function () {});
      });
      document.addEventListener('fullscreenchange', onFullscreen);
    }
    if (prev) {
      prev.addEventListener('click', function () { go(-1); });
      nextBtn.addEventListener('click', function () { go(1); });
    }
    document.addEventListener('keydown', onKey);
    if (stage) window.addEventListener('resize', refit);

    blockScroll(true);
    wrapper.style.opacity = '0';
    document.body.appendChild(host);
    if (track) {
      [].forEach.call(track.children, function (slide, i) {
        var d = data(i), img = slide.querySelector('img');
        img.alt = d.alt;
        img.src = d.src;
        img.style.width = d.w + 'px';  // never enlarged; CSS caps it at the screen width
        slide.querySelector('h1').textContent = d.title;
      });
      track.scrollLeft = start * track.clientWidth;
      var settle;
      track.addEventListener('scroll', function () {
        clearTimeout(settle);
        settle = setTimeout(function () {
          var i = Math.round(track.scrollLeft / track.clientWidth);
          if (i !== index) select(i);
        }, 100);
      }, { passive: true });
      select(start);
    } else {
      show(start, false);
    }
    void wrapper.offsetWidth;
    wrapper.style.transition = 'opacity .8s';
    wrapper.style.opacity = '1';
    // Wix focuses the expand button (desktop) or the view (mobile).
    (expand || view).focus();
  }

  // Desktop item hover, as Wix renders it on the first hover and then keeps:
  // a tinted overlay with a love button (Art Store galleries: title, "Buy Now",
  // love and share; album galleries: an empty social row).
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14.5,14 C14.628,14 14.752,14.049 14.845,14.138 C14.944,14.232 15,14.363 15,14.5 L15,17.293 L20.293,12 L15,6.707 L15,9.5 C15,9.633 14.947,9.761 14.853,9.854 C14.759,9.947 14.632,10 14.5,10 C14.494,9.998 14.491,10 14.486,10 C13.667,10 7.407,10.222 4.606,16.837 C7.276,14.751 10.496,13.795 14.188,13.989 C14.324,13.996 14.426,14.001 14.476,14.001 C14.484,14 14.492,14 14.5,14 M3.5,19 C3.414,19 3.328,18.979 3.25,18.933 C3.052,18.819 2.957,18.585 3.019,18.365 C5.304,10.189 11.981,9.145 14,9.017 L14,5.5 C14,5.298 14.122,5.115 14.309,5.038 C14.496,4.963 14.71,5.004 14.854,5.146 L21.354,11.646 C21.549,11.842 21.549,12.158 21.354,12.354 L14.854,18.854 C14.71,18.997 14.495,19.038 14.309,18.962 C14.122,18.885 14,18.702 14,18.5 L14,14.981 C9.957,14.791 6.545,16.102 3.857,18.85 C3.761,18.948 3.631,19 3.5,19" fill-rule="evenodd"></path></svg>';
  var SHARE_NETWORKS = [
    ['facebook', '0 0 8 17', 'M 7.21 0.91C 7.21 1.79 7.21 3.38 7.21 3.38 7.21 3.38 5.38 3.19 4.92 3.89 4.67 4.27 4.82 5.39 4.8 6.19 5.6 6.19 6.42 6.19 7.22 6.19 7.02 7.12 6.87 7.76 6.72 8.57 6.03 8.57 4.79 8.57 4.79 8.57 4.79 8.57 4.79 16.23 4.79 16.23 4.79 16.23 2.5 16.23 1.43 16.23 1.43 13.87 1.43 11.11 1.43 8.6 0.9 8.6 0.52 8.6-0 8.6-0 7.71-0 7.07-0 6.19 0.5 6.19 0.9 6.19 1.41 6.19 1.48 4.42 1.51 2.68 2.39 1.79 3.38 0.79 4.32 0.91 7.21 0.91Z'],
    ['twitter', '0 0 16 13', 'M 15.99 1.6C 15.91 2.19 15.04 2.79 14.51 3.23 15.03 10.77 6.33 15.48 0.01 11.66 1.78 11.67 3.78 11.19 4.83 10.21 3.3 9.96 2.21 9.28 1.79 7.94 2.24 7.9 2.87 8.04 3.17 7.85 1.77 7.33 0.66 6.52 0.59 4.68 1.09 4.73 1.35 5.02 1.97 4.95 1.06 4.38 0.03 2.21 0.96 0.61 2.61 2.4 4.66 3.79 7.87 4.05 7.08 0.72 11.57-1.34 13.59 1.06 14.38 0.89 15.04 0.61 15.71 0.33 15.44 1.09 14.88 1.57 14.33 2.06 14.92 1.95 15.55 1.87 15.99 1.6Z'],
    ['pinterest', '0 0 15 15', 'M 7.5 0.01C 3.36 0.01 0 3.37 0 7.5 0 10.69 1.99 13.4 4.79 14.49 4.74 14.01 4.69 13.04 4.83 12.44 4.97 11.85 5.73 8.65 5.73 8.65 5.73 8.65 5.5 8.19 5.5 7.52 5.5 6.46 6.11 5.66 6.88 5.66 7.53 5.66 7.85 6.15 7.85 6.74 7.85 7.39 7.43 8.37 7.21 9.28 7.03 10.04 7.6 10.66 8.34 10.66 9.7 10.66 10.74 9.23 10.74 7.16 10.74 5.34 9.43 4.06 7.56 4.06 5.38 4.06 4.11 5.69 4.11 7.37 4.11 8.03 4.36 8.73 4.68 9.11 4.74 9.19 4.75 9.25 4.73 9.33 4.67 9.57 4.54 10.09 4.52 10.2 4.48 10.34 4.41 10.37 4.26 10.3 3.31 9.86 2.71 8.46 2.71 7.34 2.71 4.93 4.46 2.72 7.76 2.72 10.4 2.72 12.46 4.61 12.46 7.13 12.46 9.76 10.8 11.88 8.5 11.88 7.73 11.88 7 11.48 6.75 11 6.75 11 6.37 12.46 6.28 12.82 6.12 13.43 5.71 14.19 5.4 14.7 6.07 14.89 6.77 15 7.5 15 11.64 15 14.99 11.64 14.99 7.5 14.99 3.37 11.64 0.01 7.5 0.01Z'],
    ['tumblr', '0 0 8 15', 'M 7.99 6.38C 7.99 6.38 5 6.38 5 6.38 5 6.38 5 10.53 5 10.53 5 11.28 5.09 11.7 6.09 11.7 6.09 11.7 7.99 11.7 7.99 11.7 7.99 11.7 7.99 14.89 7.99 14.89 7.99 14.89 6.99 15 5.89 15 3.3 15 2 13.29 2 11.38 2 11.38 2 6.38 2 6.38 2 6.38 0.01 6.38 0.01 6.38 0.01 6.38 0.01 3.41 0.01 3.41 2.4 3.2 2.6 1.28 2.8 0 2.8 0 5 0 5 0 5 0 5 3.2 5 3.2 5 3.2 7.99 3.2 7.99 3.2 7.99 3.2 7.99 6.38 7.99 6.38Z'],
    ['email', '0 0 17 13', 'M 16.48 0.01C 16.48 0.01 16.11 0.01 16.11 0.01 16.11 0.01 16.11-0 16.11-0 16.11-0 16.1 0.01 16.1 0.01 16.1 0.01 0.96 0.01 0.96 0.01 0.96 0.01 0.95-0 0.95-0 0.95-0 0.94 0.01 0.94 0.01 0.94 0.01 0.52 0.01 0.52 0.01 0.23 0.01 0 0.25 0 0.55 0 0.55 0 12.46 0 12.46 0 12.76 0.23 13 0.52 13 0.52 13 16.48 13 16.48 13 16.77 13 17 12.76 17 12.46 17 12.46 17 0.55 17 0.55 17 0.25 16.77 0.01 16.48 0.01ZM 6.23 5.83C 6.23 5.83 1.05 11.15 1.05 11.15 1.05 11.15 1.05 1.47 1.05 1.47 1.05 1.47 6.23 5.83 6.23 5.83ZM 7.05 6.51C 7.05 6.51 8.2 7.48 8.2 7.48 8.3 7.56 8.41 7.6 8.53 7.6 8.65 7.6 8.76 7.56 8.86 7.48 8.86 7.48 10.01 6.51 10.01 6.51 10.01 6.51 15.28 11.92 15.28 11.92 15.28 11.92 1.78 11.92 1.78 11.92 1.78 11.92 7.05 6.51 7.05 6.51ZM 10.83 5.83C 10.83 5.83 15.95 1.52 15.95 1.52 15.95 1.52 15.95 11.09 15.95 11.09 15.95 11.09 10.83 5.83 10.83 5.83ZM 14.81 1.09C 14.81 1.09 8.53 6.36 8.53 6.36 8.53 6.36 2.25 1.09 2.25 1.09 2.25 1.09 14.81 1.09 14.81 1.09Z']
  ];

  function hoverMarkup(root, item) {
    var store = root.getAttribute('data-pg-info') === 'side';
    var love = function (attrs) {
      return '<span class="info-member info-element-social-love info-element-social-button" data-hook="love-button" ' + attrs +
        ' aria-label="Love"><button data-hook="love-icon" class="info-element-social-love love_empty" tabindex="-1">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="' + HEART_HOLE + HEART_FILLED +
        '" fill-rule="evenodd"></path></svg></button></span>';
    };
    var social;
    if (root.querySelector('.gallery-item-common-info-outer')) {
      social = '<div class="info-element-social info-align-center vertical-item text-external-item info-element-social-absolute" data-hook="item-social"></div>';
    } else if (store) {
      var title = document.createElement('span');
      title.textContent = item.getAttribute('data-title') || '';
      social = '<div class="info-element-text" dir="auto" style="align-items: center; text-align: center; display: flex; ' +
        'place-content: center; padding-bottom: 70px; direction: ltr;"><div><div class="info-member info-element-title" ' +
        'data-hook="item-title" style="overflow: hidden; margin-bottom: 16px; visibility: inherit; -webkit-line-clamp: none;">' +
        title.outerHTML + '</div><div class="info-member info-element-custom-button-wrapper" data-hook="custom-button-wrapper" ' +
        'style="justify-content: center; z-index: 17; visibility: inherit;"><button data-hook="custom-button-button" ' +
        'class="info-element-custom-button-button" tabindex="-1" style="cursor: inherit;">Buy Now<div class="overlay"></div>' +
        '</button></div></div></div><div class="info-element-social info-align-center vertical-item populated-item ' +
        'info-element-social-absolute" data-hook="item-social">' + love('tabindex="-1" role="checkbox"') +
        '<div class="info-member info-element-social-share info-element-social-button" data-hook="info-element-social-button">' +
        '<i class="share-store">' + SHARE_SVG + '</i></div></div><div data-hook="social-share-box" class="info-member ' +
        'info-element-social-share-box  hidden  vertical-item " tabindex="-1" aria-label="Share" role="menu" ' +
        'style="transform: translateY(-50%);">' + SHARE_NETWORKS.map(function (n, k) {
          return '<button class="has-custom-focus network-' + (k + 1) + '" data-hook="' + n[0] + '-share-button" title="Share on ' +
            n[0] + '" aria-live="assertive" role="menuitem" tabindex="-1" style="top: calc(' +
            +(100 * (k + 1) / 6).toFixed(4) + '% - 10px);"><svg viewBox="' + n[1] + '" fill="currentColor" width="18" height="18">' +
            '<path d="' + n[2] + '" fill="currentColor"></path></svg></button>';
        }).join('') + '</div>';
    } else {
      social = '<div class="info-element-social info-align-center populated-item info-element-social-absolute" data-hook="item-social">' +
        love('tabindex="0" role="checkbox" aria-checked="false"') + '</div>';
    }
    return '<div class="gallery-item-hover-inner"><div data-hook="info-element" style="height: 100%; width: 100%;">' +
      '<div class="hover-info-element" data-hook="hover-info-element" style="height: 100%; box-sizing: border-box; padding: 0px;">' +
      social + '</div></div></div>';
  }

  function renderItemLove(item) {
    var span = item.querySelector('[data-hook="love-button"]');
    if (!span) return;
    var loved = !!storedLoves()[item.getAttribute('data-id')];
    var button = span.querySelector('button');
    button.className = 'info-element-social-love ' + (loved ? 'love_full info-element-loved' : 'love_empty');
    if (span.hasAttribute('aria-checked')) span.setAttribute('aria-checked', String(loved));
    button.querySelector('path').setAttribute('d', loved ? HEART_FILLED : HEART_HOLE + HEART_FILLED);
  }

  function initHover(root) {
    if (variant !== 'desktop') return;
    [].forEach.call(root.querySelectorAll('[data-hook="item-container"]'), function (item) {
      var content = item.querySelector('[data-hook="image-item"]');
      var wrapper = item.querySelector('[data-hook="item-wrapper"]');
      if (!content || !wrapper) return;
      function hover(on) {
        var overlay = item.querySelector('.gallery-item-hover');
        if (on && !overlay) {
          var flex = document.createElement('div');
          flex.className = 'item-hover-flex-container';
          flex.style.cssText = 'width: ' + content.style.width + '; height: ' + content.style.height + '; margin-top: 0px; ' +
            'margin-left: 0px; display: flex; position: absolute; top: 0px; left: 0px; align-items: flex-end;';
          flex.innerHTML = '<div data-hook="item-hover-' + item.getAttribute('data-idx') + '"' +
            (root.getAttribute('data-pg-info') === 'side' ? ' aria-hidden="true"' : '') +
            ' class="gallery-item-hover fullscreen-enabled" style="width: ' + content.style.width + '; height: ' +
            content.style.height + '; margin: 0px; position: relative;"></div>';
          content.after(flex);
          overlay = flex.firstChild;
        }
        if (on && !overlay.firstChild) {
          overlay.innerHTML = hoverMarkup(root, item);
          renderItemLove(item);
        }
        // Classes swap in place, as in Wix's markup.
        item.className = item.className.replace(on ? 'item-container-regular' : 'item-container-hover',
          on ? 'item-container-hover' : 'item-container-regular').replace(on ? /\bclickable\b/ : / simulate-hover\b/,
          on ? 'clickable simulate-hover' : '');
        content.className = content.className.replace(on ? 'item-content-regular' : 'item-content-hover',
          on ? 'item-content-hover' : 'item-content-regular');
        if (overlay) {
          overlay.classList.toggle('item-overlay-regular', !on);
          overlay.classList.toggle('force-hover', on);
          overlay.classList.toggle('item-overlay-hover', on);
        }
      }
      item.addEventListener('mouseenter', function () { hover(true); });
      item.addEventListener('mouseleave', function () { hover(false); });
      // Keyboard focus on the item shows the same overlay (and its love button).
      item.addEventListener('focusin', function () { if (!item.matches(':hover')) hover(true); });
      item.addEventListener('focusout', function (e) {
        if (!item.contains(e.relatedTarget) && !item.matches(':hover')) hover(false);
      });
      // The love button keeps a local state (shared with the fullscreen view);
      // the share button opens Wix's share box.
      function toggleLove() {
        var loves = storedLoves(), id = item.getAttribute('data-id');
        if (loves[id]) delete loves[id]; else loves[id] = 1;
        try { localStorage.setItem(LOVES_KEY, JSON.stringify(loves)); } catch (err) { /* not persisted */ }
        renderItemLove(item);
      }
      item.addEventListener('click', function (e) {
        var love = e.target.closest('[data-hook="love-button"]');
        var share = e.target.closest('[data-hook="info-element-social-button"]');
        if (!love && !share) return;
        e.preventDefault();
        e.stopPropagation();
        if (love) return toggleLove();
        var box = item.querySelector('[data-hook="social-share-box"]');
        if (box) box.classList.toggle('hidden');
      }, true);
      item.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-hook="love-button"]')) {
          e.preventDefault();
          e.stopPropagation();
          toggleLove();
        }
      }, true);
    });
  }

  // Wix marks "load with color" items once their image has loaded.
  function markLoaded(root) {
    [].forEach.call(root.querySelectorAll('.load-with-color[data-hook="image-item"]'), function (content) {
      var img = content.querySelector('img');
      function done() { content.className = content.className.replace('load-with-color  ', 'load-with-color image-loaded '); }
      if (!img || img.complete) done(); else img.addEventListener('load', done);
    });
  }

  function initProGallery(root) {
    markLoaded(root);
    initPrerendered(root);
    rescaleMobile(root);
    initSlider(root);
    initHover(root);
    if (!root.hasAttribute('data-pg-fullscreen')) return;
    var items = [].slice.call(root.querySelectorAll('[data-hook="item-container"][data-full]'));
    function open(e) {
      var item = e.target.closest('[data-hook="item-container"][data-full]');
      if (!item || e.target.closest('[data-hook^="nav-arrow"]')) return;
      e.preventDefault();
      openFullscreen(root, items.indexOf(item));
    }
    root.addEventListener('click', open);
    root.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-hook="item-action"]')) open(e);
    });
    // Deep link: ?pgid=<gallery>-<item> opens that item, as on Wix.
    var m = /^([^-]+)-(.+)$/.exec(new URLSearchParams(location.search).get('pgid') || '');
    if (m && root.id === 'pro-gallery-comp-' + m[1]) {
      var i = items.map(function (it) { return it.getAttribute('data-id'); }).indexOf(m[2]);
      if (i >= 0) openFullscreen(root, i);
    }
  }

  // Wix "Carousel" widget (self-hosted iframe): once it reports ready, send it
  // the images and settings the Wix page would send.
  window.addEventListener('message', function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (!msg || msg.intent !== 'TPA' || msg.type !== 'appStateChanged') return;
    var frame = [].filter.call(document.querySelectorAll('iframe[data-carousel]'), function (f) {
      return f.contentWindow === e.source;
    })[0];
    if (!frame || !/"componentReady"/.test(msg.data && msg.data.state)) return;
    var params = JSON.parse(frame.getAttribute('data-carousel'));
    params.items.forEach(function (item) { item.uri = new URL(item.uri, location.href).href; });
    frame.contentWindow.postMessage(JSON.stringify(
      { intent: 'addEventListener', eventType: 'SETTINGS_UPDATED', params: params }), '*');
  });

  document.addEventListener('DOMContentLoaded', function () {
    [].forEach.call(document.querySelectorAll('wix-dropdown-menu'), initMenu);
    [].forEach.call(document.querySelectorAll('nav.TINY_MENU'), initTinyMenu);
    [].forEach.call(document.querySelectorAll('[data-testid="slide-show-gallery"]'), initGallery);
    var deep = lightboxParam() && lightboxItem(lightboxParam());
    if (deep) openZoom(deep.ghosts, deep.index, true);
    [].forEach.call(document.querySelectorAll('.wixui-image-button'), initTooltip);
    [].forEach.call(document.querySelectorAll('#SKIP_TO_CONTENT_BTN'), initSkip);
    [].forEach.call(document.querySelectorAll('[data-video]'), initVideo);
    [].forEach.call(document.querySelectorAll('div.pro-gallery[id^="pro-gallery-"]:not([id^="pro-gallery-container-"])'),
      initProGallery);
    initAnchors();
    initFocusMode();
  });
})();
