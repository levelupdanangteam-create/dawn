/*
  Phomifood — AJAX add-to-cart for product-card buttons.
  Intercepts the ".pf-card-actions__form" submit so clicking "Thêm vào giỏ"
  adds the item in the background (no redirect to the cart page) and refreshes
  the header cart bubble. Vanilla JS, single delegated listener.
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

  function refreshBubble() {
    var bust = '&_=' + Date.now();
    // 1) Số lượng chắc chắn đúng từ cart.js
    fetch(root() + 'cart.js?' + bust.slice(1), { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (c) { setCount(c.item_count); })
      .catch(function () {});
    // 2) Vẽ lại icon + giỏ trượt bằng HTML mới của Shopify
    fetch(cartUrl() + '?sections=cart-icon-bubble,cart-drawer' + bust, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
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
        }
      })
      .catch(function () {});
  }
  window.pfRefreshCartIcon = refreshBubble;

  // Mọi nút thêm giỏ khác trên trang (gợi ý, mua kèm, quà tặng…) cũng cập nhật icon giỏ.
  var tmr;
  function later() { clearTimeout(tmr); tmr = setTimeout(refreshBubble, 250); }
  var origFetch = window.fetch;
  if (origFetch && !origFetch.__pfIcon) {
    var wrapped = function (input) {
      var p = origFetch.apply(this, arguments);
      try {
        var u = (typeof input === 'string') ? input : (input && input.url) || '';
        if (u.indexOf('/cart/add') > -1 || u.indexOf('/cart/change') > -1 || u.indexOf('/cart/update') > -1 || u.indexOf('/cart/clear') > -1) {
          p.then(later, function () {});
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

      fetch(addUrl(), {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw res.data;
          later();
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
