# SocialTush IP Address Checker & VPN Detection

Page: **https://socialtush.com/ip-checker** (linked from the header and footer of every page).

## Status

| Part | Status |
|---|---|
| Page, SEO content, header/footer links, sitemap | ✅ Live |
| Automatic public IP detection | ✅ Works now (via the browser fallback until the function is deployed) |
| Manual IPv4 / IPv6 lookups, validation, loading states, multiple lookups | ✅ Works now |
| **VPN / proxy / Tor detection** | ⏳ **Needs the `ip-check` Supabase Edge Function deployed** (see Setup). Until then every result shows 🟡 *Detection inconclusive*, never 🟢. |

## How it works

```
Browser (ip-checker.html + assets/js/ip-checker.js)
   │  GET /functions/v1/ip-check          (your own IP, read server-side from the request)
   │  GET /functions/v1/ip-check?ip=X     (manual lookup)
   ▼
Supabase Edge Function "ip-check" (server-side; keys never reach the browser)
   ├─ proxycheck.io v2 ............ VPN / proxy / Tor / connection type / ISP / location   (primary)
   ├─ Tor Project exit list ....... official Tor exit relays, cached 1 hour                (Tor authority)
   └─ ipapi.is .................... ISP / location fallback; VPN flags only with a key     (fallback)
   ▼
Verdict (assets/js/ipcheck-core.js, shared by browser and server)
```

If the function cannot be reached, the page falls back to **ipapi.is directly from the browser**
(it allows browser requests and needs no key) to show the visitor's real public IP, ISP and location,
with the VPN status **🟡 DETECTION INCONCLUSIVE**.

### Verdict rules (`combine()` in `assets/js/ipcheck-core.js`)

- 🔴 **TOR DETECTED**: the IP is in the Tor Project exit list, or a provider reports Tor and none disagrees.
- 🔴 **VPN DETECTED** / **PROXY DETECTED**: a provider reports it and no other provider disagrees.
- 🟡 **DETECTION INCONCLUSIVE**: providers disagree, **or** no VPN/proxy source answered (timeout, error, quota).
- 🟢 **NO VPN DETECTED**: only when at least one VPN/proxy source answered "no" and none said "yes".
- An API failure can **never** produce 🟢.

## APIs used

| Provider | Used for | Key? | Free limit | Verified |
|---|---|---|---|---|
| **proxycheck.io v2** `GET https://proxycheck.io/v2/{ip}?vpn=1&asn=1` | VPN, proxy, Tor, connection type, operator, ISP, location | Optional (`PROXYCHECK_API_KEY`) | 100 lookups/day without a key; 1,000/day with a free account key | ✅ Tested (see below). No browser CORS, so server-side only |
| **Tor Project bulk exit list** `GET https://check.torproject.org/torbulkexitlist` | Tor exit nodes (IPv4) | No | Free | ✅ Tested: 1,263 exits; no browser CORS, so server-side only |
| **ipapi.is** `GET https://api.ipapi.is/?q={ip}` | ISP, ASN, location (fallback); visitor IP in browser fallback | Optional (`IPAPI_IS_KEY`) | Free tier | ✅ Tested without a key: returns `ip, is_bogon, company, asn, city, region, country, lat, lon, timezone`. **Without a key it does NOT return `is_vpn` / `is_proxy` / `is_tor`.** The code uses those flags as a second opinion when a key is set, but that path is **not yet tested** (no key). |

Not used, after evaluation:
- **IPinfo:** VPN/privacy detection is a paid plan only.
- **IPQualityScore, vpnapi.io, Abstract API:** need an account key; could replace or add to ipapi.is later.
- **ip-api.com:** its free tier is non-commercial only and HTTP-only.

### proxycheck.io fields used

`status`, `message`, and per IP: `proxy` (`yes`/`no`), `type` (`VPN`, `TOR`, `SOCKS5`, `HTTP`, `Residential`, `Wireless`,
`Business`, `Hosting`…), `operator.name`, `provider`, `organisation`, `asn`, `country`, `isocode`, `region`, `city`.

## Setup (deploy the detection function)

1. On GitHub: `supabase/functions/ip-check/index.ts` → **Copy raw file**.
2. Supabase → **Edge Functions → Deploy a new function → Via Editor**, name **`ip-check`**, paste, **Deploy**.
3. In the function's settings, turn **OFF** "Verify JWT" and save. The function does its own origin checks and rate limiting.
4. Recommended: create a free account at proxycheck.io, copy your API key, and add it under
   **Edge Functions → Secrets** as `PROXYCHECK_API_KEY` (raises the limit from 100 to 1,000 lookups/day).
5. Optional: add `IPAPI_IS_KEY` for a second VPN opinion from ipapi.is.

After editing `assets/js/ipcheck-core.js` or `supabase/functions/ip-check/server.ts`, run
`bash tools/build-ip-check.sh` and redeploy.

## Security & privacy

- API calls with keys happen only in the Edge Function; keys live in Supabase Secrets.
- Allowed origins: socialtush.com and www.socialtush.com (plus localhost for testing).
- Input validation on both sides; private, local and reserved ranges are rejected.
- Rate limit: 15 lookups/minute and 150/day per visitor (salted hash; in memory per function instance).
- Caching: 15 minutes per looked-up IP, in memory only. Results are only cached when the main detector answered.
- No IP addresses are stored in a database or written to logs.

## Tests performed (22 Nov 2026)

### Live API calls (curl)
| # | Test | Result |
|---|---|---|
| 1 | proxycheck.io, Mullvad VPN server `45.142.26.2` (from Mullvad's public relay list) | `proxy: yes`, `type: VPN`, operator **Mullvad** ✅ |
| 2 | proxycheck.io, Tor exit `171.25.193.25` (from the Tor Project list) | `proxy: yes`, `type: TOR` ✅ |
| 3 | proxycheck.io, open proxies from a public proxy list | `137.66.1.45` → `SOCKS5`, `45.91.248.107` → `HTTP` ✅ |
| 4 | proxycheck.io, residential / mobile | Comcast `73.162.1.1` → `Residential`, `no`; Safaricom `105.163.0.1` → `Wireless`, `no` ✅ |
| 5 | proxycheck.io, IPv6 `2001:4860:4860::8888` | Google LLC, `Business`, `no` ✅ |
| 6 | proxycheck.io, invalid `999.1.1.1` | `status: error`, "No valid IP Addresses supplied." ✅ |
| 7 | ipapi.is keyless, IPv4 + IPv6 + caller | Location/ISP returned; **no VPN flags without a key** ✅ (documented) |
| 8 | CORS from https://socialtush.com | ipapi.is allows it; proxycheck.io and the Tor list do not (hence server-side) ✅ |

### Decision logic in a browser, using the real responses above (62/62 passed)
- Valid public IPv4/IPv6 (incl. `::ffff:8.8.8.8`), 12 invalid inputs, 16 private/reserved ranges (IPv4 + IPv6).
- Real responses → VPN 🔴, Tor 🔴, SOCKS5 🔴, HTTP proxy 🔴, residential 🟢, mobile 🟢, IPv6 business 🟢.
- Failures: proxycheck down → 🟡; proxycheck + Tor list down → 🟡; everything down → 🟡 (never 🟢);
  Tor-listed IP with proxycheck down → 🔴 Tor; providers disagree on VPN → 🟡.

### Page (browser pane)
- Automatic detection showed the real public IP (not a private address) with ISP/location from ipapi.is and 🟡 status, because the function isn't deployed yet ✅
- Manual: `999.1.1.1`, `hello` → "not a valid IPv4 or IPv6 address"; `192.168.1.10`, `fe80::1` → "private, local or reserved" ✅
- Manual `8.8.8.8` and `2001:4860:4860::8888` → real results, loading indicator, several lookups without reload ✅
- Rendering of function-style results built from the real responses: VPN/Tor/proxy 🔴, residential/mobile 🟢, flags shown ✅
- Layout at 375 px (phone), 768 px (tablet) and desktop, with no horizontal scroll ✅

### Not tested yet: needs the function deployed
- The deployed `ip-check` function end-to-end (server-side calls, caller-IP detection, rate limit, caching).
- ipapi.is VPN flags with an API key.
- Real browser timeouts against the deployed function.

The country flag is missing in fallback mode, because keyless ipapi.is returns no country code.
