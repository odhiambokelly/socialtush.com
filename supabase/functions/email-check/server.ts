// ===== SocialTush email-check Edge Function: server part =====
// GET /functions/v1/email-check?email=name@example.com
// Secrets (optional): ABSTRACT_EMAIL_API_KEY -> enables SMTP mailbox + catch-all checks (Abstract Email Validation)
//                     ALLOWED_ORIGINS, DISPOSABLE_LIST_URL
// Privacy: addresses are not stored or logged. Results are cached in memory for 10 minutes under a salted hash.

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://socialtush.com,https://www.socialtush.com,http://localhost:8765')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ABSTRACT_KEY = Deno.env.get('ABSTRACT_EMAIL_API_KEY') ?? '';
const LIST_URL = Deno.env.get('DISPOSABLE_LIST_URL') ?? 'https://socialtush.com/assets/data/disposable-domains.txt';
const SALT = crypto.randomUUID();
const cache = new Map<string, { at: number; data: unknown }>();
const hits = new Map<string, number[]>();

function cors(origin: string | null) {
  return { 'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
}
function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
}
async function hash(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + s));
  return Array.from(new Uint8Array(b).slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}
function limited(key: string) {
  const now = Date.now(), arr = (hits.get(key) ?? []).filter((t) => now - t < 864e5);
  if (arr.filter((t) => now - t < 60e3).length >= 10 || arr.length >= 100) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr); if (hits.size > 20000) hits.clear(); return false;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405, origin);
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: 'This tool can only be used from socialtush.com.' }, 403, origin);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (limited(await hash('ip:' + ip))) return json({ ok: false, error: 'Too many checks. Please wait a minute and try again.' }, 429, origin, { 'Retry-After': '60' });
  const email = (new URL(req.url).searchParams.get('email') ?? '').trim().slice(0, 320);
  if (!email) return json({ ok: false, error: 'Enter an email address.' }, 400, origin);
  const key = await hash('e:' + email.toLowerCase());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600e3) return json({ ...(hit.data as object), cached: true }, 200, origin);
  try {
    const data = await checkEmail(email, { listUrl: LIST_URL, abstractKey: ABSTRACT_KEY, timeoutMs: 7000 });
    data.mode = 'server';
    cache.set(key, { at: Date.now(), data }); if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
    return json({ ...data, cached: false }, 200, origin);
  } catch (e) {
    console.error('email check failed:', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'The email check is temporarily unavailable. Please try again shortly.' }, 502, origin);
  }
});
