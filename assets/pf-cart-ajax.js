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

  function refreshBubble() {
    fetch(cartUrl() + '?sections=cart-icon-bubble', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var html = data && data['cart-icon-bubble'];
        var target = document.getElementById('cart-icon-bubble');
        if (!html || !target) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var source = tmp.querySelector('#cart-icon-bubble') || tmp;
        target.innerHTML = source.innerHTML;
      })
      .catch(function () {});
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
          refreshBubble();
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
