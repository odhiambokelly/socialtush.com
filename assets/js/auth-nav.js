/* Points the header's user icon at the SocialTush log in / account pages
 * (replaces Site123's built-in "client zone" popup, which only works on Site123). */
(function () {
  'use strict';
  var me = document.currentScript;
  var BASE = new URL(me.getAttribute('src').replace(/assets\/js\/auth-nav\.js.*$/, ''), location.href).href;

  function loggedIn() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || 'null');
          if (v && v.access_token && (!v.expires_at || v.expires_at * 1000 > Date.now() - 7 * 864e5)) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function fix(a) {
    if (a.dataset.stAuth) return;
    var inside = loggedIn();
    var clone = a.cloneNode(true); // drops Site123's click handlers
    clone.classList.remove('client-zone-link');
    clone.classList.add('st-account-link');
    clone.dataset.stAuth = '1';
    clone.removeAttribute('data-close-location');
    clone.href = new URL(inside ? 'account.html' : 'login.html', BASE).href;
    clone.setAttribute('aria-label', inside ? 'My account' : 'Log in or sign up');
    clone.title = inside ? 'My account' : 'Log in / Sign up';
    a.parentNode.replaceChild(clone, a);
  }
  function scan() { document.querySelectorAll('a.client-zone-link').forEach(fix); }

  // Site123 builds the header with JavaScript, so watch for it
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  // Block any delegated Site123 handler that still targets the old popup
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.st-account-link');
    if (a) { e.stopImmediatePropagation(); }
  }, true);
})();

/* "Free tools" dropdown in the header: tap/click to toggle, Escape or outside click to close. */
(function () {
  function close(except) {
    document.querySelectorAll('.has-sub.open').forEach(function (li) {
      if (li !== except) { li.classList.remove('open'); var b = li.querySelector('.sub-toggle'); if (b) b.setAttribute('aria-expanded', 'false'); }
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sub-toggle');
    if (b) {
      var li = b.parentNode, open = !li.classList.contains('open');
      close(li); li.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
      return;
    }
    if (!(e.target.closest && e.target.closest('.has-sub'))) close(null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(null); });
})();
