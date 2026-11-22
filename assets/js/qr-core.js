/* SocialTush QR code generator: content formats + rendering. Runs entirely in the browser.
 * QR encoding: qrcode-generator 2.0.4 by Kazuhiko Arase (MIT), self-hosted in assets/vendor/. */
import qrcode from '../vendor/qrcode-generator-2.0.4.js';

// Encode text as UTF-8 (the library's default keeps only the low byte of each character).
qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

const enc = encodeURIComponent;
const trim = (v) => String(v == null ? '' : v).trim();
const ok = (text) => ({ ok: true, text });
const bad = (error) => ({ ok: false, error });

/** Escape for Wi-Fi QR fields: \ ; , : " are escaped with a backslash. */
export function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }
/** Escape for vCard 3.0 text values. */
export function vcardEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
/** Phone number: keep a leading + and digits only. */
export function cleanPhone(s) { const t = trim(s); return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, ''); }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Build the exact text that goes into the QR code.
 * Returns { ok: true, text } or { ok: false, error } (message for the visitor).
 */
export function buildPayload(type, f) {
  f = f || {};
  switch (type) {
    case 'url': {
      let u = trim(f.url);
      if (!u) return bad('Enter a website address.');
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      let p; try { p = new URL(u); } catch (e) { return bad('Enter a valid website address, like https://example.com.'); }
      if (!/^https?:$/.test(p.protocol) || !p.hostname.includes('.')) return bad('Enter a valid website address, like https://example.com.');
      return ok(u);
    }
    case 'text': { const t = String(f.text || ''); return t.trim() ? ok(t) : bad('Enter some text.'); }
    case 'custom': { const t = String(f.custom || ''); return t.trim() ? ok(t) : bad('Enter the text or link to encode.'); }
    case 'email': {
      const a = trim(f.email);
      if (!EMAIL_RE.test(a)) return bad('Enter a valid email address.');
      const q = [];
      if (trim(f.subject)) q.push('subject=' + enc(trim(f.subject)));
      if (trim(f.body)) q.push('body=' + enc(String(f.body)));
      return ok('mailto:' + a + (q.length ? '?' + q.join('&') : ''));
    }
    case 'phone': {
      const n = cleanPhone(f.phone);
      if (n.replace('+', '').length < 3 || n.replace('+', '').length > 20) return bad('Enter a valid phone number.');
      return ok('tel:' + n);
    }
    case 'whatsapp': {
      const n = trim(f.wa).replace(/\D/g, '');
      if (n.length < 8 || n.length > 15) return bad('Enter the full WhatsApp number with country code, e.g. 254712345678.');
      if (n.startsWith('0')) return bad('Start with the country code instead of 0, e.g. 254712345678 for Kenya.');
      const m = String(f.waMsg || '');
      return ok('https://wa.me/' + n + (m.trim() ? '?text=' + enc(m) : ''));
    }
    case 'sms': {
      const n = cleanPhone(f.smsPhone);
      if (n.replace('+', '').length < 3) return bad('Enter the phone number to send the SMS to.');
      return ok('SMSTO:' + n + ':' + String(f.smsMsg || ''));
    }
    case 'wifi': {
      const ssid = String(f.ssid || '');
      if (!ssid.trim()) return bad('Enter the network name (SSID).');
      const sec = f.security === 'WEP' ? 'WEP' : f.security === 'nopass' ? 'nopass' : 'WPA';
      const pass = String(f.wifiPass || '');
      if (sec !== 'nopass' && !pass) return bad('Enter the Wi-Fi password, or choose "No password (open network)".');
      if (sec === 'WPA' && (pass.length < 8 || pass.length > 63)) return bad('WPA/WPA2 passwords are 8 to 63 characters.');
      if (sec === 'WEP' && ![5, 13, 16, 10, 26, 32].includes(pass.length)) return bad('WEP keys are 5, 13 or 16 characters (or 10, 26 or 32 hex digits).');
      return ok('WIFI:T:' + sec + ';S:' + wifiEscape(ssid) + ';' + (sec !== 'nopass' ? 'P:' + wifiEscape(pass) + ';' : '') + (f.hidden ? 'H:true;' : '') + ';');
    }
    case 'vcard': {
      const name = trim(f.vName);
      if (!name) return bad('Enter the full name for the contact card.');
      const parts = name.split(/\s+/), last = parts.length > 1 ? parts.pop() : '', first = parts.join(' ');
      const L = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vcardEscape(last) + ';' + vcardEscape(first) + ';;;', 'FN:' + vcardEscape(name)];
      if (trim(f.vOrg)) L.push('ORG:' + vcardEscape(trim(f.vOrg)));
      if (trim(f.vPhone)) L.push('TEL;TYPE=CELL:' + cleanPhone(f.vPhone));
      if (trim(f.vEmail)) { if (!EMAIL_RE.test(trim(f.vEmail))) return bad('The contact email address is not valid.'); L.push('EMAIL:' + trim(f.vEmail)); }
      if (trim(f.vUrl)) L.push('URL:' + vcardEscape(trim(f.vUrl)));
      if (trim(f.vAddr)) L.push('ADR;TYPE=WORK:;;' + vcardEscape(trim(f.vAddr).replace(/\s*\n\s*/g, ', ')) + ';;;;');
      L.push('END:VCARD');
      return ok(L.join('\r\n'));
    }
    case 'location': {
      const la = parseFloat(f.lat), lo = parseFloat(f.lon);
      if (!isFinite(la) || la < -90 || la > 90) return bad('Latitude must be a number between -90 and 90.');
      if (!isFinite(lo) || lo < -180 || lo > 180) return bad('Longitude must be a number between -180 and 180.');
      return ok(f.geoFormat === 'geo' ? 'geo:' + la + ',' + lo : 'https://maps.google.com/?q=' + la + ',' + lo);
    }
    default: return bad('Choose a QR code type.');
  }
}

/** Create the QR matrix. Picks the smallest version that fits. Throws a friendly error if the content is too long. */
export function makeQr(text, ecl) {
  const level = ['L', 'M', 'Q', 'H'].includes(ecl) ? ecl : 'M';
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  try { qr.make(); } catch (e) { throw new Error('This content is too long for a QR code at error correction ' + level + '. Shorten it or choose a lower error correction level.'); }
  return qr;
}

function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function lum(rgb) { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
/** Readability check for the chosen colours. Returns '' or a warning. */
export function colorWarning(fg, bg, transparent) {
  const a = hexToRgb(fg), b = hexToRgb(transparent ? '#ffffff' : bg);
  if (!a || !b) return 'Choose valid colours.';
  const la = lum(a), lb = lum(b), ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  if (la > lb) return 'The code colour is lighter than the background. Many phone cameras cannot read inverted QR codes; use a dark code on a light background.';
  if (ratio < 3) return 'Low contrast (' + ratio.toFixed(1) + ':1). Some phones may fail to scan it; use a darker code colour or lighter background.';
  if (transparent) return 'Transparent background: make sure it is placed on a light surface so it stays readable.';
  return '';
}

/** SVG markup: one path of module squares, crisp at any size. */
export function toSvg(qr, o) {
  const n = qr.getModuleCount(), m = o.margin, size = n + 2 * m;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (qr.isDark(r, c)) { let w = 1; while (c + w < n && qr.isDark(r, c + w)) w++; d += 'M' + (c + m) + ' ' + (r + m) + 'h' + w + 'v1h-' + w + 'z'; c += w; } else c++;
    }
  }
  const px = o.px || size * 10;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    (o.transparent ? '' : '<rect width="' + size + '" height="' + size + '" fill="' + o.bg + '"/>') +
    '<path d="' + d + '" fill="' + o.fg + '"/></svg>';
}

/** Draw on a canvas at roughly `px` pixels square, using whole-pixel modules so the code stays sharp. Returns the canvas. */
export function drawCanvas(qr, canvas, o) {
  const n = qr.getModuleCount(), m = o.margin, size = n + 2 * m;
  const scale = Math.max(1, Math.round((o.px || 512) / size));
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = o.fg;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + m) * scale, (r + m) * scale, scale, scale);
  return canvas;
}
