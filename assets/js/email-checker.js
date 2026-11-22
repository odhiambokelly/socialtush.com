/* SocialTush email checker page. Asks the email-check Edge Function (server-side, can use a verification
 * API key); if it is unavailable, runs the same real checks in the browser (DNS-over-HTTPS, local disposable
 * database, Kickbox Open, DeBounce, mailcheck.ai). Results always come from those checks. */
import { parseEmail, checkEmail } from './email-core.js?v=2';

const cfg = window.SOCIALTUSH_AUTH || {};
const ENDPOINT = (cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/email-check';
const LIST_URL = new URL('assets/data/disposable-domains.txt', document.querySelector('script[src*="email-checker.js"]').src.replace(/assets\/js\/.*$/, '')).href;
const $ = (s, el = document) => el.querySelector(s);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

async function viaServer(email) {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(ENDPOINT + '?email=' + encodeURIComponent(email), { signal: ctl.signal, headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey } });
    const j = await r.json().catch(() => null);
    if (r.status === 200 && j && j.ok) return j;
    if ((r.status === 400 || r.status === 429 || r.status === 403) && j && j.error) return { ok: false, error: j.error };
  } catch (e) { /* not deployed / offline: fall back */ } finally { clearTimeout(t); }
  return null;
}
async function run(email) {
  const s = await viaServer(email);
  if (s) return s;
  const d = await checkEmail(email, { listUrl: LIST_URL, timeoutMs: 7000 });
  d.mode = 'browser';
  return d;
}

const YES = (b) => (b === true ? 'Yes' : b === false ? 'No' : 'Not checked');
function badge(text, color) { return el('span', { class: 'emc-badge emc-' + color, text }); }

function render(d) {
  const disp = d.disposable, del = d.deliverability, di = d.domainInfo || {}, c = d.classification || {}, smtp = d.smtp || {};
  const head = el('div', { class: 'emc-head' },
    el('div', { class: 'ipc-k', text: 'Email address checked' }),
    el('div', { class: 'emc-email', text: d.email }),
    el('div', { class: 'ipc-meta' }, el('span', { text: 'Checked ' + new Date(d.checked_at).toLocaleString() + (d.cached ? ' (cached)' : '') }),
      el('span', { class: 'ipc-pill', text: 'Risk: ' + d.risk })));
  const verdicts = el('div', { class: 'emc-verdicts' },
    el('div', { class: 'emc-verdict emc-' + disp.color, role: 'status' },
      el('span', { class: 'ipc-icon', 'aria-hidden': 'true', text: disp.disposable ? '✕' : '✓' }),
      el('div', {}, el('div', { class: 'ipc-status-k', text: 'DISPOSABLE CHECK' }), el('div', { class: 'ipc-status-v', text: (disp.disposable ? '🔴 ' : '🟢 ') + disp.label }))),
    el('div', { class: 'emc-verdict emc-' + del.color, role: 'status' },
      el('span', { class: 'ipc-icon', 'aria-hidden': 'true', text: del.color === 'green' ? '✓' : del.color === 'red' ? '✕' : '!' }),
      el('div', {}, el('div', { class: 'ipc-status-k', text: 'DELIVERABILITY' }), el('div', { class: 'ipc-status-v', text: del.label }))));
  const card = el('article', { class: 'ipc-card emc-card ipc-' + (disp.disposable || del.color === 'red' ? 'red' : del.color), 'aria-label': 'Results for ' + d.email }, head, verdicts);
  if (d.suggestion) {
    const b = el('button', { type: 'button', class: 'emc-suggest', text: d.suggestion });
    b.addEventListener('click', () => { input.value = d.suggestion; form.requestSubmit(); });
    card.append(el('p', { class: 'emc-did' }, 'Did you mean ', b, '?'));
  }
  const reasons = [...del.reasons];
  if (disp.disposable) reasons.unshift('Flagged as disposable by: ' + disp.detectedBy.join('; ') + '.');
  else reasons.unshift('Not found as disposable by: ' + disp.clearedBy.join('; ') + '.');
  if (disp.note) reasons.push(disp.note);
  card.append(el('ul', { class: 'ipc-reasons' }, ...reasons.map((r) => el('li', { text: r }))));

  const mxList = di.mx && di.mx.length ? di.mx.slice(0, 5).map((m) => m.pref + ' ' + m.host).join('\n') : di.nullMx ? 'Null MX (does not accept email)' : 'None';
  const rows = [
    ['Domain', d.domain],
    ['Domain exists', di.exists === true ? badge('Yes', 'green') : di.exists === false ? badge('No (NXDOMAIN)', 'red') : badge('Could not check', 'yellow')],
    ['Email provider', di.provider || '—'],
    ['MX records', di.mx && di.mx.length ? badge('Found (' + di.mx.length + ')', 'green') : badge(di.nullMx ? 'Null MX' : 'None', 'red')],
    ['SPF record', di.spf ? badge('Present', 'green') : badge('Missing', 'yellow')],
    ['DMARC record', di.dmarc ? badge('Present', 'green') : badge('Missing', 'yellow')],
    ['SMTP mailbox check', smtp.checked ? (smtp.valid ? badge('Mailbox confirmed', 'green') : badge('Not confirmed', 'red')) : badge('Not checked', 'yellow')],
    ['Catch-all domain', smtp.checked ? (smtp.catchAll ? badge('Yes', 'yellow') : badge('No', 'green')) : badge('Not checked', 'yellow')],
    ['Role-based address', c.role ? badge('Yes (' + d.local.toLowerCase() + '@)', 'yellow') : badge('No', 'green')],
    ['Email type', c.free ? 'Free provider' : d.disposable.disposable ? 'Disposable' : 'Business / custom domain'],
    ['Spam / abuse domain', c.spam === true ? badge('Yes', 'red') : c.spam === false ? badge('No', 'green') : badge('Not checked', 'yellow')],
    ['Domain age', di.ageDays != null ? Math.round(di.ageDays / 365 * 10) / 10 + ' years' : '—'],
  ];
  const grid = el('dl', { class: 'ipc-grid emc-grid' });
  for (const [k, v] of rows) grid.append(el('div', {}, el('dt', { text: k }), el('dd', {}, v)));
  card.append(el('h3', { class: 'ipc-h', text: 'Technical results' }), grid);
  const tech = el('details', { class: 'ipc-sources' }, el('summary', { text: 'DNS records and data sources' }),
    el('pre', { class: 'emc-pre', text: 'MX:\n' + mxList + '\n\nSPF: ' + (di.spf || 'none') + '\nDMARC: ' + (di.dmarc || 'none') + '\nDNS resolver: ' + (di.dnsVia || '—') }),
    el('ul', {}, ...(d.sources || []).map((s) => el('li', {}, el('strong', { text: s.name }), ' (' + s.role + '): ', el('span', { class: 'ipc-src-' + (s.status === 'ok' ? 'ok' : 'bad'), text: s.status })))),
    el('p', { class: 'ipc-loc-note', text: smtp.checked ? 'Mailbox verified by an SMTP-level check.' : (smtp.reason || '') + ' Valid MX records show the domain can receive email; they do not prove this mailbox exists.' }));
  card.append(tech);
  const copy = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Copy results' });
  const again = el('button', { type: 'button', class: 'btn btn-primary', text: 'Check another email' });
  copy.addEventListener('click', () => copyText(summaryText(d, rows), copy));
  again.addEventListener('click', reset);
  card.append(el('div', { class: 'emc-actions' }, copy, again));
  return card;
}

function summaryText(d, rows) {
  const val = (v) => (typeof v === 'string' ? v : v && v.textContent) || '';
  return ['SocialTush Email Checker: ' + d.email, 'Checked: ' + new Date(d.checked_at).toLocaleString(),
    'Disposable: ' + d.disposable.label, 'Deliverability: ' + d.deliverability.label, 'Risk: ' + d.risk,
    ...rows.map(([k, v]) => k + ': ' + val(v)), '', ...d.deliverability.reasons].join('\n');
}
function copyText(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = t), 1800); };
  const fallback = () => { const ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Copy failed'; } ta.remove(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

// ---------- page ----------
const form = $('#emc-form'), input = $('#emc-input'), err = $('#emc-err'), out = $('#emc-result'), btn = $('#emc-btn');
function reset() { out.replaceChildren(); input.value = ''; err.textContent = ''; input.removeAttribute('aria-invalid'); input.focus(); }
input.addEventListener('input', () => { if (err.textContent) { err.textContent = ''; input.removeAttribute('aria-invalid'); } });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = parseEmail(input.value);
  if (!p.ok) { err.textContent = p.error; input.setAttribute('aria-invalid', 'true'); input.focus(); out.replaceChildren(); return; }
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Checking…';
  out.replaceChildren(el('div', { class: 'ipc-loading', role: 'status' }, el('span', { class: 'ipc-spin', 'aria-hidden': 'true' }), 'Checking ' + p.email + ': DNS, mail servers and disposable databases…'));
  let d;
  try { d = await run(p.email); } catch (x) { d = { ok: false, error: 'The check could not be completed. Please try again.' }; }
  btn.disabled = false; btn.textContent = label;
  out.replaceChildren(d.ok ? render(d) : el('div', { class: 'ipc-card ipc-yellow', role: 'alert' }, el('strong', { text: 'Could not check this email. ' }), d.error));
  out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});
document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { input.value = b.getAttribute('data-try'); form.requestSubmit(); }));
