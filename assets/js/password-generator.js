/* SocialTush password generator page. Everything happens in this browser tab:
 * passwords are never sent anywhere, logged, stored or put in the URL, and are wiped when you leave. */
import { MIN_LEN, MAX_LEN, buildGroups, checkOptions, generate, strength } from './password-core.js?v=1';

const $ = (id) => document.getElementById(id);
const out = $('pwg-out'), toggle = $('pwg-toggle'), copyBtn = $('pwg-copy'), newBtn = $('pwg-new'), status = $('pwg-status'), err = $('pwg-err');
const range = $('pwg-len'), num = $('pwg-len-num');
const boxes = { lower: $('pwg-lower'), upper: $('pwg-upper'), digits: $('pwg-digits'), symbols: $('pwg-symbols') };
const similar = $('pwg-similar'), ambiguous = $('pwg-ambiguous'), customOn = $('pwg-custom-on'), custom = $('pwg-custom'), count = $('pwg-count');
const list = $('pwg-list'), recentWrap = $('pwg-recent-wrap'), recent = $('pwg-recent');
const meter = $('pwg-meter-bar'), sLabel = $('pwg-strength'), sDesc = $('pwg-desc'), sLen = $('pwg-s-len'), sTypes = $('pwg-s-types'), sBits = $('pwg-s-bits'), sCrack = $('pwg-s-crack');

let current = '', shownAt = 0, copied = false, timer = 0;
const history = [];                       // in memory only, this tab, max 5

function options() {
  return {
    lower: boxes.lower.checked, upper: boxes.upper.checked, digits: boxes.digits.checked, symbols: boxes.symbols.checked,
    excludeSimilar: similar.checked, excludeAmbiguous: ambiguous.checked,
    custom: customOn.checked ? custom.value : '',
  };
}
function length() { const n = parseInt(num.value, 10); return Number.isFinite(n) ? n : NaN; }

function say(text, kind) { status.textContent = text; status.className = 'pwg-status' + (kind ? ' ' + kind : ''); }

function keepPrevious() {
  // Keep the password being replaced if the visitor had time to see it or copied it, so nothing is lost.
  if (current && (copied || Date.now() - shownAt > 1500) && history[0] !== current) {
    history.unshift(current); history.length = Math.min(history.length, 5); renderRecent();
  }
}

function regenerate({ keep = true } = {}) {
  const len = length(), opts = options();
  const problem = checkOptions(len, opts);
  err.textContent = problem;
  num.setAttribute('aria-invalid', problem && /length|long/.test(problem) ? 'true' : 'false');
  if (problem) { copyBtn.disabled = !current; return; }
  if (keep) keepPrevious();
  const n = Math.max(1, Math.min(10, parseInt(count.value, 10) || 1));
  const pws = []; for (let i = 0; i < n; i++) pws.push(generate(len, opts));
  current = pws[0]; shownAt = Date.now(); copied = false;
  out.value = current;
  copyBtn.disabled = false;
  showStrength(current, opts);
  renderList(pws);
  say('');
}

function showStrength(pw, opts) {
  const pool = new Set(buildGroups(opts).join('')).size;
  const s = strength(pw, pool);
  meter.style.width = (25 * (s.level + 1)) + '%';
  meter.style.background = s.color;
  sLabel.textContent = s.label; sLabel.style.color = s.color;
  sDesc.textContent = s.description;
  sLen.textContent = s.length + ' characters';
  sTypes.textContent = s.types.length ? s.types.join(', ') : '—';
  sBits.textContent = s.bits + ' bits (from a pool of ' + pool + ' characters)';
  sCrack.textContent = s.crack;
  $('pwg-meter').setAttribute('aria-valuenow', String(s.level + 1));
  $('pwg-meter').setAttribute('aria-valuetext', s.label + ', about ' + s.bits + ' bits of entropy');
}

function copyText(text, onDone) {
  const ok = () => onDone(true), fail = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let good = false; try { good = document.execCommand('copy'); } catch (e) { good = false; }
    ta.value = ''; ta.remove(); onDone(good);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fail); else fail();
}
function flash(btn, text) { const t = btn.dataset.label || btn.textContent; btn.dataset.label = t; btn.textContent = text; clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = t; }, 1800); }

function itemRow(pw, label) {
  const li = document.createElement('li');
  const code = document.createElement('code'); code.textContent = pw; code.className = 'pwg-item-pw' + (out.type === 'password' ? ' masked' : '');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost pwg-mini'; b.textContent = 'Copy';
  b.setAttribute('aria-label', 'Copy ' + label);
  b.addEventListener('click', () => copyText(pw, (good) => { flash(b, good ? 'Copied ✓' : 'Copy failed'); say(good ? 'Copied successfully.' : 'Copy failed. Select the password and press Ctrl+C.', good ? 'ok' : 'bad'); }));
  li.append(code, b);
  return li;
}
function renderList(pws) {
  list.replaceChildren();
  $('pwg-list-wrap').hidden = pws.length < 2;
  if (pws.length < 2) return;
  pws.forEach((pw, i) => list.appendChild(itemRow(pw, 'password ' + (i + 1))));
}
function renderRecent() {
  recent.replaceChildren(...history.map((pw, i) => itemRow(pw, 'recent password ' + (i + 1))));
  recentWrap.hidden = history.length === 0;
}

// ---------- events ----------
copyBtn.addEventListener('click', () => {
  if (!current) return;
  copyText(current, (good) => {
    if (good) { copied = true; flash(copyBtn, 'Copied ✓'); say('Copied successfully. You can copy it again or generate a new one.', 'ok'); }
    else { say('Your browser blocked copying. Click "Show", select the password and press Ctrl+C (or long-press on mobile).', 'bad'); }
  });
});
newBtn.addEventListener('click', () => regenerate());
toggle.addEventListener('click', () => {
  const show = out.type === 'password';
  out.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Hide' : 'Show';
  toggle.setAttribute('aria-pressed', String(show));
  document.querySelectorAll('.pwg-item-pw').forEach((c) => c.classList.toggle('masked', !show));
});
function onLength(v) {
  const n = Math.max(MIN_LEN, Math.min(MAX_LEN, parseInt(v, 10) || MIN_LEN));
  range.value = String(n); num.value = String(n);
  document.querySelectorAll('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n)));
  schedule();
}
function schedule() { clearTimeout(timer); timer = setTimeout(() => regenerate(), 120); }
range.addEventListener('input', () => onLength(range.value));
num.addEventListener('change', () => onLength(num.value));
num.addEventListener('input', () => { const n = parseInt(num.value, 10); if (n >= MIN_LEN && n <= MAX_LEN) { range.value = String(n); schedule(); } });
document.querySelectorAll('[data-len]').forEach((b) => b.addEventListener('click', () => onLength(b.dataset.len)));
Object.values(boxes).concat([similar, ambiguous, count]).forEach((c) => c.addEventListener('change', schedule));
customOn.addEventListener('change', () => {
  custom.disabled = !customOn.checked;
  Object.values(boxes).forEach((b) => { b.disabled = customOn.checked; });
  document.getElementById('pwg-types').classList.toggle('disabled', customOn.checked);
  if (customOn.checked) custom.focus();
  schedule();
});
custom.addEventListener('input', () => { if (customOn.checked) schedule(); });
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = b.dataset.preset;
  customOn.checked = false; custom.disabled = true; Object.values(boxes).forEach((x) => { x.disabled = false; });
  document.getElementById('pwg-types').classList.remove('disabled');
  boxes.lower.checked = p !== 'numbers'; boxes.upper.checked = p !== 'numbers';
  boxes.digits.checked = p === 'numbers' || p === 'all'; boxes.symbols.checked = p === 'all';
  regenerate();
}));
$('pwg-recent-clear').addEventListener('click', () => { history.length = 0; renderRecent(); say('Recent passwords cleared.', 'ok'); });

// Wipe everything when the visitor leaves (also covers the back/forward cache).
window.addEventListener('pagehide', () => { out.value = ''; current = ''; history.length = 0; list.replaceChildren(); recent.replaceChildren(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) regenerate({ keep: false }); });

range.min = num.min = String(MIN_LEN); range.max = num.max = String(MAX_LEN);
onLength(num.value || 16);
clearTimeout(timer); regenerate({ keep: false });
