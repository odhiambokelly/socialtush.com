/* SocialTush accounts: sign up, log in, email confirmation, password reset, account page.
 * Uses Supabase Auth (loaded from the CDN before this file) + values from auth-config.js. */
(function () {
  'use strict';

  var cfg = window.SOCIALTUSH_AUTH || {};
  var root = document.querySelector('[data-auth-page]');
  if (!root) return;
  var page = root.getAttribute('data-auth-page');

  // Site base URL (works on github.io sub-paths and on a custom domain)
  var scriptEl = document.querySelector('script[src*="assets/js/auth.js"]');
  var BASE = new URL(scriptEl.getAttribute('src').replace(/assets\/js\/auth\.js.*$/, ''), location.href).href;
  function url(p) { return new URL(p, BASE).href; }

  var $ = function (sel, el) { return (el || root).querySelector(sel); };
  var msgBox = $('.st-msg');
  function show(kind, text) { msgBox.className = 'st-msg ' + kind; msgBox.textContent = text; if (text) msgBox.scrollIntoView({ block: 'nearest' }); }
  function clearMsg() { msgBox.className = 'st-msg'; msgBox.textContent = ''; }

  // ---------- configuration check ----------
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '') && (cfg.supabaseAnonKey || '').length > 20;
  if (!configured || !window.supabase) {
    show('bad', !window.supabase
      ? 'The sign-in service could not load. Check your connection and refresh the page.'
      : 'Accounts are not connected yet. The site owner needs to add the Supabase project URL and key in assets/js/auth-config.js (see AUTH-SETUP.md).');
    root.querySelectorAll('form button, form input').forEach(function (el) { el.disabled = true; });
    return;
  }
  var sb = window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/, ''), cfg.supabaseAnonKey, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });

  // ---------- validation ----------
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  var DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
    'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com',
    'mohmal.com', 'emailondeck.com', 'tempail.com', 'burnermail.io', 'mailnesia.com', 'spamgourmet.com', 'moakt.com', 'tempr.email', 'discard.email'];
  var TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com',
    'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'iclod.com': 'icloud.com' };

  function checkEmail(v) {
    v = v.trim().toLowerCase();
    if (!v) return 'Enter your email address.';
    if (v.length > 254 || !EMAIL_RE.test(v)) return 'Enter a valid email address, like name@example.com.';
    var domain = v.split('@')[1];
    if (DISPOSABLE.indexOf(domain) !== -1) return 'Temporary or disposable email addresses are not accepted. Please use your real email.';
    return '';
  }
  function emailTypo(v) { var d = (v.trim().toLowerCase().split('@')[1] || ''); return TYPOS[d] ? v.trim().split('@')[0] + '@' + TYPOS[d] : ''; }
  function checkName(v) {
    v = v.trim().replace(/\s+/g, ' ');
    if (!v) return 'Enter your full name.';
    if (v.length < 2 || v.length > 60) return 'Your name must be 2 to 60 characters.';
    if (!/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(v)) return 'Use letters, spaces, apostrophes or hyphens only.';
    return '';
  }
  var RULES = [
    ['len', 'At least 8 characters', function (p) { return p.length >= 8; }],
    ['upper', 'An uppercase letter', function (p) { return /[A-Z]/.test(p); }],
    ['lower', 'A lowercase letter', function (p) { return /[a-z]/.test(p); }],
    ['num', 'A number', function (p) { return /\d/.test(p); }],
    ['sym', 'A symbol (e.g. ! @ # $)', function (p) { return /[^A-Za-z0-9]/.test(p); }]
  ];
  function checkPassword(p, email) {
    if (!p) return 'Create a password.';
    for (var i = 0; i < RULES.length; i++) if (!RULES[i][2](p)) return 'Your password needs: ' + RULES[i][1].toLowerCase() + '.';
    if (p.length > 72) return 'Your password must be 72 characters or fewer.';
    var local = (email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (local.length >= 4 && p.toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(local) !== -1) return 'Your password must not contain your email name.';
    if (/^(.)\1+$/.test(p) || /password|qwerty|123456|socialtush/i.test(p)) return 'That password is too easy to guess. Try something less common.';
    return '';
  }
  function strength(p) { var s = 0; RULES.forEach(function (r) { if (r[2](p)) s++; }); if (p.length >= 12) s++; return Math.min(s, 6); }

  function setErr(input, text) {
    var e = document.getElementById(input.id + '-err');
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
    if (e) e.textContent = text || '';
  }
  function wirePasswordUI(pass, emailInput) {
    var meter = $('.st-meter span'), list = $('.st-rules');
    if (list) list.innerHTML = RULES.map(function (r) { return '<li data-rule="' + r[0] + '">' + r[1] + '</li>'; }).join('');
    pass.addEventListener('input', function () {
      var p = pass.value;
      if (list) RULES.forEach(function (r) { list.querySelector('[data-rule=' + r[0] + ']').classList.toggle('ok', r[2](p)); });
      if (meter) { var s = strength(p); meter.style.width = (s / 6 * 100) + '%'; meter.style.background = s < 3 ? '#c0392b' : s < 5 ? '#e0a100' : '#2eb872'; }
      if (pass.getAttribute('aria-invalid') === 'true') setErr(pass, checkPassword(p, emailInput ? emailInput.value : ''));
    });
  }
  root.querySelectorAll('.st-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('aria-controls'));
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
      btn.setAttribute('aria-pressed', String(!showing));
    });
  });

  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function friendly(err) {
    var m = (err && (err.message || err.error_description)) || String(err);
    if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox (and spam folder) for the SocialTush confirmation email.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
    if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists. Log in, or reset your password.';
    if (/weak|pwned|leaked/i.test(m)) return 'That password has appeared in a data breach or is too weak. Please choose a different one.';
    if (/expired|invalid.*(token|link)|otp/i.test(m)) return 'This link has expired or was already used. Request a new one below.';
    if (/fetch|network/i.test(m)) return 'Could not reach the sign-in service. Check your connection and try again.';
    if (/smtp|sending.*email|error sending/i.test(m)) return 'We could not send the email right now. Please try again in a few minutes.';
    return m;
  }

  // resend confirmation with a 60s cooldown
  function wireResend(btn, getEmail) {
    btn.addEventListener('click', function () {
      var email = getEmail();
      var bad = checkEmail(email);
      if (bad) { show('bad', bad); return; }
      busy(btn, true, 'Sending…');
      sb.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: url('confirm.html') } }).then(function (r) {
        if (r.error) { busy(btn, false); show('bad', friendly(r.error)); return; }
        show('good', 'A new confirmation email is on its way to ' + email.trim() + '.');
        var left = 60; btn.textContent = 'Resend in ' + left + 's';
        var t = setInterval(function () { left--; btn.textContent = 'Resend in ' + left + 's'; if (left <= 0) { clearInterval(t); busy(btn, false); } }, 1000);
      });
    });
  }

  // ---------- pages ----------
  var pages = {
    signup: function () {
      var form = $('form'), name = $('#st-name'), email = $('#st-email'), pass = $('#st-pass'), pass2 = $('#st-pass2'), terms = $('#st-terms'), hp = $('#st-website'), btn = $('#st-submit');
      var started = Date.now();
      wirePasswordUI(pass, email);
      sb.auth.getSession().then(function (r) { if (r.data.session) show('info', 'You are already logged in. Go to your account to manage it, or log out to create a different account.'); });
      email.addEventListener('blur', function () {
        var t = emailTypo(email.value), hint = document.getElementById('st-email-typo');
        if (t) { hint.innerHTML = 'Did you mean <button type="button"></button>?'; hint.querySelector('button').textContent = t; hint.querySelector('button').onclick = function () { email.value = t; hint.textContent = ''; setErr(email, ''); }; }
        else hint.textContent = '';
        if (email.value) setErr(email, checkEmail(email.value));
      });
      name.addEventListener('blur', function () { if (name.value) setErr(name, checkName(name.value)); });
      pass2.addEventListener('input', function () { if (pass2.getAttribute('aria-invalid') === 'true') setErr(pass2, pass2.value === pass.value ? '' : 'Passwords do not match.'); });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); clearMsg();
        var errs = [
          [name, checkName(name.value)],
          [email, checkEmail(email.value)],
          [pass, checkPassword(pass.value, email.value)],
          [pass2, !pass2.value ? 'Confirm your password.' : pass2.value !== pass.value ? 'Passwords do not match.' : '']
        ];
        errs.forEach(function (e) { setErr(e[0], e[1]); });
        var termsErr = terms.checked ? '' : 'Please accept the Terms and Conditions and Refund Policy.';
        document.getElementById('st-terms-err').textContent = termsErr;
        var first = errs.filter(function (e) { return e[1]; })[0];
        if (first) { first[0].focus(); return; }
        if (termsErr) { terms.focus(); return; }
        if (hp.value || Date.now() - started < 2500) { show('bad', 'Something went wrong. Please wait a moment and try again.'); return; }

        var cleanEmail = email.value.trim().toLowerCase(), cleanName = name.value.trim().replace(/\s+/g, ' ');
        busy(btn, true, 'Creating your account…');
        sb.auth.signUp({ email: cleanEmail, password: pass.value, options: { emailRedirectTo: url('confirm.html'), data: { full_name: cleanName } } }).then(function (r) {
          busy(btn, false);
          if (r.error) { show('bad', friendly(r.error)); return; }
          // Supabase returns a user with no identities when the email is already registered
          if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
            show('bad', 'An account with this email already exists. Log in, or reset your password if you forgot it.'); return;
          }
          if (r.data.session) { location.href = url('account.html'); return; } // only if email confirmation is turned off
          form.classList.add('st-hidden');
          root.querySelector('.st-sub').classList.add('st-hidden');
          var done = $('#st-done'); done.classList.remove('st-hidden');
          done.querySelector('[data-email]').textContent = cleanEmail;
          wireResend($('#st-resend'), function () { return cleanEmail; });
          root.scrollIntoView({ block: 'start' });
        }, function (e) { busy(btn, false); show('bad', friendly(e)); });
      });
    },

    login: function () {
      var form = $('form'), email = $('#st-email'), pass = $('#st-pass'), btn = $('#st-submit'), resend = $('#st-resend');
      var next = new URLSearchParams(location.search).get('next');
      var dest = next && /^[a-z0-9\-\/]+\.html$/i.test(next) ? url(next) : url('account.html');
      sb.auth.getSession().then(function (r) { if (r.data.session) location.replace(dest); });
      wireResend(resend, function () { return email.value; });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); clearMsg(); resend.classList.add('st-hidden');
        var e1 = checkEmail(email.value); setErr(email, e1);
        var e2 = pass.value ? '' : 'Enter your password.'; setErr(pass, e2);
        if (e1) { email.focus(); return; } if (e2) { pass.focus(); return; }
        busy(btn, true, 'Logging in…');
        sb.auth.signInWithPassword({ email: email.value.trim().toLowerCase(), password: pass.value }).then(function (r) {
          busy(btn, false);
          if (r.error) {
            show('bad', friendly(r.error));
            if (/not confirmed/i.test(r.error.message)) resend.classList.remove('st-hidden');
            return;
          }
          location.href = dest;
        }, function (e) { busy(btn, false); show('bad', friendly(e)); });
      });
    },

    confirm: function () {
      var hash = new URLSearchParams(location.hash.replace(/^#/, '')), query = new URLSearchParams(location.search);
      var errDesc = hash.get('error_description') || query.get('error_description');
      var ok = $('#st-ok'), bad = $('#st-bad'), wait = $('#st-wait');
      function fail(text) { wait.classList.add('st-hidden'); bad.classList.remove('st-hidden'); show('bad', text); }
      if (errDesc) { fail(friendly(errDesc.replace(/\+/g, ' '))); }
      else {
        var settled = false;
        var finish = function (session) {
          if (settled || !session) return; settled = true;
          wait.classList.add('st-hidden'); ok.classList.remove('st-hidden');
          var n = (session.user.user_metadata || {}).full_name;
          $('[data-name]').textContent = n ? ', ' + n.split(' ')[0] : '';
          history.replaceState(null, '', location.pathname);
        };
        sb.auth.onAuthStateChange(function (_e, session) { finish(session); });
        sb.auth.getSession().then(function (r) { finish(r.data.session); });
        setTimeout(function () {
          if (!settled) fail('We could not confirm your email from this link. It may have expired or already been used. Log in to check, or request a new confirmation email below.');
        }, 6000);
      }
      var email = $('#st-email');
      wireResend($('#st-resend'), function () { return email.value; });
    },

    forgot: function () {
      var form = $('form'), email = $('#st-email'), btn = $('#st-submit');
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); clearMsg();
        var e = checkEmail(email.value); setErr(email, e); if (e) { email.focus(); return; }
        busy(btn, true, 'Sending…');
        sb.auth.resetPasswordForEmail(email.value.trim().toLowerCase(), { redirectTo: url('reset-password.html') }).then(function (r) {
          busy(btn, false);
          if (r.error) { show('bad', friendly(r.error)); return; }
          // Same message either way, so the form can't be used to find out who has an account
          show('good', 'If an account exists for ' + email.value.trim() + ', a password reset link is on its way. Check your inbox and spam folder.');
          form.reset();
        }, function (er) { busy(btn, false); show('bad', friendly(er)); });
      });
    },

    reset: function () {
      var form = $('form'), pass = $('#st-pass'), pass2 = $('#st-pass2'), btn = $('#st-submit');
      var errDesc = new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description');
      wirePasswordUI(pass, null);
      var ready = false;
      sb.auth.onAuthStateChange(function (evt, session) { if (session && (evt === 'PASSWORD_RECOVERY' || evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) ready = true; });
      sb.auth.getSession().then(function (r) {
        if (r.data.session) { ready = true; return; }
        setTimeout(function () { if (!ready) { show('bad', errDesc ? friendly(errDesc.replace(/\+/g, ' ')) : 'This reset link is invalid or has expired. Request a new one.'); form.classList.add('st-hidden'); $('#st-again').classList.remove('st-hidden'); } }, errDesc ? 0 : 4000);
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault(); clearMsg();
        var e1 = checkPassword(pass.value, ''); setErr(pass, e1);
        var e2 = pass2.value === pass.value ? '' : 'Passwords do not match.'; setErr(pass2, e2);
        if (e1) { pass.focus(); return; } if (e2) { pass2.focus(); return; }
        if (!ready) { show('bad', 'This reset link is invalid or has expired. Request a new one.'); return; }
        busy(btn, true, 'Saving…');
        sb.auth.updateUser({ password: pass.value }).then(function (r) {
          busy(btn, false);
          if (r.error) { show('bad', friendly(r.error)); return; }
          form.classList.add('st-hidden');
          show('good', 'Your password has been changed. You are now logged in.');
          $('#st-again').classList.add('st-hidden'); $('#st-continue').classList.remove('st-hidden');
          history.replaceState(null, '', location.pathname);
        }, function (er) { busy(btn, false); show('bad', friendly(er)); });
      });
    },

    account: function () {
      var box = $('#st-account'), wait = $('#st-wait');
      sb.auth.getSession().then(function (r) {
        var s = r.data.session;
        if (!s) { location.replace(url('login.html?next=account.html')); return; }
        return sb.auth.getUser().then(function (u) {
          if (u.error || !u.data.user) { sb.auth.signOut(); location.replace(url('login.html?next=account.html')); return; }
          var user = u.data.user, meta = user.user_metadata || {};
          var fmt = function (d) { return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'; };
          $('[data-hello]').textContent = meta.full_name ? meta.full_name.split(' ')[0] : 'there';
          $('[data-full-name]').textContent = meta.full_name || '—';
          $('[data-email]').textContent = user.email;
          $('[data-verified]').textContent = user.email_confirmed_at ? 'Confirmed ' + fmt(user.email_confirmed_at) : 'Not confirmed';
          $('[data-since]').textContent = fmt(user.created_at);
          wait.classList.add('st-hidden'); box.classList.remove('st-hidden');
        });
      });
      $('#st-logout').addEventListener('click', function () {
        var b = this; busy(b, true, 'Logging out…');
        sb.auth.signOut().then(function () { location.href = url('login.html'); });
      });
    }
  };
  if (pages[page]) pages[page]();
})();
