# SocialTush Email Checker: implementation report

Page: **https://socialtush.com/email-checker**. Linked from the header ("Free tools" menu) and the footer of every page.

## Summary

| Feature | Status |
|---|---|
| Syntax / format validation, typo suggestions | ✅ Working, tested |
| Disposable detection (🔴 DISPOSABLE EMAIL / 🟢 NOT DISPOSABLE, never "unknown") | ✅ Working, tested, including outages |
| Domain existence, DNS, MX, null MX, SPF, DMARC | ✅ Working (real DNS lookups), tested |
| Free vs business, role-based, spam/abuse domain, email provider, domain age | ✅ Working, tested |
| Deliverability (DELIVERABLE / UNDELIVERABLE / RISKY) | ✅ UNDELIVERABLE and RISKY working. **DELIVERABLE needs an SMTP verification key** (below) |
| SMTP mailbox verification and catch-all detection | ⏳ **Code ready; needs an Abstract Email Validation API key and the `email-check` function deployed** |
| Copy results, Check another email, loading indicator, mobile/desktop | ✅ Working, tested |
| SEO (title, description, canonical, OG/Twitter, WebApplication + FAQ + Breadcrumb schema, sitemap, content) | ✅ Done |

## How it works

```
Browser (email-checker.html + assets/js/email-checker.js)
   1. Try the server function  GET /functions/v1/email-check?email=...   (Supabase Edge Function)
   2. If it is not deployed / unreachable, run the same checks in the browser
Shared logic: assets/js/email-core.js (the function embeds a copy: tools/build-email-check.sh)
```

Every result comes from these checks:

| Check | Source | Key? | Notes |
|---|---|---|---|
| DNS: domain exists, MX, A/AAAA, SPF (TXT), DMARC (`_dmarc` TXT) | **Cloudflare DNS-over-HTTPS**, falling back to **Google Public DNS** | No | Real DNS answers. NXDOMAIN means the domain does not exist. `0 .` means null MX |
| Disposable: local database | `assets/data/disposable-domains.txt`: **10,455 domains** from the open-source [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) list (snapshot 22 Nov 2026) | No | Served from your own site, so it is always available. Parent domains are checked too (`x.mailinator.com`) |
| Disposable: mail-server match | Local database applied to the domain's MX hosts | No | Catches custom domains that use a disposable service's mail servers |
| Disposable: live | **Kickbox Open** (`open.kickbox.com/v1/disposable/{domain}`) | No | `{"disposable":true/false}` |
| Disposable: live | **DeBounce** (`disposable.debounce.io`) | No | `{"disposable":"true"/"false"}` |
| Disposable, spam, free provider, typo, domain age | **mailcheck.ai** (`api.mailcheck.ai/domain/{domain}`) | No | Free tier is rate-limited (it stopped answering after a few rapid tests); the other sources cover it |
| Role-based, free provider, provider name | Built-in lists (60+ role names, 70+ free providers, mail-host patterns) | No | |
| **SMTP mailbox + catch-all + deliverability** | **Abstract Email Validation API** | **Yes**: `ABSTRACT_EMAIL_API_KEY` | Server-side only. Free plan: 100 checks/month (check Abstract's current terms) |

**Privacy:** only the **domain** is sent to Kickbox, DeBounce and mailcheck.ai (DeBounce receives `check@domain`, never the real address). The full address is sent only to Abstract, for the SMTP check, once configured. Nothing is stored; the server function caches results for 10 minutes under a salted hash. No email is ever sent to the checked address.

### Classification rules (`email-core.js`)

**Disposable (always one of two labels):**
- 🔴 **DISPOSABLE EMAIL:** any source flags the domain, or its mail servers belong to a known disposable service.
- 🟢 **NOT DISPOSABLE:** no source flagged it, and the always-available local database was checked.
- If every disposable source, including the local database, is unavailable, the label stays NOT DISPOSABLE (no evidence of disposability), with a prominent **limitation notice**, and deliverability becomes RISKY.

**Deliverability:**
- 🔴 **UNDELIVERABLE:**
  - invalid format
  - domain does not exist
  - null MX
  - no MX and no address record
  - SMTP check says undeliverable
- 🟡 **RISKY:**
  - disposable or spam domain
  - catch-all domain
  - DNS unavailable
  - **mailbox not verified:** valid MX records alone never prove that a mailbox exists
- 🟢 **DELIVERABLE:** only when an SMTP-level check (Abstract) confirms the mailbox. Until a key is configured, ordinary addresses show RISKY with "the individual mailbox could not be verified".

## Why SMTP verification needs a paid/keyed service

Confirming a mailbox (and detecting catch-all domains) means talking to the recipient's mail server on port 25. Browsers cannot do that, and Supabase Edge Functions cannot open outbound SMTP connections either. Dedicated verification services do it from their own infrastructure.

| Service | Key | Free tier | Notes |
|---|---|---|---|
| **Abstract Email Validation**: integrated | Yes | ~100 checks/month | Returns deliverability, SMTP valid, catch-all, disposable, role, free |
| ZeroBounce | Yes | ~100 credits/month | Not integrated |
| NeverBounce | Yes | Paid | Not integrated |
| Kickbox (full verification) | Yes | Paid | Only its free **Open** disposable API is used |
| Verifalia | Yes | ~25/day | Not integrated |

Only Abstract is wired in. The others are listed for comparison, not claimed as integrated.

## Setup

1. **Deploy the function** (optional now, required for SMTP):
   - Supabase → Edge Functions → Deploy a new function → Via Editor
   - Name: `email-check`
   - Code: paste `supabase/functions/email-check/index.ts`
   - Deploy, then turn **OFF** "Verify JWT"
2. **SMTP verification:**
   - Create an account at abstractapi.com → Email Validation
   - Copy your key into Supabase → Edge Functions → Secrets as `ABSTRACT_EMAIL_API_KEY`
3. **Keep the disposable list fresh:**
   - Re-download `assets/data/disposable-domains.txt` from the open-source list periodically
   - Or approve the weekly GitHub workflow that does it automatically (not yet added; it needs your OK because it commits to the repository)

After editing `assets/js/email-core.js` or `server.ts`, run `bash tools/build-email-check.sh` and redeploy.

## Tests performed (22 Nov 2026, live services, browser mode)

| # | Test | Result |
|---|---|---|
| 1 | Gmail (`jane.doe.test@gmail.com`) | 🟢 NOT DISPOSABLE (4 sources) · RISKY (mailbox unverified) · Google, 5 MX, SPF ✓, DMARC ✓, free ✓ |
| 2 | Yahoo (`someone@yahoo.com`) | 🟢 NOT DISPOSABLE · RISKY · Yahoo Mail, 3 MX, SPF ✓, DMARC ✓, free ✓ |
| 3 | Outlook (`someone@outlook.com`) | 🟢 NOT DISPOSABLE · RISKY · Microsoft, SPF ✓, DMARC ✓, free ✓ |
| 4 | Business domains (`support@socialtush.com`, `info@safaricom.co.ke`) | 🟢 NOT DISPOSABLE · RISKY · Google Workspace / Cisco-hosted MX, SPF ✓, DMARC ✓, **role-based ✓** |
| 5 | Disposable (`mailinator.com`, `10minutemail.com`, `guerrillamail.com`, `yopmail.com`) | 🔴 DISPOSABLE EMAIL: local database + Kickbox + DeBounce (+ MX match for 3 of them) · RISKY · risk High |
| 6 | Invalid formats (`not an email`, `bad@@address`) | Clear error message; server path returns UNDELIVERABLE "not a valid email format" |
| 7 | Non-existent domain (`…xq7z.com`) | Domain exists: **No (NXDOMAIN)** · 🔴 UNDELIVERABLE |
| 8 | No MX: `co.ke` (no MX, no A) / `github.io` (no MX, has A) / `example.com` (null MX) | 🔴 UNDELIVERABLE / 🟡 RISKY / 🔴 UNDELIVERABLE "explicitly does not accept email" |
| 9 | Catch-all | ⏳ Not testable without an SMTP verification key (shown as "Not checked") |
| 10 | Role-based (`admin@`, `support@`, `info@`, `hello@`) | Role-based: **Yes** |
| 11 | SMTP verification | ⏳ Not testable without `ABSTRACT_EMAIL_API_KEY` and the deployed function (shown as "Not checked", never faked) |
| 12 | Outages (simulated by blocking requests) | Live disposable APIs down → mailinator still 🔴 (local database), gmail 🟢 with note · all disposable sources down → 🟢 + limitation notice, deliverability RISKY · DNS down → RISKY "DNS could not be checked" · everything down → no invented result |
| 13 | Typo `someone@gmial.com` | "Did you mean someone@gmail.com?" (one click re-checks). gmial.com itself is 🔴 DISPOSABLE (listed in the open-source database and by DeBounce) |
| 14 | UI | Loading indicator ✓ · Copy results ✓ · Check another email ✓ (clears and refocuses) · header dropdown ✓ |
| 15 | Layouts | Desktop 1280 px: header fits (1160/1160 px) · phone 375 px: no horizontal scroll, verdicts stacked |

**Not yet tested:**
- the deployed `email-check` function end to end
- SMTP and catch-all results, with an Abstract key
- DELIVERABLE results, which require SMTP evidence
