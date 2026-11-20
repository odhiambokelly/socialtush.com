// SocialTush: submit-inquiry Edge Function
// Receives contact / order / booking / affiliate forms from the website, validates them,
// stores them in public.inquiries, emails support@socialtush.com and sends the customer a
// branded confirmation through the HTsend API.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   HTSEND_API_KEY   required  your HTsend API key (hts_live_...)
//   SUPPORT_EMAIL    optional  default support@socialtush.com
//   FROM_EMAIL       optional  default noreply@socialtush.com (must be on your verified HTsend domain)
//   ALLOWED_ORIGINS  optional  comma-separated list; defaults below
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPPORT = Deno.env.get('SUPPORT_EMAIL') ?? 'support@socialtush.com';
const FROM = Deno.env.get('FROM_EMAIL') ?? 'noreply@socialtush.com';
const HTSEND_KEY = Deno.env.get('HTSEND_API_KEY') ?? '';
const SITE = 'https://socialtush.com';
const LOGO = 'https://socialtush.com/assets/images/400_640c7883f383c.png';
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ??
  'https://socialtush.com,https://www.socialtush.com,http://localhost:8765')
  .split(',').map((s) => s.trim()).filter(Boolean);

const SERVICES = [
  'Social media marketing', 'Search engine optimization (SEO)', 'Backlink building', 'Live website',
  'Custom email address', 'Articles & content writing', 'Logo design', 'Social media ad consultation', 'Other',
];
const KINDS = ['contact', 'order', 'booking', 'affiliate'] as const;
type Kind = typeof KINDS[number];
const LABEL: Record<Kind, string> = { contact: 'Message', order: 'Order request', booking: 'Consultation booking', affiliate: 'Affiliate application' };
const PREFIX: Record<Kind, string> = { contact: 'C', order: 'O', booking: 'B', affiliate: 'A' };

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

function cors(origin: string | null) {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function makeRef(kind: Kind) {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join('');
  return `ST-${PREFIX[kind]}${ymd}-${rnd}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!HTSEND_KEY) throw new Error('HTSEND_API_KEY is not set');
  const res = await fetch('https://htsend.com/api/public/v1/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${HTSEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, from_name: 'SocialTush', to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`HTsend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function layout(title: string, inner: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<tr><td align="center" style="background:#053f3e;padding:26px 24px;">
<img src="${LOGO}" width="80" height="80" alt="SocialTush" style="display:block;border:0;width:80px;height:80px;border-radius:50%;background:#fff;">
<div style="color:#fff;font-size:19px;font-weight:bold;margin-top:10px;">SocialTush</div>
<div style="color:#f9d51c;font-size:13px;margin-top:3px;">Engage and grow</div></td></tr>
<tr><td style="height:4px;background:#0b7f7c;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 34px;">${inner}</td></tr>
<tr><td style="padding:24px 34px;background:#f6faf8;border-top:1px solid #e2ebe8;font-size:14px;line-height:1.6;color:#3d4b4a;">
<strong style="color:#14201f;">What SocialTush offers</strong><br>
Social media marketing &middot; SEO &middot; Backlink building &middot; Live websites &middot; Custom email addresses &middot; Articles &amp; content &middot; Logo design &middot; Ad consultations<br>
Custom pricing from <strong>$7</strong> to $5,000, quoted upfront with no hidden fees.<br>
<a href="${SITE}/services" style="color:#0b7f7c;font-weight:bold;text-decoration:none;">Services</a> &middot;
<a href="${SITE}/pricing" style="color:#0b7f7c;font-weight:bold;text-decoration:none;">Pricing</a> &middot;
<a href="${SITE}/schedule-booking" style="color:#0b7f7c;font-weight:bold;text-decoration:none;">Book a consultation</a></td></tr>
<tr><td align="center" style="padding:22px 34px;background:#0e1716;color:#a9b8b5;font-size:12px;line-height:1.7;">
<strong style="color:#fff;font-size:14px;">SocialTush</strong><br>A brand of Kokombo Fast &middot; 20 Nyangweso, Homa Bay 40311, Kenya<br>
<a href="tel:+254727424569" style="color:#f9d51c;text-decoration:none;">+254-727424569</a> &middot;
<a href="mailto:${SUPPORT}" style="color:#f9d51c;text-decoration:none;">${SUPPORT}</a></td></tr>
</table></td></tr></table></body></html>`;
}
function rows(pairs: [string, unknown][]) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2ebe8;border-radius:8px;font-size:14px;margin:16px 0;">' +
    pairs.filter(([, v]) => v !== '' && v != null).map(([k, v]) =>
      `<tr><td style="padding:9px 12px;border-bottom:1px solid #eef3f1;color:#6a7877;width:38%;vertical-align:top;">${esc(k)}</td><td style="padding:9px 12px;border-bottom:1px solid #eef3f1;color:#14201f;font-weight:bold;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('') +
    '</table>';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
  if (origin && !ORIGINS.includes(origin)) return json({ error: 'This form can only be sent from socialtush.com.' }, 403, origin);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400, origin); }

  // bot checks: hidden field must be empty and the form must have been open for 3+ seconds
  const started = Number(b.started_at);
  if (str(b.website, 200) || !started || Date.now() - started < 3000) return json({ error: 'Please wait a moment and try again.' }, 400, origin);

  const kind = str(b.kind, 20) as Kind;
  if (!KINDS.includes(kind)) return json({ error: 'Unknown form.' }, 400, origin);
  const name = str(b.name, 80).replace(/\s+/g, ' ');
  const email = str(b.email, 254).toLowerCase();
  const phone = str(b.phone, 30);
  const message = str(b.message, 5000);
  const service = str(b.service, 80);
  const budget = str(b.budget, 40);
  const deadline = str(b.deadline, 10);
  const bookingDate = str(b.booking_date, 10);
  const bookingTime = str(b.booking_time, 5);
  const timezone = str(b.timezone, 60);
  const details: Record<string, string> = {};
  if (b.details && typeof b.details === 'object') for (const [k, v] of Object.entries(b.details as Record<string, unknown>).slice(0, 12)) details[str(k, 40)] = str(v, 500);

  const errors: string[] = [];
  if (name.length < 2) errors.push('Enter your name.');
  if (!EMAIL_RE.test(email)) errors.push('Enter a valid email address.');
  if (phone && !/^[+\d][\d\s().-]{5,29}$/.test(phone)) errors.push('Enter a valid phone number.');
  if (service && !SERVICES.includes(service)) errors.push('Choose a service from the list.');
  if ((kind === 'contact' || kind === 'order') && message.length < 10) errors.push('Tell us a little more (at least 10 characters).');
  if (kind === 'order' && !service) errors.push('Choose the service you want to order.');
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) errors.push('Invalid deadline.');
  if (kind === 'booking') {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const d = new Date(bookingDate + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || isNaN(+d) || d < today || +d - +today > 180 * 864e5) errors.push('Choose a date within the next 6 months.');
    if (!/^\d{2}:\d{2}$/.test(bookingTime)) errors.push('Choose a time.');
  }
  if (kind === 'affiliate' && !service) errors.push('Choose your area of specialisation.');
  if (errors.length) return json({ error: errors.join(' ') }, 400, origin);

  // rate limit: 5 submissions per 10 minutes per visitor
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const ipHash = ip ? (await sha256('socialtush:' + ip)).slice(0, 32) : null;
  if (ipHash) {
    const { count } = await admin.from('inquiries').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', new Date(Date.now() - 10 * 60e3).toISOString());
    if ((count ?? 0) >= 5) return json({ error: 'Too many requests. Please try again in a few minutes.' }, 429, origin);
  }

  // link to the customer's account when they are logged in
  let userId: string | null = null;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token.split('.').length === 3) {
    const { data } = await admin.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  const ref = makeRef(kind);
  const { error: dbErr } = await admin.from('inquiries').insert({
    ref, kind, user_id: userId, name, email, phone: phone || null, service: service || null, budget: budget || null,
    deadline: deadline || null, booking_date: bookingDate || null, booking_time: bookingTime || null, timezone: timezone || null,
    message: message || null, details, ip_hash: ipHash,
  });
  if (dbErr) { console.error('insert failed', dbErr); return json({ error: 'We could not save your request. Please email ' + SUPPORT + '.' }, 500, origin); }

  const summary: [string, unknown][] = [
    ['Reference', ref], ['Type', LABEL[kind]], ['Name', name], ['Email', email], ['Phone', phone],
    ['Service', service], ['Budget', budget], ['Deadline', deadline],
    ['Date', bookingDate], ['Time', bookingTime ? `${bookingTime}${timezone ? ' (' + timezone + ')' : ''}` : ''],
    ...(Object.entries(details) as [string, unknown][]),
    ['Message', message], ['Account', userId ? 'Logged-in customer' : 'Guest'],
  ];

  const first = name.split(' ')[0];
  const nextSteps: Record<Kind, string> = {
    contact: 'We have received your message and will reply to this email address as soon as possible.',
    order: 'We will review your request and email you a clear, final quote before any work begins. No payment is taken until you approve the price.',
    booking: 'This is a booking request. We will email you to confirm the time, or suggest the nearest available slot.',
    affiliate: 'We will review your application and get back to you with the next steps for joining the SocialTush affiliate program.',
  };

  let sent = false;
  try {
    await sendEmail(SUPPORT, `[${LABEL[kind]}] ${ref} from ${name}${service ? ' · ' + service : ''}`,
      layout(`${LABEL[kind]} ${ref}`, `<h1 style="margin:0 0 6px;font-size:21px;color:#14201f;">New ${esc(LABEL[kind].toLowerCase())}</h1>
        <p style="margin:0;color:#6a7877;font-size:14px;">Submitted ${esc(new Date().toUTCString())}</p>${rows(summary)}
        <a href="mailto:${esc(email)}?subject=${encodeURIComponent('Re: ' + ref)}" style="display:inline-block;background:#0b7f7c;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Reply to ${esc(first)}</a>`));
    await sendEmail(email, `We received your ${LABEL[kind].toLowerCase()} (${ref})`,
      layout(`Thanks, ${first}`, `<h1 style="margin:0 0 14px;font-size:22px;color:#14201f;">Thanks, ${esc(first)}!</h1>
        <p style="margin:0 0 6px;font-size:16px;line-height:1.6;">${esc(nextSteps[kind])}</p>
        <p style="margin:0;font-size:14px;color:#6a7877;">Your reference number is <strong style="color:#14201f;">${ref}</strong>. Please quote it in any reply.</p>
        ${rows(summary.filter(([k]) => !['Account', 'Reference'].includes(k)))}
        <p style="margin:0;font-size:14px;color:#6a7877;">Questions? Reply to <a href="mailto:${SUPPORT}" style="color:#0b7f7c;">${SUPPORT}</a> or call +254-727424569.</p>`));
    sent = true;
    await admin.from('inquiries').update({ email_sent: true }).eq('ref', ref);
  } catch (e) {
    console.error('email failed', ref, e);
  }

  return json({ ok: true, ref, email_sent: sent }, 200, origin);
});
