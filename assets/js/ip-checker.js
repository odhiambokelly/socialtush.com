/* SocialTush IP checker page. Talks to the ip-check Supabase Edge Function (server-side API calls).
 * If that service is unreachable, it falls back to ipapi.is (browser-safe, location only) and
 * shows the VPN status as INCONCLUSIVE, never as "no VPN". */
import { validatePublicIp, normalizeIp, ipVersion, parseIpapi, parseBlackbox, parseOnionoo, combine } from './ipcheck-core.js?v=2';

const cfg = window.SOCIALTUSH_AUTH || {};
const ENDPOINT = (cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/ip-check';
const TIMEOUT_MS = 15000;
const $ = (s, el = document) => el.querySelector(s);

const ICON = { green: '✓', red: '✕', yellow: '!' };
const CHECK_TEXT = { detected: 'Detected', clear: 'Not detected', disagree: 'Detected', unknown: 'Not checked' };
const CHECK_COLOR = { detected: 'red', clear: 'green', disagree: 'yellow', unknown: 'yellow' };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

async function fetchJson(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    let body = null; try { body = await r.json(); } catch { /* ignore */ }
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: null, error: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(t); }
}

/** Ask the server-side checker; on outage fall back to location-only data from ipapi.is. */
async function check(ip) {
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const url = ENDPOINT + (ip ? '?ip=' + encodeURIComponent(ip) : '');
    const r = await fetchJson(url, { headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey } });
    if (r.status === 200 && r.body && r.body.ok) return r.body;
    if ((r.status === 400 || r.status === 429 || r.status === 403) && r.body && r.body.error) return { ok: false, error: r.body.error };
  }
  // Fallback (server unavailable): browser-safe public APIs that allow cross-origin requests.
  //   ipapi.is -> your public IP, ISP, location; blackbox.ipinfo.app -> VPN/proxy; Onionoo -> Tor exit relays.
  const fb = await fetchJson('https://api.ipapi.is/' + (ip ? '?q=' + encodeURIComponent(ip) : ''));
  const ia = fb.status === 200 ? parseIpapi(fb.body) : { ok: false };
  const theIp = ia.ok ? normalizeIp(fb.body.ip) : ip;
  if (!theIp) return { ok: false, error: 'We could not detect your IP address right now. Please try again in a moment.' };
  const [bbRes, onRes] = await Promise.all([
    fetchText('https://blackbox.ipinfo.app/lookup/' + encodeURIComponent(theIp)),
    fetchJson('https://onionoo.torproject.org/details?search=' + encodeURIComponent(theIp) + '&fields=or_addresses,exit_addresses,flags,running&limit=20'),
  ]);
  const bb = bbRes.status === 200 ? parseBlackbox(bbRes.body) : { ok: false };
  const onion = onRes.status === 200 ? parseOnionoo(onRes.body, theIp) : { ok: false };
  const verdict = combine({ ok: false }, ia, null, { bb, onion });
  return {
    ok: true, fallback: true, ip: theIp, version: ipVersion(theIp) === 6 ? 'IPv6' : 'IPv4', checked_at: new Date().toISOString(),
    verdict,
    details: ia.ok ? { isp: ia.isp, asn: ia.asn, country: ia.country, countryCode: (ia.countryCode || '').toUpperCase() || null, region: ia.region, city: ia.city } : {},
    sources: [
      { name: 'blackbox.ipinfo.app', role: 'VPN / proxy / data-centre detection', status: bb.ok ? 'ok' : 'unavailable' },
      { name: 'Tor Project Onionoo', role: 'Running Tor exit relays', status: onion.ok ? 'ok' : 'unavailable' },
      { name: 'ipapi.is', role: 'IP address, ISP and location', status: ia.ok ? 'ok' : 'unavailable' },
    ],
    is_you: !ip,
  };
}

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { const r = await fetch(url, { signal: ctl.signal }); return { status: r.status, body: await r.text() }; }
  catch { return { status: 0, body: '' }; }
  finally { clearTimeout(t); }
}

/** Retry once if no detection source answered, so visitors get a real VPN / NO VPN result. */
async function checkWithRetry(ip) {
  let d = await check(ip);
  if (d.ok && d.verdict.status === 'failed') { await new Promise((r) => setTimeout(r, 2500)); d = await check(ip); }
  return d;
}

function flag(cc, country) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return null;
  return el('img', { class: 'ipc-flag', src: 'https://flagcdn.com/w40/' + cc.toLowerCase() + '.png', width: '28', height: '21',
    alt: 'Flag of ' + (country || cc), loading: 'lazy', decoding: 'async' });
}

function render(data, { you = false } = {}) {
  const v = data.verdict, d = data.details || {};
  const card = el('article', { class: 'ipc-card ipc-' + v.color, 'aria-label': 'Results for ' + data.ip });
  const status = el('div', { class: 'ipc-status' },
    el('span', { class: 'ipc-icon', 'aria-hidden': 'true', text: ICON[v.color] }),
    el('div', {}, el('div', { class: 'ipc-status-k', text: 'VPN STATUS' }), el('div', { class: 'ipc-status-v', text: v.label })));
  const head = el('div', { class: 'ipc-head' },
    el('div', {}, el('div', { class: 'ipc-k', text: you ? 'Your public IP address' : 'IP address checked' }),
      el('div', { class: 'ipc-ip', text: data.ip }),
      el('div', { class: 'ipc-meta' }, el('span', { class: 'ipc-pill', text: data.version }),
        el('span', { text: 'Last checked ' + new Date(data.checked_at).toLocaleString() + (data.cached ? ' (cached)' : '') }))),
    status);
  const checks = el('ul', { class: 'ipc-checks', 'aria-label': 'Detection results' });
  for (const [k, label] of [['vpn', 'VPN'], ['proxy', 'Proxy'], ['tor', 'Tor']]) {
    const s = (v.checks && v.checks[k]) || 'unknown';
    checks.append(el('li', { class: 'ipc-chip ipc-' + CHECK_COLOR[s] }, el('strong', { text: label }), el('span', { text: CHECK_TEXT[s] })));
  }
  const reasons = el('ul', { class: 'ipc-reasons' }, ...(v.reasons || []).map((r) => el('li', { text: r })));
  const place = [d.city, d.region, d.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  const rows = [
    ['Country', d.country ? el('span', { class: 'ipc-country' }, flag(d.countryCode, d.country), d.country) : null],
    ['Region / city', place || null], ['ISP', d.isp], ['Organization', d.organisation], ['ASN', d.asn],
    ['Connection type', d.connectionType], ['VPN / proxy operator', d.operator], ['IP version', data.version],
  ].filter(([, x]) => x);
  const grid = el('dl', { class: 'ipc-grid' });
  for (const [k, x] of rows) grid.append(el('div', {}, el('dt', { text: k }), el('dd', {}, x)));
  const src = el('details', { class: 'ipc-sources' }, el('summary', { text: 'Data sources for this result' }),
    el('ul', {}, ...(data.sources || []).map((s) => el('li', {}, el('strong', { text: s.name }), ' (' + s.role + '): ', el('span', { class: 'ipc-src-' + (s.status === 'ok' ? 'ok' : 'bad'), text: s.status })))));
  card.append(head, checks, reasons, grid, src);
  return card;
}

function errorCard(msg) { return el('div', { class: 'ipc-card ipc-yellow ipc-error', role: 'alert' }, el('strong', { text: 'Could not check this IP. ' }), msg); }
function loading(text) { return el('div', { class: 'ipc-loading', role: 'status' }, el('span', { class: 'ipc-spin', 'aria-hidden': 'true' }), text); }

// ---------- page ----------
const mine = $('#ipc-mine'), form = $('#ipc-form'), input = $('#ipc-input'), err = $('#ipc-err'), out = $('#ipc-results'), btn = $('#ipc-btn');
const cacheGet = (ip) => { try { const c = JSON.parse(sessionStorage.getItem('ipc:' + ip) || 'null'); return c && Date.now() - c.t < 600e3 ? c.d : null; } catch { return null; } };
const cachePut = (ip, d) => { try { if (!d.fallback && d.verdict.status !== 'failed') sessionStorage.setItem('ipc:' + ip, JSON.stringify({ t: Date.now(), d })); } catch { /* ignore */ } };

(async () => {
  mine.replaceChildren(loading('Detecting your public IP address…'));
  const data = await checkWithRetry('');
  mine.replaceChildren(data.ok ? render(data, { you: true }) : errorCard(data.error));
  if (data.ok) input.placeholder = 'e.g. ' + (data.version === 'IPv6' ? '2001:4860:4860::8888' : '8.8.8.8');
})();

input.addEventListener('input', () => { if (err.textContent) { err.textContent = ''; input.removeAttribute('aria-invalid'); } });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ip = normalizeIp(input.value);
  const bad = validatePublicIp(ip);
  if (bad) { err.textContent = bad; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Checking…';
  const slot = loading('Checking ' + ip + '…');
  out.prepend(slot);
  const data = cacheGet(ip) || await checkWithRetry(ip);
  if (data.ok) cachePut(ip, data);
  slot.replaceWith(data.ok ? render(data) : errorCard(data.error));
  btn.disabled = false; btn.textContent = label;
  while (out.children.length > 10) out.lastElementChild.remove();
  input.select();
});
document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { input.value = b.getAttribute('data-try'); form.requestSubmit(); }));
