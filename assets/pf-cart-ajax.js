/*
  Phomifood — AJAX add-to-cart for product-card buttons.
  Intercepts the ".pf-card-actions__form" submit so clicking "Thêm vào giỏ"
  adds the item in the background (no redirect to the cart page), refreshes
  the header cart bubble and plays a fly-to-cart animation (10/11: the cart drawer
  no longer opens on add; customers open it from the cart icon / sticky bar). Vanilla JS, single delegated listener.
*/
(function () {
  if (window.__pfCartAjax) return;
  window.__pfCartAjax = true;

  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }
  function addUrl() {
    return (window.routes && window.routes.cart_add_url) || root() + 'cart/add';
  }
  function cartUrl() {
    return (window.routes && window.routes.cart_url) || root() + 'cart';
  }

  // Cập nhật icon giỏ hàng (và giỏ trượt) ngay sau khi thêm, không cần tải lại trang.
  function setCount(n) {
    var link = document.getElementById('cart-icon-bubble');
    if (!link) return;
    var b = link.querySelector('.cart-count-bubble');
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.className = 'cart-count-bubble';
      b.innerHTML = '<span aria-hidden="true"></span><span class="visually-hidden"></span>';
      link.appendChild(b);
    }
    var vis = b.querySelector('[aria-hidden]');
    if (vis) vis.textContent = n < 100 ? n : '';
    var hid = b.querySelector('.visually-hidden');
    if (hid) hid.textContent = n + ' sản phẩm';
  }

  function isCartPage() { return !!document.querySelector('main[data-template="cart"]'); }

  function refreshBubble(openDrawer) {
    var bust = '&_=' + Date.now();
    // 1) Số lượng chắc chắn đúng từ cart.js
    fetch(root() + 'cart.js?' + bust.slice(1), { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (c) { setCount(c.item_count); })
      .catch(function () {});
    // 2) Vẽ lại icon + giỏ trượt bằng HTML mới của Shopify
    fetch(cartUrl() + '?sections=cart-icon-bubble,cart-drawer' + bust, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) { applySections(data, openDrawer); })
      .catch(function () {});
  }

  // Vẽ lại icon + giỏ trượt từ HTML các section Shopify trả về (từ /cart/add.js hoặc ?sections=).
  function applySections(data, openDrawer) {
        var html = data && data['cart-icon-bubble'];
        var target = document.getElementById('cart-icon-bubble');
        if (html && target) {
          var tmp = document.createElement('div');
          tmp.innerHTML = html;
          var source = tmp.querySelector('#cart-icon-bubble') || tmp.querySelector('.shopify-section') || tmp;
          target.innerHTML = source.innerHTML;
        }
        var dh = data && data['cart-drawer'];
        var drawer = document.querySelector('cart-drawer');
        if (dh && drawer) {
          var t2 = document.createElement('div');
          t2.innerHTML = dh;
          var fresh = t2.querySelector('cart-drawer');
          var inner = drawer.querySelector('#CartDrawer'), freshInner = fresh && fresh.querySelector('#CartDrawer');
          if (inner && freshInner) inner.innerHTML = freshInner.innerHTML;
          if (fresh) drawer.classList.toggle('is-empty', fresh.classList.contains('is-empty'));
          // Vừa thêm SP → mở giỏ trượt (như phomifood.com). Nội dung vừa thay nên gắn lại sự kiện bấm nền để đóng.
          if (openDrawer && !isCartPage() && typeof drawer.open === 'function') {
            var ov = drawer.querySelector('#CartDrawer-Overlay');
            if (ov && !ov.__pfBound) { ov.__pfBound = true; ov.addEventListener('click', function () { drawer.close(); }); }
            drawer.open();
          }
        }
  }
  window.pfRefreshCartIcon = refreshBubble;

  // 10/11: thêm giỏ KHÔNG mở giỏ trượt nữa (khó chịu khi thêm nhiều món).
  // Thay bằng hiệu ứng: icon giỏ bay từ nút vừa bấm lên icon giỏ trên thanh menu, rồi icon đó nhún lên.
  var lastAddBtn = null;
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button[type="submit"], button[name="add"], .pf-fs__add, .pf-btn-cart, [data-pf-add]');
    if (b) lastAddBtn = b;
  }, true);
  var CART_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  function injectCss() {
    if (document.getElementById('pf-fly-css')) return;
    var st = document.createElement('style');
    st.id = 'pf-fly-css';
    st.textContent =
      '.pf-fly{position:fixed;z-index:2147483000;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;display:grid;place-items:center;' +
      'background:#ffc61a;color:#14672f;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;will-change:transform,opacity}' +
      '@keyframes pf-cart-bump{0%{transform:translateY(0) scale(1)}30%{transform:translateY(-7px) scale(1.18)}55%{transform:translateY(0) scale(.94)}75%{transform:translateY(-3px) scale(1.05)}100%{transform:translateY(0) scale(1)}}' +
      '#cart-icon-bubble.pf-cart-bump{animation:pf-cart-bump .6s cubic-bezier(.3,.7,.4,1.4)}' +
      '@media (prefers-reduced-motion:reduce){#cart-icon-bubble.pf-cart-bump{animation:none}}';
    document.head.appendChild(st);
  }
  function bump() {
    var t = document.getElementById('cart-icon-bubble');
    if (!t) return;
    injectCss();
    t.classList.remove('pf-cart-bump');
    void t.offsetWidth;
    t.classList.add('pf-cart-bump');
    setTimeout(function () { t.classList.remove('pf-cart-bump'); }, 700);
  }
  var lastFly = 0;
  function flyToCart(fromEl) {
    if (Date.now() - lastFly < 900) return; // tránh bay 2 lần cho cùng 1 lần thêm
    lastFly = Date.now();
    var target = document.getElementById('cart-icon-bubble');
    var src = fromEl && document.body.contains(fromEl) ? fromEl : lastAddBtn;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!target || !src || reduce || !src.getBoundingClientRect || !document.body.animate) { bump(); return; }
    injectCss();
    var a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    var x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    if (b.bottom < 0 || b.width === 0) { x1 = window.innerWidth - 40; y1 = 24; }
    var dx = x1 - x0, dy = y1 - y0;
    var el = document.createElement('div');
    el.className = 'pf-fly';
    el.innerHTML = CART_SVG;
    el.style.left = x0 + 'px';
    el.style.top = y0 + 'px';
    document.body.appendChild(el);
    var lift = Math.min(-60, dy * 0.35);
    var anim = el.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 + lift) + 'px) scale(.9)', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35)', opacity: .6 }
    ], { duration: 750, easing: 'cubic-bezier(.45,.05,.55,.95)' });
    anim.onfinish = function () { el.remove(); bump(); };
    setTimeout(function () { if (el.parentNode) { el.remove(); bump(); } }, 1200);
  }
  window.pfFlyToCart = flyToCart;

  // Mọi nút thêm giỏ khác trên trang (gợi ý, mua kèm, quà tặng…) cũng cập nhật icon giỏ.
  var tmr, wantOpen = false;
  function later(open) {
    if (open === true) wantOpen = true;
    clearTimeout(tmr);
    tmr = setTimeout(function () { var o = wantOpen; wantOpen = false; refreshBubble(false); if (o) flyToCart(lastAddBtn); }, 250);
  }
  var origFetch = window.fetch;
  if (origFetch && !origFetch.__pfIcon) {
    var wrapped = function (input) {
      var p = origFetch.apply(this, arguments);
      try {
        var u = (typeof input === 'string') ? input : (input && input.url) || '';
        var isAdd = u.indexOf('/cart/add') > -1;
        if (isAdd || u.indexOf('/cart/change') > -1 || u.indexOf('/cart/update') > -1 || u.indexOf('/cart/clear') > -1) {
          p.then(function (res) { later(isAdd && !!(res && res.ok)); }, function () {});
        }
      } catch (e) {}
      return p;
    };
    wrapped.__pfIcon = true;
    window.fetch = wrapped;
  }

  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target && e.target.closest ? e.target.closest('.pf-card-actions__form') : null;
      if (!form) return;
      e.preventDefault();

      var btn = form.querySelector('button[type="submit"]');
      var label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Đang thêm…'; }

      var fd = new FormData(form);
      fd.append('sections', 'cart-drawer,cart-icon-bubble');
      fd.append('sections_url', window.location.pathname);
      (origFetch || fetch).call(window, root() + 'cart/add.js', {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw res.data;
          // 10/11: giỏ trượt + icon lấy thẳng từ phản hồi thêm giỏ → hiện đúng ngay, không bị trống
          if (res.data && res.data.sections) applySections(res.data.sections, false); else refreshBubble(false);
          flyToCart(btn);
          (origFetch || fetch).call(window, root() + 'cart.js?_=' + Date.now(), { headers: { Accept: 'application/json' }, cache: 'no-store' })
            .then(function (r) { return r.json(); }).then(function (c) { setCount(c.item_count); }).catch(function () {});
          try { document.dispatchEvent(new CustomEvent('pf:cart:added', { detail: res.data })); } catch (_) {}
          if (btn) { btn.textContent = 'Đã thêm ✓'; }
          setTimeout(function () { if (btn) { btn.innerHTML = label; btn.disabled = false; } }, 1600);
        })
        .catch(function () {
          if (btn) {
            btn.textContent = 'Thử lại';
            setTimeout(function () { btn.innerHTML = label; btn.disabled = false; }, 1600);
          }
        });
    },
    false
  );
})();
