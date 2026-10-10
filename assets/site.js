// Replaces the bits of Wix's runtime this site relies on: the desktop/mobile
// page switch, slideshow galleries, image zoom, pro-gallery sliders and
// fullscreen view, video players, carousels and the contact form.
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
    show(0);
  }

  function itemData(ghost) {
    var img = ghost.querySelector('img');
    var title = ghost.querySelector('[data-testid="gallery-item-title"]');
    var desc = ghost.querySelector('[data-testid="gallery-item-description"]');
    return { src: img && img.getAttribute('src'), alt: img && img.alt,
             title: title ? title.textContent : '', desc: desc ? desc.textContent : '' };
  }

  function openZoom(ghosts, start) {
    var i = start;
    var box = document.createElement('div');
    box.className = 'site-zoom';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML =
      '<figure class="site-zoom__figure"><img alt=""><figcaption>' +
      '<div class="site-zoom__title"></div><div class="site-zoom__desc"></div></figcaption></figure>' +
      '<button class="site-zoom__close" aria-label="close"><svg viewBox="0 0 18 18" width="18" height="18">' +
      '<path d="M1.4 0L9 7.6 16.6 0 18 1.4 10.4 9 18 16.6 16.6 18 9 10.4 1.4 18 0 16.6 7.6 9 0 1.4z"/></svg></button>' +
      '<button class="site-zoom__nav site-zoom__prev" aria-label="previous"><svg viewBox="0 0 18 31" width="18" height="31">' +
      '<path d="M15.9 0L18 2.1 4.2 15.5 18 28.9 15.9 31 0 15.5z"/></svg></button>' +
      '<button class="site-zoom__nav site-zoom__next" aria-label="next"><svg viewBox="0 0 18 31" width="18" height="31">' +
      '<path d="M2.1 0L0 2.1l13.8 13.4L0 28.9 2.1 31 18 15.5z"/></svg></button>';
    var img = box.querySelector('img');

    function render() {
      var d = itemData(ghosts[i]);
      img.src = d.src;
      img.alt = d.alt || '';
      box.querySelector('.site-zoom__title').textContent = d.title;
      box.querySelector('.site-zoom__desc').textContent = d.desc;
    }
    function go(step) { i = (i + step + ghosts.length) % ghosts.length; render(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('site-zoom-open');
      box.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }

    box.querySelector('.site-zoom__close').addEventListener('click', close);
    box.querySelector('.site-zoom__prev').addEventListener('click', function () { go(-1); });
    box.querySelector('.site-zoom__next').addEventListener('click', function () { go(1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    if (ghosts.length < 2) box.classList.add('site-zoom--single');
    render();
    document.documentElement.classList.add('site-zoom-open');
    document.body.appendChild(box);
    box.querySelector('.site-zoom__close').focus();
  }

  // The site has no form backend on GitHub Pages, so the contact form hands the
  // message to the visitor's mail app, addressed to the site's contact email.
  var CONTACT_EMAIL = 'bhavna.bhavanishankar@gmail.com';

  function initForm(form) {
    var thanks = [].filter.call(form.querySelectorAll('[data-testid="richTextElement"]'), function (el) {
      return /Thanks for submitting/i.test(el.textContent);
    })[0];
    if (thanks) thanks.classList.add('site-form-thanks');
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = form.querySelectorAll('input, textarea');
      var invalid = [].filter.call(fields, function (f) { return !f.checkValidity(); });
      [].forEach.call(fields, function (f) { f.setAttribute('aria-invalid', String(!f.checkValidity())); });
      if (invalid.length) { invalid[0].focus(); return; }
      function val(name) {
        var f = form.querySelector('[name="' + name + '"]');
        return f ? f.value : '';
      }
      var message = form.querySelector('textarea');
      var body = 'Name: ' + val('name') + '\nEmail: ' + val('email') + '\n\n' + (message ? message.value : '');
      location.href = 'mailto:' + CONTACT_EMAIL +
        '?subject=' + encodeURIComponent(val('subject') || 'Website enquiry') +
        '&body=' + encodeURIComponent(body);
      if (thanks) thanks.classList.add('site-form-thanks--shown');
      form.reset();
    });
    // Wix's submit is a plain <button> inside the form; make sure it submits.
    var btn = form.querySelector('button');
    if (btn && !btn.getAttribute('type')) btn.setAttribute('type', 'submit');
  }

  // Wix lays out dropdown menus at runtime: labels are centred in the item's
  // height and the "More" overflow item is hidden when every item fits.
  function initMenu(menu) {
    [].forEach.call(menu.querySelectorAll('li:not([data-index="__more__"])'), function (li) {
      var label = li.querySelector('p');
      if (label && li.clientHeight) label.style.lineHeight = li.clientHeight + 'px';
    });
    var more = menu.querySelector('li[data-index="__more__"]');
    var drop = menu.querySelector('[id$="moreContainer"]');
    if (more && drop && !drop.children.length) {
      // Out of flow, so the visible items right-align within the menu like on Wix.
      more.style.visibility = 'hidden';
      more.style.position = 'absolute';
      more.style.height = '0';
    }
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

  // Same-page anchor links (and Wix's "Up" button) scroll smoothly, like on Wix.
  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-anchor]');
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = a.getAttribute('href') || '';
      var target = a.getAttribute('data-anchor') === 'SCROLL_TO_TOP' ? document.documentElement
        : href.charAt(0) === '#' && document.getElementById(decodeURIComponent(href.slice(1)));
      if (!target) return;
      e.preventDefault();
      if (target === document.documentElement) window.scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      button.removeAttribute('aria-expanded');
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

  // Video player: the cover (poster + play button) is swapped for a native
  // player with controls on click, like Wix's player starts on its cover.
  function initVideo(root) {
    var cover = root.querySelector('[data-testid="playable-cover"]');
    if (!cover) return;
    cover.addEventListener('click', function () {
      var video = document.createElement('video');
      video.className = 'site-video';
      video.src = root.getAttribute('data-video');
      video.controls = true;
      video.playsInline = true;
      video.loop = root.getAttribute('data-loop') === 'true';
      video.muted = root.getAttribute('data-muted') === 'true';
      var img = cover.querySelector('img');
      if (img) video.poster = img.src;
      root.appendChild(video);
      cover.remove();
      video.play();
    });
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
    function update() {
      back.style.display = scroller.scrollLeft > 1 ? '' : 'none';
      next.style.display = scroller.scrollLeft < maxScroll() - 1 ? '' : 'none';
    }
    function center(item) {
      var r = item.getBoundingClientRect();
      return r.left - scroller.getBoundingClientRect().left + scroller.scrollLeft + r.width / 2;
    }
    function current() {
      var mid = scroller.scrollLeft + scroller.clientWidth / 2, best = 0;
      items.forEach(function (item, i) {
        if (Math.abs(center(item) - mid) < Math.abs(center(items[best]) - mid)) best = i;
      });
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

  // Galleries Wix lays out only in the browser (server HTML hides the items):
  // fit the columns to the real width, keeping Wix's gaps and info height.
  function initPrerendered(root) {
    var pre = root.querySelector('.pro-gallery-prerender');
    if (!pre) return;
    var items = [].slice.call(root.querySelectorAll('[data-hook="item-container"]'));
    if (!items.length) return;
    var px = function (v) { return parseFloat(v) || 0; };
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
    var opener = document.activeElement;
    var index = start;
    var love = '<span class="fullscreen-social-love-container"><button class="fullscreen-social-love' +
      (mobile ? '' : ' fullscreen-icon') + '" role="checkbox" aria-checked="false" title="Love">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path fill-rule="evenodd"></path></svg>' +
      '</button><i class="fullscreen-social-love-count"></i></span>';
    var bar = mobile
      ? '<div class="fullscreen-mobile-bar site-pgfs__bar"><button class="fullscreen-close progallery-svg-font-icons-back" ' +
        'aria-label="Exit expand mode"></button><div class="fullscreen-social">' + love + '</div></div>'
      : '<div class="site-pgfs__bar"><div class="fullscreen-social"><button class="fullscreen-icon fullscreen-expand ' +
        'progallery-svg-font-icons-expand-arrow" title="Open in fullscreen"></button>' + love + '</div>' +
        '<div class="fullscreen-nav"><button class="fullscreen-icon fullscreen-close progallery-svg-font-icons-close-x" ' +
        'aria-label="Exit expand mode"></button></div></div>';
    var info = function (title) {
      return '<div class="site-pgfs__info' + (side && !mobile ? ' fullscreen-side-bar' : '') + '">' +
        '<div class="fullscreen-side-bar-title"><h1>' + title + '</h1></div></div>';
    };
    var body = mobile
      ? '<div class="site-pgfs__track">' + items.map(function (it) {
          return '<div class="site-pgfs__slide"><img alt=""><div class="site-pgfs__slide-info">' + info('') + '</div></div>';
        }).join('') + '</div>'
      : '<div class="site-pgfs__stage"></div>' + info('') +
        '<button class="fullscreen-icon site-pgfs__arrow site-pgfs__prev" aria-label="Previous Item">' + ARROW_SVG + '</button>' +
        '<button class="fullscreen-icon site-pgfs__arrow site-pgfs__next" aria-label="Next Item">' + ARROW_SVG + '</button>';
    var host = document.createElement('div');
    host.className = 'fullscreen-comp-wrapper ' + comp + ' site-pgfs-host';
    host.innerHTML = '<div class="pro-fullscreen-wrapper site-pgfs" id="pro-fullscreen-wrapper">' +
      '<div id="fullscreen-view" data-hook="fullscreen-view" class="fullscreen pro-fullscreen pro-fullscreen-inline-styles ' +
      'inline-styles pro-fullscreen-v2 fullscreen-bright site-pgfs__view' + (mobile ? ' site-pgfs--mobile' : '') +
      (side ? ' site-pgfs--side' : '') + '" role="dialog" aria-modal="true" tabindex="-1" ' +
      'aria-label="Gallery item, detailed view">' + bar + body + '</div></div>';
    var wrapper = host.firstChild, view = wrapper.firstChild;
    var loveBtn = view.querySelector('.fullscreen-social-love');
    var count = view.querySelector('.fullscreen-social-love-count');
    var expand = view.querySelector('.fullscreen-expand');
    var track = view.querySelector('.site-pgfs__track');
    var stage = view.querySelector('.site-pgfs__stage');
    var prev = view.querySelector('.site-pgfs__prev');
    var nextBtn = view.querySelector('.site-pgfs__next');

    function data(i) {
      return { id: items[i].getAttribute('data-id'), title: items[i].getAttribute('data-title') || '',
               src: items[i].getAttribute('data-full') };
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
      img.alt = d.title;
      img.src = d.src;
      if (fade) {
        img.style.opacity = '0';
        img.addEventListener('transitionend', function () {
          [].slice.call(stage.querySelectorAll('img')).forEach(function (old) { if (old !== img) old.remove(); });
        });
      } else {
        stage.innerHTML = '';
      }
      stage.appendChild(img);
      if (fade) { void img.offsetWidth; img.style.opacity = '1'; }
      view.querySelector('.site-pgfs__info h1').textContent = d.title;
      select(i);
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      host.remove();
      blockScroll(false);
      document.title = pageTitle;
      setUrl(null);
      if (opener && opener.focus) opener.focus();
    }
    function go(step) {
      if (track) track.scrollTo({ left: (index + step) * track.clientWidth, behavior: 'smooth' });
      else show(index + step, true);
    }
    function onKey(e) {
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

    blockScroll(true);
    wrapper.style.opacity = '0';
    document.body.appendChild(host);
    if (track) {
      [].forEach.call(track.children, function (slide, i) {
        var d = data(i), img = slide.querySelector('img');
        img.alt = d.title;
        img.src = d.src;
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
    view.focus();
  }

  function initProGallery(root) {
    initPrerendered(root);
    initSlider(root);
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
    [].forEach.call(document.querySelectorAll('form'), initForm);
    [].forEach.call(document.querySelectorAll('[data-video]'), initVideo);
    [].forEach.call(document.querySelectorAll('div.pro-gallery[id^="pro-gallery-"]:not([id^="pro-gallery-container-"])'),
      initProGallery);
    initAnchors();
  });
})();
