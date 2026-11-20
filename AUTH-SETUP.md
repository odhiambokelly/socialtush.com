# SocialTush accounts: setup guide

The site has real sign up, log in, email confirmation and password reset, powered by
[Supabase Auth](https://supabase.com/docs/guides/auth). Accounts are stored in your own Supabase
project and emails go out through **your own SMTP server** from an `@socialtush.com` address.

Until the steps below are done, the account pages show "Accounts are not connected yet".

| Page | What it does |
|---|---|
| `signup.html` | Name, email, create + confirm password, terms. Sends the confirmation email. |
| `confirm.html` | Where the email link lands. Activates the account. |
| `login.html` | Email + password. Blocks unconfirmed accounts and offers to resend. |
| `forgot-password.html` / `reset-password.html` | Password reset by email. |
| `account.html` | Logged-in area: name, email, confirmation status, log out. |

The user icon in the header now opens **Log in** (or **My account** when logged in).

---

## 1. Create the Supabase project

1. Sign up at <https://supabase.com> and create a **New project** (the free plan is enough).
   Pick the region closest to your customers (e.g. *West EU* or *South Africa* if offered).
2. Open **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key
3. Paste them into [`assets/js/auth-config.js`](assets/js/auth-config.js):

   ```js
   window.SOCIALTUSH_AUTH = {
     supabaseUrl: 'https://abcd1234.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...'
   };
   ```

   The anon key is meant to be public. **Never** paste the `service_role` key anywhere in the site.

## 2. Allowed URLs

**Authentication → URL Configuration**

- **Site URL**: `https://socialtush.com`
- **Redirect URLs**, add all of:
  - `https://socialtush.com/**`
  - `https://www.socialtush.com/**`

## 3. Sign-up rules

**Authentication → Sign In / Providers → Email**

- Enable Email provider: **on**
- **Confirm email: on** (users must click the link before they can log in)
- Secure email change: **on**
- Minimum password length: **8**
- Password requirements: **Lowercase, uppercase letters, digits and symbols** (matches the site's checks)

## 4. Your own SMTP (send from @socialtush.com)

**Authentication → Emails → SMTP Settings → Enable custom SMTP**

| Field | Value |
|---|---|
| Sender email | `noreply@socialtush.com` (or `support@socialtush.com`) |
| Sender name | `SocialTush` |
| Host / Port / Username / Password | from your email provider (see below) |

Common providers:

| Provider | Host | Port | Username / password |
|---|---|---|---|
| Zoho Mail | `smtp.zoho.com` | 465 (SSL) or 587 | full email + password (or app password) |
| Google Workspace | `smtp.gmail.com` | 587 | full email + **app password** |
| Microsoft 365 | `smtp.office365.com` | 587 | full email + password |
| cPanel / web host | `mail.socialtush.com` | 465 | full email + mailbox password |
| Brevo / Resend / SendGrid | per their dashboard | 587 | per their dashboard |

So emails don't land in spam, make sure your domain's DNS has the **SPF**, **DKIM** and **DMARC**
records your provider gives you.

With custom SMTP, Supabase allows 30 emails per hour by default. Raise it under
**Authentication → Rate Limits** if you expect more sign-ups.

## 5. Branded email templates

**Authentication → Emails → Templates**. For each one, set the subject and paste the whole HTML file:

| Template | Subject | Paste this file |
|---|---|---|
| Confirm signup | `Confirm your SocialTush account` | [`email-templates/confirm-signup.html`](email-templates/confirm-signup.html) |
| Reset password | `Reset your SocialTush password` | [`email-templates/reset-password.html`](email-templates/reset-password.html) |
| Change email address | `Confirm your new SocialTush email` | [`email-templates/change-email.html`](email-templates/change-email.html) |

Each email has the SocialTush logo header, the greeting with the person's name, the button, a
"What SocialTush offers" section and your contact footer. The logo is loaded from
`https://raw.githubusercontent.com/odhiambokelly/socialtush.com/main/assets/images/400_640c7883f383c.png`, so
GitHub Pages must be on for it to show.

## 6. Test it

1. Open `signup.html`, sign up with an email you can read.
2. You should get the branded confirmation email from your `@socialtush.com` address.
3. Before clicking it, try logging in: you'll be told to confirm first.
4. Click the link: `confirm.html` says "You're all set" and you're logged in.
5. The header user icon now goes to **My account**.
6. Log out, use **Forgot your password?** and check the reset email works.

Your users appear under **Authentication → Users** in Supabase.

## What the site checks before sending anything

- Real-looking email (format check, common typo suggestions like `gmial.com`, and a block on
  throwaway inboxes such as Mailinator or 10MinuteMail)
- Name: 2–60 letters
- Password: 8+ characters with upper, lower, number and symbol; must not contain the email name
  or common words; must be typed twice
- Terms and Refund Policy accepted
- A hidden bot trap field and a minimum fill time to stop automated sign-ups
- Supabase itself then requires the emailed confirmation link before an account can log in.

Optional extra protection: Supabase supports Cloudflare Turnstile or hCaptcha
(**Authentication → Attack Protection**). Turning it on needs a small code change on the sign-up
form, so ask before enabling it.
