/* SocialTush email checker: shared logic (browser + Supabase Edge Function "email-check").
 * Pure functions only: syntax, role/free classification, provider parsing and the final verdicts.
 * supabase/functions/email-check/index.ts embeds a copy (tools/build-email-check.sh). */

// ---------- syntax ----------
const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Returns { ok, email, local, domain, error }. Domain is lower-cased; the local part keeps its case. */
export function parseEmail(raw) {
  const email = String(raw == null ? '' : raw).trim();
  const fail = (error) => ({ ok: false, email, error });
  if (!email) return fail('Enter an email address.');
  if (email.length > 254) return fail('An email address can be at most 254 characters.');
  const at = email.lastIndexOf('@');
  if (at < 1 || at !== email.indexOf('@')) return fail('An email address needs exactly one "@", like name@example.com.');
  const local = email.slice(0, at), domain = email.slice(at + 1).toLowerCase().replace(/\.$/, '');
  if (local.length > 64) return fail('The part before "@" can be at most 64 characters.');
  if (!LOCAL_RE.test(local)) return fail('The part before "@" contains characters or dots that are not allowed.');
  if (!domain || domain.length > 253) return fail('The domain after "@" is missing or too long.');
  const labels = domain.split('.');
  if (labels.length < 2) return fail('The domain after "@" needs a dot, like example.com.');
  if (!labels.every((l) => LABEL_RE.test(l))) return fail('The domain "' + domain + '" is not a valid domain name.');
  if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1]) && !/^xn--[a-z0-9-]+$/.test(labels[labels.length - 1])) return fail('The domain ending ".' + labels[labels.length - 1] + '" is not valid.');
  return { ok: true, email: local + '@' + domain, local, domain };
}

// ---------- classification lists ----------
const ROLE = ['admin', 'administrator', 'support', 'info', 'sales', 'contact', 'help', 'helpdesk', 'office', 'billing', 'accounts',
  'accounting', 'finance', 'hr', 'jobs', 'careers', 'recruitment', 'marketing', 'team', 'hello', 'enquiries', 'enquiry', 'inquiries',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'hostmaster', 'webmaster', 'abuse', 'security', 'privacy',
  'legal', 'compliance', 'press', 'media', 'news', 'newsletter', 'orders', 'order', 'service', 'customerservice', 'feedback',
  'mail', 'root', 'sysadmin', 'it', 'tech', 'dev', 'ops', 'reservations', 'booking', 'bookings', 'reception', 'all', 'everyone', 'staff'];
export function isRole(local) { return ROLE.indexOf(String(local).toLowerCase().replace(/\+.*$/, '')) !== -1; }

const FREE = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.co.in', 'yahoo.co.jp', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'live.com', 'live.co.uk', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io', 'zoho.com', 'zohomail.com', 'gmx.com', 'gmx.net', 'gmx.de', 'web.de',
  'mail.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'qq.com', '163.com', '126.com', 'sina.com', 'naver.com',
  'daum.net', 'hanmail.net', 'rediffmail.com', 'fastmail.com', 'hushmail.com', 'laposte.net', 'orange.fr', 'free.fr', 'libero.it', 'virgilio.it',
  't-online.de', 'seznam.cz', 'wp.pl', 'o2.pl', 'interia.pl', 'rambler.ru', 'btinternet.com', 'sky.com', 'comcast.net', 'verizon.net', 'att.net',
  'sbcglobal.net', 'cox.net', 'charter.net', 'bigpond.com', 'optusnet.com.au', 'shaw.ca', 'rogers.com', 'sympatico.ca', 'yahoo.ca', 'outlook.co.uk'];
export function isFreeProvider(domain) { return FREE.indexOf(String(domain).toLowerCase()) !== -1; }

const TYPO = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com' };
export function typoSuggestion(local, domain) { return TYPO[domain] ? local + '@' + TYPO[domain] : null; }

/** All parent domains: a.b.mailinator.com -> [a.b.mailinator.com, b.mailinator.com, mailinator.com] */
export function domainChain(domain) {
  const p = String(domain).toLowerCase().split('.');
  const out = [];
  for (let i = 0; i <= p.length - 2; i++) out.push(p.slice(i).join('.'));
  return out;
}
/** listHas: a Set of disposable domains. Checks the domain and its parents. */
export function inList(set, domain) { return !!set && domainChain(domain).some((d) => set.has(d)); }

// ---------- DNS (DNS-over-HTTPS JSON: Cloudflare / Google) ----------
/** status: 'ok' | 'nxdomain' | 'error'. records: data strings for the asked type (CNAME chain entries removed). */
export function parseDoH(json, type) {
  const T = { A: 1, MX: 15, TXT: 16, AAAA: 28, NS: 2 }[type];
  if (!json || typeof json.Status !== 'number') return { status: 'error', records: [] };
  if (json.Status === 3) return { status: 'nxdomain', records: [] };
  if (json.Status !== 0) return { status: 'error', records: [] };
  const records = (json.Answer || []).filter((a) => a.type === T).map((a) => String(a.data));
  return { status: 'ok', records };
}
export function parseMx(records) {
  return records.map((r) => { const m = r.trim().match(/^(\d+)\s+(\S+)$/); return m ? { pref: Number(m[1]), host: m[2].replace(/\.$/, '').toLowerCase() } : null; })
    .filter(Boolean).sort((a, b) => a.pref - b.pref);
}
function txt(s) { return String(s).replace(/^"|"$/g, '').replace(/"\s*"/g, ''); }
export function spfOf(records) { const r = records.map(txt).find((t) => /^v=spf1\b/i.test(t)); return r || null; }
export function dmarcOf(records) { const r = records.map(txt).find((t) => /^v=DMARC1\b/i.test(t)); return r || null; }

const PROVIDERS = [[/google\.com$|googlemail\.com$/, 'Google (Gmail / Google Workspace)'], [/outlook\.com$|hotmail\.com$|protection\.outlook\.com$/, 'Microsoft (Outlook / Microsoft 365)'],
  [/yahoodns\.net$|yahoo\.com$/, 'Yahoo Mail'], [/icloud\.com$|me\.com$/, 'Apple iCloud Mail'], [/zoho\.(com|eu|in)$/, 'Zoho Mail'],
  [/protonmail\.ch$|proton\.me$/, 'Proton Mail'], [/mailgun\.org$/, 'Mailgun'], [/sendgrid\.net$/, 'SendGrid'], [/amazonaws\.com$|amazonses\.com$/, 'Amazon SES'],
  [/secureserver\.net$/, 'GoDaddy'], [/privateemail\.com$|registrar-servers\.com$/, 'Namecheap Private Email'], [/yandex\.(net|ru)$/, 'Yandex Mail'],
  [/mail\.ru$/, 'Mail.ru'], [/gmx\.(net|com)$|web\.de$/, 'GMX / Web.de'], [/fastmail\.com$|messagingengine\.com$/, 'Fastmail'],
  [/mimecast\.com$/, 'Mimecast'], [/pphosted\.com$/, 'Proofpoint'], [/barracudanetworks\.com$/, 'Barracuda'], [/tutanota\.de$/, 'Tuta']];
export function mailProvider(mx) { for (const m of mx) for (const [re, name] of PROVIDERS) if (re.test(m.host)) return name; return mx.length ? mx[0].host : null; }

// ---------- provider responses ----------
export function parseKickbox(j) { return j && typeof j.disposable === 'boolean' ? { ok: true, disposable: j.disposable } : { ok: false }; }
export function parseDebounce(j) { return j && (j.disposable === 'true' || j.disposable === 'false' || typeof j.disposable === 'boolean') ? { ok: true, disposable: String(j.disposable) === 'true' } : { ok: false }; }
export function parseDisify(j) { return j && typeof j.disposable === 'boolean' && j.format !== undefined ? { ok: true, disposable: j.disposable, dns: j.dns } : { ok: false }; }
export function parseMailcheck(j) {
  if (!j || j.status !== 200) return { ok: false };
  return { ok: true, disposable: !!j.disposable, spam: !!j.spam, role: !!j.role_account, free: !!j.public_domain, relay: !!j.relay_domain,
    didYouMean: j.did_you_mean || null, ageDays: typeof j.domain_age_in_days === 'number' ? j.domain_age_in_days : null };
}
/** Abstract Email Validation API (needs a key, server-side). */
export function parseAbstract(j) {
  if (!j || !j.email || !j.deliverability) return { ok: false };
  const b = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : null);
  return { ok: true, deliverability: String(j.deliverability).toUpperCase(), quality: typeof j.quality_score === 'string' ? parseFloat(j.quality_score) : j.quality_score,
    smtpValid: b(j.is_smtp_valid), catchAll: b(j.is_catchall_email), disposable: b(j.is_disposable_email), role: b(j.is_role_email), free: b(j.is_free_email), mxFound: b(j.is_mx_found) };
}

// ---------- verdicts ----------
/**
 * Disposable: ALWAYS 'DISPOSABLE' or 'NOT DISPOSABLE'.
 * Any positive (local database, live services, or MX hosted by a disposable service) => DISPOSABLE.
 * Otherwise NOT DISPOSABLE, because the local database is always checked; limits are reported separately.
 */
export function disposableVerdict({ listHit, listLoaded = true, mxListHit, live }) {
  const yes = [], no = [], down = [];
  if (listHit) yes.push('SocialTush disposable domain database');
  else if (listLoaded) no.push('SocialTush disposable domain database');
  else down.push('SocialTush disposable domain database');
  if (mxListHit) yes.push('mail server belongs to a known disposable email service (' + mxListHit + ')');
  for (const [name, r] of Object.entries(live || {})) {
    if (!r || !r.ok) down.push(name); else if (r.disposable) yes.push(name); else no.push(name);
  }
  return {
    disposable: yes.length > 0,
    label: yes.length ? 'DISPOSABLE EMAIL' : 'NOT DISPOSABLE',
    color: yes.length ? 'red' : 'green',
    detectedBy: yes, clearedBy: no, unavailable: down,
    verified: yes.length > 0 || no.length > 0,
    note: !yes.length && !no.length
      ? 'Limitation: every disposable-email check was unavailable, so this address could not be verified. It is not marked disposable because there is no evidence that it is. Please try again shortly.'
      : !yes.length && down.length && no.length === 1
        ? 'Live disposable-email services were unavailable; checked against ' + no[0] + ' only.' : null,
  };
}

/**
 * Deliverability: 'DELIVERABLE' | 'UNDELIVERABLE' | 'RISKY'. DELIVERABLE only with SMTP-level evidence
 * from a verification service; valid MX records alone never prove that a mailbox exists.
 */
export function deliverabilityVerdict({ syntaxOk, dns, mx, nullMx, hasA, disposable, disposableUnverified, spam, abstract }) {
  const why = [];
  const out = (label, color) => ({ label, color, reasons: why });
  if (!syntaxOk) { why.push('The address is not a valid email format.'); return out('UNDELIVERABLE', 'red'); }
  if (dns === 'nxdomain') { why.push('The domain does not exist (DNS returned NXDOMAIN).'); return out('UNDELIVERABLE', 'red'); }
  if (nullMx) { why.push('The domain publishes a "null MX" record: it explicitly does not accept email.'); return out('UNDELIVERABLE', 'red'); }
  if (dns === 'ok' && !mx.length && !hasA) { why.push('The domain has no mail (MX) records and no address records, so no server can receive email for it.'); return out('UNDELIVERABLE', 'red'); }
  if (abstract && abstract.ok && abstract.deliverability === 'UNDELIVERABLE') { why.push('The verification service reports the mailbox as undeliverable (SMTP check).'); return out('UNDELIVERABLE', 'red'); }
  if (disposable) why.push('It is a disposable (temporary) address; such inboxes expire.');
  if (disposableUnverified) why.push('Disposable status could not be verified (all disposable checks were unavailable).');
  if (spam) why.push('The domain is associated with spam or abuse.');
  if (abstract && abstract.ok && abstract.catchAll) why.push('The domain is catch-all: it accepts mail for any address, so this mailbox cannot be confirmed.');
  if (why.length) return out('RISKY', 'yellow');
  if (abstract && abstract.ok && abstract.deliverability === 'DELIVERABLE' && abstract.smtpValid) {
    why.push('The mail server confirmed this mailbox during an SMTP check.');
    return out('DELIVERABLE', 'green');
  }
  if (abstract && abstract.ok && abstract.deliverability === 'RISKY') { why.push('The verification service rates delivery as risky.'); return out('RISKY', 'yellow'); }
  if (dns === 'error') { why.push('The domain\'s DNS could not be checked right now.'); return out('RISKY', 'yellow'); }
  why.push(mx.length ? 'The domain has working mail servers, but the individual mailbox could not be verified (no SMTP-level check), so delivery is not guaranteed.'
    : 'The domain has no MX records; mail would fall back to its address record, which is unreliable.');
  return out('RISKY', 'yellow');
}

// ---------- the check pipeline (shared by the Edge Function and the browser fallback) ----------
async function getJson(url, ms, headers) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: headers || {} });
    let body = null; try { body = await r.json(); } catch (e) { /* not JSON */ }
    return { status: r.status, body };
  } catch (e) { return { status: 0, body: null, error: e && e.name === 'AbortError' ? 'timeout' : 'network' }; }
  finally { clearTimeout(t); }
}
let LIST = null, LIST_LOADED_AT = 0, LIST_SIZE = 0;
async function loadList(url, ms) {
  if (LIST && Date.now() - LIST_LOADED_AT < 6 * 3600e3) return LIST;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.ok) {
      const s = new Set((await r.text()).split('\n').map((x) => x.trim().toLowerCase()).filter((x) => x && x[0] !== '#'));
      if (s.size > 1000) { LIST = s; LIST_LOADED_AT = Date.now(); LIST_SIZE = s.size; }
    }
  } catch (e) { /* keep previous list */ } finally { clearTimeout(t); }
  return LIST;
}
async function doh(name, type, ms) {
  const q = encodeURIComponent(name) + '&type=' + type;
  let r = await getJson('https://cloudflare-dns.com/dns-query?name=' + q, ms, { accept: 'application/dns-json' });
  let p = r.status === 200 ? parseDoH(r.body, type) : { status: 'error', records: [] };
  if (p.status === 'error') {
    r = await getJson('https://dns.google/resolve?name=' + q, ms);
    p = r.status === 200 ? parseDoH(r.body, type) : { status: 'error', records: [] };
    p.via = 'Google Public DNS';
  } else p.via = 'Cloudflare DNS';
  return p;
}

/**
 * Run every check for one address. opts: { listUrl, abstractKey, timeoutMs }.
 * Returns a plain object with the verdicts and every underlying result (no invented values).
 */
export async function checkEmail(raw, opts) {
  const ms = (opts && opts.timeoutMs) || 7000;
  const p = parseEmail(raw);
  const checkedAt = new Date().toISOString();
  if (!p.ok) {
    return { ok: true, email: String(raw || '').trim(), checked_at: checkedAt, syntax: { valid: false, error: p.error },
      disposable: disposableVerdict({ listHit: false, live: {} }), deliverability: deliverabilityVerdict({ syntaxOk: false }), sources: [] };
  }
  const { local, domain } = p;
  const enc = encodeURIComponent(domain);
  const [list, mxR, aR, aaaaR, txtR, dmarcR, kb, db, mc, ab] = await Promise.all([
    loadList(opts.listUrl, ms),
    doh(domain, 'MX', ms), doh(domain, 'A', ms), doh(domain, 'AAAA', ms), doh(domain, 'TXT', ms), doh('_dmarc.' + domain, 'TXT', ms),
    getJson('https://open.kickbox.com/v1/disposable/' + enc, ms),
    getJson('https://disposable.debounce.io/?email=' + encodeURIComponent('check@' + domain), ms),
    getJson('https://api.mailcheck.ai/domain/' + enc, ms),
    opts.abstractKey ? getJson('https://emailvalidation.abstractapi.com/v1/?api_key=' + encodeURIComponent(opts.abstractKey) + '&email=' + encodeURIComponent(p.email), ms + 5000) : Promise.resolve(null),
  ]);
  const mx = parseMx(mxR.records);
  const nullMx = mx.length === 1 && (mx[0].host === '' || mx[0].host === '.');
  const realMx = mx.filter((m) => m.host && m.host !== '.');
  const dnsStatus = mxR.status === 'nxdomain' || aR.status === 'nxdomain' ? 'nxdomain' : mxR.status === 'error' && aR.status === 'error' ? 'error' : 'ok';
  const hasA = aR.records.length > 0 || aaaaR.records.length > 0;
  const kick = kb.status === 200 ? parseKickbox(kb.body) : { ok: false };
  const deb = db.status === 200 ? parseDebounce(db.body) : { ok: false };
  const mck = mc.status === 200 ? parseMailcheck(mc.body) : { ok: false };
  const abs = ab && ab.status === 200 ? parseAbstract(ab.body) : null;
  const listHit = inList(list, domain);
  const mxHost = realMx.find((m) => inList(list, m.host));
  const disp = disposableVerdict({
    listHit, listLoaded: !!list, mxListHit: mxHost ? mxHost.host : null,
    live: { 'Kickbox Open': kick, 'DeBounce': deb, 'mailcheck.ai': mck, ...(abs && abs.ok ? { 'Abstract': { ok: true, disposable: !!abs.disposable } } : {}) },
  });
  const spf = spfOf(txtR.records), dmarc = dmarcOf(dmarcR.records);
  const role = !!(isRole(local) || (abs && abs.ok && abs.role === true));
  const free = !!(isFreeProvider(domain) || (mck.ok && mck.free) || (abs && abs.ok && abs.free === true));
  const deliver = deliverabilityVerdict({ syntaxOk: true, dns: dnsStatus, mx: realMx, nullMx, hasA, disposable: disp.disposable, disposableUnverified: !disp.verified, spam: mck.ok && mck.spam, abstract: abs });
  const risk = disp.disposable || (mck.ok && mck.spam) || deliver.label === 'UNDELIVERABLE' ? 'High'
    : deliver.label === 'DELIVERABLE' && !role ? 'Low' : 'Medium';
  return {
    ok: true, email: p.email, local, domain, checked_at: checkedAt,
    syntax: { valid: true },
    suggestion: typoSuggestion(local, domain) || (mck.ok && mck.didYouMean && mck.didYouMean !== p.email ? mck.didYouMean : null),
    disposable: disp,
    deliverability: deliver,
    risk,
    domainInfo: {
      exists: dnsStatus === 'nxdomain' ? false : dnsStatus === 'ok' ? true : null,
      dnsVia: mxR.via, ageDays: mck.ok ? mck.ageDays : null,
      mx: realMx, nullMx, hasA, provider: mailProvider(realMx),
      spf, dmarc,
    },
    classification: { role, free, business: !free && !disp.disposable, spam: mck.ok ? mck.spam : null },
    smtp: abs && abs.ok ? { checked: true, valid: abs.smtpValid, catchAll: abs.catchAll, quality: abs.quality }
      : { checked: false, reason: opts.abstractKey ? 'The verification service did not respond.' : 'Mailbox (SMTP) and catch-all checks need an email verification service, which is not configured.' },
    list: { size: LIST_SIZE || (list ? list.size : 0), loaded: !!list },
    sources: [
      { name: 'DNS (' + (mxR.via || 'DoH') + ')', role: 'Domain, MX, SPF, DMARC', status: dnsStatus === 'error' ? 'unavailable' : 'ok' },
      { name: 'SocialTush disposable database', role: (LIST_SIZE || 0).toLocaleString('en') + ' disposable domains', status: list ? 'ok' : 'unavailable' },
      { name: 'Kickbox Open', role: 'Disposable domains', status: kick.ok ? 'ok' : 'unavailable' },
      { name: 'DeBounce', role: 'Disposable domains', status: deb.ok ? 'ok' : 'unavailable' },
      { name: 'mailcheck.ai', role: 'Disposable, spam, free provider', status: mck.ok ? 'ok' : 'unavailable' },
      { name: 'Abstract Email Validation', role: 'SMTP mailbox + catch-all', status: abs && abs.ok ? 'ok' : opts.abstractKey ? 'unavailable' : 'not configured' },
    ],
  };
}
