# SocialTush forms: setup guide

The **Contact**, **Order**, **Book a consultation** and **Affiliate** forms send every request to
**support@socialtush.com** and email the customer a branded confirmation with a reference number
(for example `ST-O261120-K7Q2`). Every request is also saved in your Supabase project, so nothing is
lost even if an email fails.

```
Website form ──► Supabase Edge Function "submit-inquiry"
                   ├─ checks the details (and blocks bots / too many requests)
                   ├─ saves it in the "inquiries" table
                   ├─ emails support@socialtush.com   (via your HTsend API key)
                   └─ emails the customer a confirmation (via HTsend)
```

Until the steps below are done, the forms show a message offering to email your request to
support@socialtush.com instead (already filled in), so customers are never stuck.

---

## Step 1: Create the table (2 minutes)

1. Open your Supabase project → **SQL Editor** (left sidebar) → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql), copy **everything**, paste it in.
3. Click **Run**. You should see "Success. No rows returned".

## Step 2: Add your HTsend API key as a secret

> First revoke the HTsend key that was shown in a screenshot earlier, and create a new one.
> Paste the new key **only** into Supabase, never into the website or a chat.

1. Supabase → **Edge Functions** → **Secrets** (or **Manage secrets**).
2. Add a secret:
   - Name: `HTSEND_API_KEY`
   - Value: your new `hts_live_...` key
3. Click **Save**.

Optional secrets (defaults shown):

| Name | Default |
|---|---|
| `SUPPORT_EMAIL` | `support@socialtush.com` |
| `FROM_EMAIL` | `noreply@socialtush.com` (must be on your verified HTsend domain) |
| `ALLOWED_ORIGINS` | `https://socialtush.com,https://www.socialtush.com,https://odhiambokelly.github.io,http://localhost:8765` |

## Step 3: Create the Edge Function (3 minutes)

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly: `submit-inquiry`
3. Delete the sample code, then copy **everything** from
   [`supabase/functions/submit-inquiry/index.ts`](supabase/functions/submit-inquiry/index.ts) and paste it in.
4. Click **Deploy function**.
5. Open the function's **Details / Settings** and turn **OFF** "Verify JWT with legacy secret"
   (also called "Enforce JWT verification"), then save.
   The website uses a publishable key, which is not a JWT; the function does its own checks
   (allowed websites, bot trap, rate limit, validation).

## Step 4: Test

1. Open <https://socialtush.com/contact-us.html> and send a test message.
2. You should see "Message sent!" with a reference number.
3. Check **support@socialtush.com** for the request, and the address you typed for the confirmation.
4. In Supabase → **Table Editor** → **inquiries**, the request appears as a new row.

If something fails: Supabase → **Edge Functions** → `submit-inquiry` → **Logs** shows the reason
(for example a wrong API key, or a domain not yet verified in HTsend).

---

## Managing requests

- **See all requests:** Supabase → **Table Editor** → `inquiries` (newest first by `created_at`).
- **Update progress:** change the `status` column to `in_progress`, `quoted`, `confirmed`,
  `completed` or `cancelled`. Logged-in customers see this status on their **My account** page.
- **Reply:** the support email has a "Reply to …" button, or email the customer quoting the reference.

## What each form collects

| Form | Page | Fields |
|---|---|---|
| Contact | `contact-us.html` | name, email, phone, topic, message |
| Order | `order.html` | service, name, email, phone, business/website, budget, deadline, project details |
| Booking | `schedule-booking.html` | topic, date, time (East Africa Time), name, email, phone, notes |
| Affiliate | `affiliate.html` | name, email, phone, specialisation, rate (USD), portfolio link, notes |

Links such as `order.html?service=seo` open the order form with that service already selected.

## Not included yet

- **Online payment.** Orders are quote requests: you email a price, the customer approves, then you
  start. Card or M-Pesa checkout can be added later.
- **Live calendar availability.** Bookings are requests that you confirm by email.
- **File uploads** on the affiliate form (it asks for a portfolio link instead).
