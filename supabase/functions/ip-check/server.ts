// ===== SocialTush ip-check Edge Function: server part =====
// Public IP address + VPN / proxy / Tor detection for https://socialtush.com/ip-checker
//
// GET  /functions/v1/ip-check            -> checks the caller's own public IP
// GET  /functions/v1/ip-check?ip=1.2.3.4 -> checks any public IPv4 / IPv6 address
//
// Sources (all called server-side; keys never reach the browser):
//   proxycheck.io v2   VPN / proxy / Tor / connection type + location  (works without a key: 100 lookups/day;
//                      set PROXYCHECK_API_KEY for the free 1,000/day plan)
//   Tor Project list   https://check.torproject.org/torbulkexitlist (authoritative Tor exit nodes, cached 1 hour)
//   ipapi.is           location / ISP fallback without a key; VPN/proxy/Tor flags only when IPAPI_IS_KEY is set
//
// Privacy: IP addresses are never written to a database or logs. Results are cached in memory for
// 15 minutes per looked-up address only, and rate limiting uses a salted hash of the caller.

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://socialtush.com,https://www.socialtush.com,http://localhost:8765')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PROXYCHECK_KEY = Deno.env.get('PROXYCHECK_API_KEY') ?? '';
const IPAPI_KEY = Deno.env.get('IPAPI_IS_KEY') ?? '';
const TIMEOUT_MS = 6000;
const CACHE_MS = 15 * 60e3;
const TOR_TTL_MS = 60 * 60e3;
const LIMIT_PER_MIN = 15;
const LIMIT_PER_DAY = 150;
const SALT = crypto.randomUUID();

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json', ...headers } });
    const text = await r.text();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: null, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network error' };
  } finally { clearTimeout(t); }
}

// ---- Tor exit list (cached) ----
let torSet: Set<string> | null = null;
let torLoadedAt = 0;
let torLoading: Promise<void> | null = null;
async function loadTor() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://check.torproject.org/torbulkexitlist', { signal: ctl.signal });
    if (!r.ok) throw new Error('status ' + r.status);
    const lines = (await r.text()).split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    if (lines.length < 100) throw new Error('list too short');
    torSet = new Set(lines);
    torLoadedAt = Date.now();
  } catch (e) {
    console.error('tor list refresh failed:', e instanceof Error ? e.message : e);
  } finally { clearTimeout(t); }
}
async function torListed(ip: string): Promise<boolean | null> {
  if (!torSet || Date.now() - torLoadedAt > TOR_TTL_MS) {
    torLoading ??= loadTor().finally(() => { torLoading = null; });
    if (!torSet) await torLoading;      // first load: wait; later refreshes happen in the background
  }
  if (!torSet) return null;
  return isIPv4(ip) ? torSet.has(ip) : (torSet.has(ip) ? true : null);   // list is IPv4-only
}

// ---- cache + rate limit (in memory, per function instance) ----
const cache = new Map<string, { at: number; data: unknown }>();
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 864e5);
  const lastMin = arr.filter((t) => now - t < 60e3).length;
  if (lastMin >= LIMIT_PER_MIN || arr.length >= LIMIT_PER_DAY) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) hits.clear();
  return false;
}
async function hash(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + s));
  return Array.from(new Uint8Array(b).slice(0, 12), (x) => x.toString(16).padStart(2, '0')).join('');
}

function callerIp(req: Request): string {
  const candidates = [
    ...(req.headers.get('x-forwarded-for') ?? '').split(','),
    req.headers.get('cf-connecting-ip') ?? '',
    req.headers.get('x-real-ip') ?? '',
  ].map((s) => normalizeIp(s));
  return candidates.find((ip) => ipVersion(ip) && !isNonPublic(ip)) ?? '';
}

async function lookup(ip: string) {
  const pcUrl = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1${PROXYCHECK_KEY ? '&key=' + encodeURIComponent(PROXYCHECK_KEY) : ''}`;
  const iaUrl = `https://api.ipapi.is/?q=${encodeURIComponent(ip)}${IPAPI_KEY ? '&key=' + encodeURIComponent(IPAPI_KEY) : ''}`;
  const [pcRes, iaRes, tor] = await Promise.all([getJson(pcUrl), getJson(iaUrl), torListed(ip)]);
  const pc: any = pcRes.status === 200 ? parseProxycheck(pcRes.body, ip) : { ok: false, error: pcRes.error ?? 'HTTP ' + pcRes.status };
  const ia: any = iaRes.status === 200 ? parseIpapi(iaRes.body) : { ok: false, error: iaRes.error ?? 'HTTP ' + iaRes.status };
  const verdict = combine(pc, ia, tor);
  return {
    ok: true,
    ip,
    version: ipVersion(ip) === 4 ? 'IPv4' : 'IPv6',
    checked_at: new Date().toISOString(),
    verdict,
    details: details(pc, ia),
    sources: [
      { name: 'proxycheck.io', role: 'VPN, proxy, Tor and connection type', status: pc.ok ? 'ok' : 'unavailable', error: pc.ok ? undefined : pc.error,
        result: pc.ok ? { proxy: pc.anyProxy ? 'yes' : 'no', type: pc.type, operator: pc.operator, provider: pc.isp, warning: pc.warning ?? undefined } : undefined },
      { name: 'Tor Project exit list', role: 'Tor exit nodes', status: tor === null ? (isIPv4(ip) ? 'unavailable' : 'not applicable (IPv4 list)') : 'ok',
        result: tor === null ? undefined : { listed: tor } },
      { name: 'ipapi.is', role: IPAPI_KEY ? 'VPN/proxy/Tor second opinion and location' : 'Location and ISP fallback (VPN flags need an API key)',
        status: ia.ok ? 'ok' : 'unavailable', error: ia.ok ? undefined : ia.error,
        result: ia.ok ? { flags: ia.flags ?? 'not included without API key', isp: ia.isp } : undefined },
    ],
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405, origin);
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: 'This tool can only be used from socialtush.com.' }, 403, origin);

  const me = callerIp(req);
  if (limited(await hash(me || 'unknown'))) {
    return json({ ok: false, error: 'Too many lookups. Please wait a minute and try again.' }, 429, origin, { 'Retry-After': '60' });
  }

  const q = new URL(req.url).searchParams.get('ip');
  const ip = q === null ? me : normalizeIp(q);
  if (q === null && !ip) return json({ ok: false, error: 'Could not determine your public IP address.' }, 400, origin);
  const invalid = validatePublicIp(ip);
  if (invalid) return json({ ok: false, error: invalid }, 400, origin);

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_MS) return json({ ...(hit.data as object), cached: true, is_you: ip === me }, 200, origin);

  try {
    const data = await lookup(ip);
    // only cache results where the main detector answered, so outages are retried
    if ((data.sources[0] as { status: string }).status === 'ok') {
      cache.set(ip, { at: Date.now(), data });
      if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
    }
    return json({ ...data, cached: false, is_you: ip === me }, 200, origin);
  } catch (e) {
    console.error('lookup failed:', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'Detection is temporarily unavailable. Please try again shortly.' }, 502, origin);
  }
});
