/* SocialTush QR code generator page. Everything runs in this browser tab: what you type is never sent
 * anywhere, stored or logged. Downloads are created locally from the real QR matrix (no watermark, no limits). */
import { buildPayload, makeQr, toSvg, drawCanvas, colorWarning } from './qr-core.js?v=1';

const $ = (id) => document.getElementById(id);
const form = $('qr-form'), typeSel = $('qr-type'), err = $('qr-err'), warn = $('qr-warn'), busy = $('qr-busy');
const preview = $('qr-preview'), encoded = $('qr-encoded'), meta = $('qr-meta');
const fg = $('qr-fg'), bg = $('qr-bg'), transparent = $('qr-transparent'), ecl = $('qr-ecl'), margin = $('qr-margin'), marginVal = $('qr-margin-val'), dlSize = $('qr-size');
const btnPng = $('qr-png'), btnSvg = $('qr-svg'), btnCopy = $('qr-copy'), btnShare = $('qr-share'), btnReset = $('qr-reset'), status = $('qr-status');
let current = null, timer = 0;

function fields() {
  const f = {};
  form.querySelectorAll('[data-f]').forEach((el) => { f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
  return f;
}
function style(px) { return { fg: fg.value, bg: bg.value, transparent: transparent.checked, margin: parseInt(margin.value, 10), px }; }
function slug() { return 'socialtush-qr-' + typeSel.value; }
function say(t, cls) { status.textContent = t; status.className = 'pwg-status' + (cls ? ' ' + cls : ''); }

function showType() {
  form.querySelectorAll('[data-type]').forEach((g) => { g.hidden = g.dataset.type !== typeSel.value; });
  document.querySelectorAll('.qr-type-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === typeSel.value)));
}

function render() {
  const p = buildPayload(typeSel.value, fields());
  warn.textContent = colorWarning(fg.value, bg.value, transparent.checked);
  if (!p.ok) {
    err.textContent = p.error; current = null; setButtons(false);
    preview.replaceChildren(Object.assign(document.createElement('p'), { className: 'qr-empty', textContent: 'Your QR code will appear here.' }));
    encoded.textContent = ''; meta.textContent = '';
    return;
  }
  let qr;
  try { qr = makeQr(p.text, ecl.value); } catch (e) { err.textContent = e.message; current = null; setButtons(false); return; }
  err.textContent = '';
  current = { qr, text: p.text };
  const c = document.createElement('canvas');
  drawCanvas(qr, c, style(640));
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'QR code for: ' + p.text.slice(0, 120));
  c.className = 'qr-canvas' + (transparent.checked ? ' qr-checker' : '');
  preview.replaceChildren(c);
  encoded.textContent = p.text;
  const n = qr.getModuleCount();
  meta.textContent = 'Version ' + ((n - 17) / 4) + ' · ' + n + '×' + n + ' modules · error correction ' + ecl.value + ' · ' + new TextEncoder().encode(p.text).length + ' bytes';
  setButtons(true);
}
function setButtons(on) { [btnPng, btnSvg, btnCopy, btnShare].forEach((b) => { if (b) b.disabled = !on; }); }
function schedule() {
  busy.hidden = false; clearTimeout(timer);
  timer = setTimeout(() => { render(); busy.hidden = true; }, 200);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function pngBlob() {
  return new Promise((resolve) => {
    const c = drawCanvas(current.qr, document.createElement('canvas'), style(parseInt(dlSize.value, 10)));
    c.toBlob((b) => resolve({ blob: b, size: c.width }), 'image/png');
  });
}
function svgBlob() { return new Blob([toSvg(current.qr, style(parseInt(dlSize.value, 10)))], { type: 'image/svg+xml' }); }

btnPng.addEventListener('click', async () => {
  if (!current) return;
  const { blob, size } = await pngBlob();
  download(blob, slug() + '-' + size + 'px.png'); say('PNG downloaded (' + size + '×' + size + ' px).', 'ok');
});
btnSvg.addEventListener('click', () => { if (!current) return; download(svgBlob(), slug() + '.svg'); say('SVG downloaded (scales to any size).', 'ok'); });
btnCopy.addEventListener('click', async () => {
  if (!current) return;
  try {
    const { blob } = await pngBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    say('QR code image copied. Paste it into a document or chat.', 'ok');
  } catch (e) {
    try { await navigator.clipboard.writeText(current.text); say('Your browser cannot copy images, so the QR content text was copied instead.', 'ok'); }
    catch (e2) { say('Copying is blocked in this browser. Use Download PNG instead.', 'bad'); }
  }
});
if (btnShare) btnShare.addEventListener('click', async () => {
  if (!current) return;
  const { blob } = await pngBlob();
  const file = new File([blob], slug() + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'QR code' });
    else { say('Sharing files is not supported in this browser. Use Download PNG instead.', 'bad'); }
  } catch (e) { if (e.name !== 'AbortError') say('Sharing failed. Use Download PNG instead.', 'bad'); }
});
btnReset.addEventListener('click', () => {
  form.reset(); fg.value = '#000000'; bg.value = '#ffffff'; transparent.checked = false; ecl.value = 'M'; margin.value = '4'; marginVal.textContent = '4'; dlSize.value = '1024';
  typeSel.value = 'url'; showType(); say(''); render(); form.querySelector('[data-type="url"] input').focus();
});

document.querySelectorAll('.qr-type-btn').forEach((b) => b.addEventListener('click', () => { typeSel.value = b.dataset.value; showType(); schedule(); const i = form.querySelector('[data-type="' + typeSel.value + '"] input, [data-type="' + typeSel.value + '"] textarea'); if (i) i.focus(); }));
typeSel.addEventListener('change', () => { showType(); schedule(); });
form.addEventListener('input', schedule);
form.addEventListener('change', schedule);
form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); render(); busy.hidden = true; if (current) say('QR code generated.', 'ok'); });
[fg, bg, transparent, ecl, margin, dlSize].forEach((el) => el.addEventListener('input', () => { marginVal.textContent = margin.value; schedule(); }));
if (!(navigator.share && navigator.canShare)) btnShare.hidden = true;
window.addEventListener('pagehide', () => { current = null; preview.replaceChildren(); encoded.textContent = ''; });

showType();
render();
