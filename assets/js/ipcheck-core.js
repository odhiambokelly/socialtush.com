/* SocialTush IP checker: shared logic (browser + Supabase Edge Function).
 * Pure functions only: IP validation, provider response parsing and the VPN/proxy/Tor verdict.
 * The Edge Function file (supabase/functions/ip-check/index.ts) embeds a copy of this file;
 * rebuild it with tools/build-ip-check.sh after editing. */

// ---------- IP validation ----------
export function isIPv4(s) {
  if (typeof s !== 'string') return false;
  const p = s.split('.');
  if (p.length !== 4) return false;
  return p.every((x) => /^(0|[1-9]\d{0,2})$/.test(x) && Number(x) <= 255);
}

export function isIPv6(s) {
  if (typeof s !== 'string' || s.length > 45 || s.indexOf(':') === -1) return false;
  if (/[^0-9a-fA-F:.]/.test(s)) return false;
  let tail = 0;
  if (s.indexOf('.') !== -1) {                 // embedded IPv4, e.g. ::ffff:1.2.3.4
    const i = s.lastIndexOf(':');
    if (!isIPv4(s.slice(i + 1))) return false;
    s = s.slice(0, i + 1) + '0:0';
    tail = 0;
  }
  const dbl = s.split('::');
  if (dbl.length > 2) return false;
  const part = (x) => (x === '' ? [] : x.split(':'));
  const head = part(dbl[0]);
  const rest = dbl.length === 2 ? part(dbl[1]) : [];
  const groups = head.concat(rest);
  if (!groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  if (dbl.length === 2) return groups.length + tail <= 7;
  return groups.length === 8;
}

export function ipVersion(s) { return isIPv4(s) ? 4 : isIPv6(s) ? 6 : 0; }

export function normalizeIp(s) {
  s = String(s || '').trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);   // [2001:db8::1]
  return s;
}

function v4ToInt(ip) { return ip.split('.').reduce((a, o) => a * 256 + Number(o), 0); }
function inV4(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const size = 2 ** (32 - Number(bits));
  const start = Math.floor(v4ToInt(base) / size) * size;
  const n = v4ToInt(ip);
  return n >= start && n < start + size;
}
const V4_RESERVED = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];

function expandV6(ip) {
  if (ip.indexOf('.') !== -1) {
    const i = ip.lastIndexOf(':');
    const o = ip.slice(i + 1).split('.').map(Number);
    ip = ip.slice(0, i + 1) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const [a, b] = ip.split('::');
  const h = a ? a.split(':') : [];
  const t = b !== undefined ? (b ? b.split(':') : []) : [];
  const fill = b !== undefined ? Array(8 - h.length - t.length).fill('0') : [];
  return h.concat(fill, t).map((g) => parseInt(g, 16));
}

/** Private, loopback, link-local, documentation, multicast and other non-public ranges. */
export function isNonPublic(ip) {
  if (isIPv4(ip)) return V4_RESERVED.some((c) => inV4(ip, c));
  if (!isIPv6(ip)) return true;
  const g = expandV6(ip);
  if (g.every((x) => x === 0)) return true;                                    // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;          // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {               // ::ffff:a.b.c.d
    return isNonPublic([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.'));
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                 // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                 // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return true;                                 // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                         // 2001:db8::/32 documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true;     // 100::/64 discard
  return false;
}

/** Returns '' when OK, otherwise a message for the visitor. */
export function validatePublicIp(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return 'Enter an IP address, for example 8.8.8.8 or 2001:4860:4860::8888.';
  if (!ipVersion(ip)) return '"' + ip.slice(0, 60) + '" is not a valid IPv4 or IPv6 address.';
  if (isNonPublic(ip)) return ip + ' is a private, local or reserved address. These are only used inside networks and cannot be looked up. Enter a public IP address.';
  return '';
}

// ---------- provider parsing ----------
const PROXY_TYPES = ['SOCKS', 'SOCKS4', 'SOCKS4A', 'SOCKS5', 'SOCKS5H', 'HTTP', 'HTTPS', 'CONNECT', 'WEB', 'COMPROMISED SERVER', 'INFERENCE ENGINE', 'OPENVPN', 'SHADOWSOCKS'];

/** proxycheck.io v2 response (?vpn=1&asn=1). */
export function parseProxycheck(json, ip) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'No response' };
  if (json.status && !/^(ok|warning)$/.test(json.status)) return { ok: false, error: json.message || json.status };
  const r = json[ip];
  if (!r || typeof r !== 'object' || (r.proxy !== 'yes' && r.proxy !== 'no')) return { ok: false, error: 'Unexpected response' };
  const type = String(r.type || '').toUpperCase();
  const yes = r.proxy === 'yes';
  return {
    ok: true,
    tor: type === 'TOR',
    vpn: type === 'VPN',
    proxy: yes && type !== 'TOR' && type !== 'VPN',
    anyProxy: yes,
    type: r.type || null,
    connectionType: (type && !yes && PROXY_TYPES.indexOf(type) === -1) ? r.type : null,
    isp: r.provider || null,
    organisation: r.organisation || null,
    asn: r.asn || null,
    country: r.country || null,
    countryCode: r.isocode || null,
    region: r.region || null,
    city: r.city || null,
    operator: r.operator && r.operator.name ? r.operator.name : null,
    warning: json.status === 'warning' ? json.message || null : null,
  };
}

/** ipapi.is response. Without an API key the VPN/proxy/Tor flags are absent (flags = null). */
export function parseIpapi(json) {
  if (!json || typeof json !== 'object' || json.error || !json.ip) return { ok: false, error: (json && (json.error || json.message)) || 'No response' };
  const has = (k) => Object.prototype.hasOwnProperty.call(json, k);
  const flags = has('is_vpn') || has('is_proxy') || has('is_tor')
    ? { vpn: !!json.is_vpn, proxy: !!json.is_proxy, tor: !!json.is_tor, datacenter: !!json.is_datacenter }
    : null;
  const loc = json.location && typeof json.location === 'object' ? json.location : json;
  const company = json.company && typeof json.company === 'object' ? json.company.name : json.company;
  const asnText = json.asn && typeof json.asn === 'object' ? ('AS' + json.asn.asn + ' ' + (json.asn.org || '')).trim() : json.asn;
  return {
    ok: true,
    bogon: !!json.is_bogon,
    flags,
    isp: company || null,
    asn: asnText || null,
    country: loc.country || null,
    countryCode: loc.country_code || null,
    region: loc.state || loc.region || null,
    city: loc.city || null,
  };
}

// ---------- verdict ----------
function vote(results) {               // results: array of true | false | null
  const known = results.filter((x) => x === true || x === false);
  if (!known.length) return 'unknown';
  const t = known.filter((x) => x === true).length;
  if (t === 0) return 'clear';
  return t === known.length ? 'detected' : 'disagree';
}

/**
 * pc: parseProxycheck result, ia: parseIpapi result, torListed: true/false/null (null = list unavailable).
 * Returns { status: 'clean'|'vpn'|'proxy'|'tor'|'inconclusive', color, label, reasons[] }.
 * Never returns 'clean' unless at least one VPN/proxy source answered and none disagreed.
 */
export function combine(pc, ia, torListed) {
  const pcOk = pc && pc.ok, f = ia && ia.ok ? ia.flags : null;
  const tor = torListed === true ? 'detected' : vote([pcOk ? pc.tor : null, f ? f.tor : null, torListed === false ? false : null]);
  const vpn = vote([pcOk ? pc.vpn : null, f ? f.vpn : null]);
  const proxy = vote([pcOk ? pc.proxy : null, f ? f.proxy : null]);
  const reasons = [];
  const src = [];
  if (torListed === true) src.push('listed in the Tor Project\'s current exit node list');
  if (pcOk && pc.anyProxy) src.push('proxycheck.io classifies it as ' + pc.type + (pc.operator ? ' (' + pc.operator + ')' : ''));
  if (f && (f.vpn || f.proxy || f.tor)) src.push('ipapi.is flags it as ' + [f.vpn && 'VPN', f.proxy && 'proxy', f.tor && 'Tor'].filter(Boolean).join(', '));

  const out = (status, color, label) => ({ status, color, label, reasons, checks: { vpn, proxy, tor } });
  if (tor === 'detected') { reasons.push(...src); return out('tor', 'red', 'TOR DETECTED'); }
  if (vpn === 'detected') { reasons.push(...src); return out('vpn', 'red', 'VPN DETECTED'); }
  if (proxy === 'detected') { reasons.push(...src); return out('proxy', 'red', 'PROXY DETECTED'); }
  if (tor === 'disagree' || vpn === 'disagree' || proxy === 'disagree') {
    reasons.push('The detection providers disagree about this address.');
    if (src.length) reasons.push('Positive: ' + src.join('; ') + '.');
    if (pcOk && !pc.anyProxy) reasons.push('Negative: proxycheck.io found no VPN, proxy or Tor.');
    if (f && !f.vpn && !f.proxy && !f.tor) reasons.push('Negative: ipapi.is found no VPN, proxy or Tor.');
    return out('inconclusive', 'yellow', 'DETECTION INCONCLUSIVE');
  }
  if (vpn === 'unknown' || proxy === 'unknown') {
    reasons.push('VPN and proxy detection is temporarily unavailable, so we cannot say whether this address uses a VPN.');
    if (tor === 'clear' && torListed === false) reasons.push('It is not in the Tor Project\'s current exit node list.');
    return out('inconclusive', 'yellow', 'DETECTION INCONCLUSIVE');
  }
  if (pcOk) reasons.push('proxycheck.io found no VPN, proxy or Tor' + (pc.connectionType ? ' (connection type: ' + pc.connectionType + ')' : '') + '.');
  if (f) reasons.push('ipapi.is found no VPN, proxy or Tor.');
  if (torListed === false) reasons.push('Not in the Tor Project\'s current exit node list.');
  else if (torListed === null) reasons.push('The Tor exit list could not be loaded; Tor status is based on proxycheck.io only.');
  return out('clean', 'green', 'NO VPN DETECTED');
}

/** Merge location/ISP details, preferring proxycheck.io and filling gaps from ipapi.is. */
export function details(pc, ia) {
  const a = pc && pc.ok ? pc : {}, b = ia && ia.ok ? ia : {};
  const pick = (k) => a[k] || b[k] || null;
  return {
    isp: pick('isp'), organisation: a.organisation || null, asn: pick('asn'),
    country: pick('country'), countryCode: (pick('countryCode') || '').toUpperCase() || null,
    region: pick('region'), city: pick('city'),
    connectionType: a.connectionType || (a.type && a.anyProxy ? a.type : null),
    operator: a.operator || null,
  };
}
