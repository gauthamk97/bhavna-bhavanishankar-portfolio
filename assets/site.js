// Replaces the bits of Wix's runtime this site relies on: the desktop/mobile
// page switch, slideshow galleries, image zoom and the contact form.
(function () {
  var meta = document.querySelector('meta[name="site-variant"]');
  var variant = meta.getAttribute('content');
  var isMobile = /Mobi|Android|iPhone|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if ((variant === 'mobile') !== isMobile && !/[?&]view=/.test(location.search)) {
    location.replace(meta.getAttribute('data-alt') + location.hash);
  }

  function initGallery(gallery) {
    var ghosts = gallery.querySelectorAll('.w3sg0B > [data-testid="gallery-item-ghost"]');
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

  document.addEventListener('DOMContentLoaded', function () {
    [].forEach.call(document.querySelectorAll('wix-dropdown-menu'), initMenu);
    [].forEach.call(document.querySelectorAll('nav.TINY_MENU'), initTinyMenu);
    [].forEach.call(document.querySelectorAll('[data-testid="slide-show-gallery"]'), initGallery);
    [].forEach.call(document.querySelectorAll('form'), initForm);
    initAnchors();
  });
})();
