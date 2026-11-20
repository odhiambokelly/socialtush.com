/* SocialTush forms: contact, order, booking, affiliate.
 * Sends to the submit-inquiry Supabase Edge Function, which stores the request,
 * emails support@socialtush.com and sends the customer a confirmation. */
(function () {
  'use strict';
  var cfg = window.SOCIALTUSH_AUTH || {};
  var ENDPOINT = (cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/submit-inquiry';
  var SUPPORT = 'support@socialtush.com';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

  function session() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || 'null');
          if (v && v.access_token && v.expires_at * 1000 > Date.now()) return v;
        }
      }
    } catch (e) {}
    return null;
  }

  function setErr(field, msg) {
    var box = field.closest('.f-field'); if (!box) return;
    var e = box.querySelector('.f-err');
    field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (e) e.textContent = msg || '';
  }

  function validate(form) { return check(Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'))); }
  function check(fields) {
    var bad = null;
    fields.forEach(function (f) {
      if (f.type === 'hidden' || f.name === 'website' || f.disabled) return;
      var v = (f.value || '').trim(), msg = '';
      if (f.required && !v) msg = f.dataset.required || 'This field is required.';
      else if (v && f.type === 'email' && !EMAIL_RE.test(v)) msg = 'Enter a valid email address, like name@example.com.';
      else if (v && f.name === 'phone' && !/^[+\d][\d\s().-]{5,29}$/.test(v)) msg = 'Enter a valid phone number, e.g. +254 712 345 678.';
      else if (v && f.minLength > 0 && v.length < f.minLength) msg = 'Please write at least ' + f.minLength + ' characters.';
      else if (v && f.type === 'date' && f.min && v < f.min) msg = 'Choose a date from ' + f.min + ' onwards.';
      else if (v && f.type === 'date' && f.max && v > f.max) msg = 'Choose a date before ' + f.max + '.';
      setErr(f, msg);
      if (msg && !bad) bad = f;
    });
    return bad;
  }

  function init(form) {
    var kind = form.getAttribute('data-inquiry');
    var started = Date.now();
    var status = form.querySelector('.f-status');
    var btn = form.querySelector('button[type=submit]');
    var done = document.getElementById(form.getAttribute('data-done'));

    // prefill from the URL (?service=...) and the logged-in account
    var params = new URLSearchParams(location.search);
    var svc = form.querySelector('[name=service]');
    if (svc && params.get('service')) {
      var want = params.get('service').toLowerCase();
      Array.prototype.forEach.call(svc.options, function (o) { if (o.value.toLowerCase() === want || o.dataset.slug === want) svc.value = o.value; });
    }
    var s = session();
    if (s && s.user) {
      var meta = s.user.user_metadata || {};
      var n = form.querySelector('[name=name]'), e = form.querySelector('[name=email]');
      if (n && !n.value && meta.full_name) n.value = meta.full_name;
      if (e && !e.value && s.user.email) e.value = s.user.email;
    }
    // booking: earliest date is tomorrow, latest 6 months ahead; fill time zone
    form.querySelectorAll('input[type=date][data-future]').forEach(function (d) {
      var t = new Date(); t.setDate(t.getDate() + 1);
      var m = new Date(); m.setDate(m.getDate() + 180);
      d.min = t.toISOString().slice(0, 10); d.max = m.toISOString().slice(0, 10);
    });
    var tz = form.querySelector('[name=timezone]');
    if (tz) { try { tz.value = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (x) {} }

    form.querySelectorAll('input, select, textarea').forEach(function (f) {
      f.addEventListener('blur', function () { if (f.getAttribute('aria-invalid') === 'true' || f.value) check([f]); });
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      status.className = 'f-status'; status.textContent = '';
      var bad = validate(form);
      if (bad) { bad.focus(); return; }
      if (form.website && form.website.value) return;
      if (Date.now() - started < 3000) { status.className = 'f-status bad'; status.textContent = 'Please take a moment to check your details, then send again.'; return; }

      var data = { kind: kind, started_at: started, website: '', details: {} };
      new FormData(form).forEach(function (v, k) {
        if (k === 'website') return;
        if (k.indexOf('detail:') === 0) data.details[form.querySelector('[name="' + k + '"]').getAttribute('data-label') || k.slice(7)] = String(v).trim();
        else data[k] = String(v).trim();
      });

      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) { fallback('The form service is not connected yet.'); return; }
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';
      var ses = session();
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + (ses ? ses.access_token : cfg.supabaseAnonKey) },
        body: JSON.stringify(data)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
      }).then(function (res) {
        btn.disabled = false; btn.textContent = label;
        if (res.status === 200 && res.body.ok) {
          form.hidden = true;
          if (done) {
            done.hidden = false;
            done.querySelectorAll('[data-ref]').forEach(function (el) { el.textContent = res.body.ref; });
            done.querySelectorAll('[data-email]').forEach(function (el) { el.textContent = data.email; });
            var note = done.querySelector('[data-mailnote]');
            if (note && !res.body.email_sent) note.textContent = 'Your request is saved, but our confirmation email could not be sent right now. We will still get back to you.';
            done.scrollIntoView({ block: 'center' });
            done.focus();
          }
          return;
        }
        if (res.status === 404) { fallback('The form service is not set up yet.'); return; }
        status.className = 'f-status bad';
        status.textContent = res.body.error || res.body.message || 'Something went wrong. Please try again.';
      }).catch(function () {
        btn.disabled = false; btn.textContent = label;
        fallback('We could not reach our server.');
      });

      function fallback(why) {
        var lines = Object.keys(data).filter(function (k) { return ['kind', 'started_at', 'website', 'details'].indexOf(k) === -1 && data[k]; })
          .map(function (k) { return k.replace(/_/g, ' ') + ': ' + data[k]; });
        Object.keys(data.details).forEach(function (k) { if (data.details[k]) lines.push(k + ': ' + data.details[k]); });
        var href = 'mailto:' + SUPPORT + '?subject=' + encodeURIComponent('SocialTush ' + kind + ' request from ' + (data.name || '')) + '&body=' + encodeURIComponent(lines.join('\n'));
        status.className = 'f-status bad';
        status.innerHTML = '';
        status.appendChild(document.createTextNode(why + ' Please '));
        var a = document.createElement('a'); a.href = href; a.textContent = 'email your request to ' + SUPPORT; status.appendChild(a);
        status.appendChild(document.createTextNode(' instead (we have filled it in for you), or call +254-727424569.'));
      }
    });
  }

  document.querySelectorAll('form[data-inquiry]').forEach(init);
})();
