# Biokinetics Practice Manager

A booking + invoicing web app for a solo biokinetics practice: React 18 + Vite, Supabase (Postgres + Auth + RLS), deployable to Vercel.

## What it does

- **Bookings** — schedule sessions per client and practitioner (GP or biokineticist), track status (scheduled/completed/cancelled/no-show), send a manual WhatsApp or email reminder (opens pre-filled, you tap send).
- **Clients** — simple contact records.
- **Invoices** — line items, automatic 15% VAT, paid/unpaid tracking, printable invoice view (Print → Save as PDF).
- **Settings** — practice name, practitioner name, HPCSA/BHF numbers, contact details, shown on invoices.
- **Team access** — one shared practice, up to a few logins: a Practice Manager, a GP, and a Biokineticist all see the same clients/bookings/invoices. The Practice Manager invites the other two by email from Settings; RLS keeps the whole practice's data scoped to one tenant regardless of which of the three is signed in. See **Team access** below.
- **Auth** — magic-link email sign-in (no passwords).

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In the SQL Editor, paste and run each migration in `supabase/migrations/`, **in order** — `0001_init.sql`, `0002_features.sql`, `0003_cron_setup.sql` (edit its two placeholders first — project ref and service role key — or skip it until you've deployed the reminder Edge Function below), `0004_practitioners.sql`, `0005_multi_user_practice.sql`, and (if you're setting up Google Calendar sync) `0008_google_oauth.sql` then `0009_google_calendar_per_practitioner.sql`.
3. In **Authentication → Providers**, make sure **Email** is enabled. In **Authentication → URL Configuration**, add your local dev URL (`http://localhost:5173`) and your future Vercel URL to the redirect allow-list.
4. In **Project Settings → API**, copy the **Project URL** and **anon public key**.

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the two values from step 1:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 3. Run locally

```bash
npm install
npm run dev
```

Open the local URL, enter your email, and click the magic link sent to your inbox. First sign-in creates your `settings` row automatically (blank — fill it in via the gear icon).

## 4. Deploy

**Upload to GitHub** (matching how you've deployed SpineSync): create a new repo and upload this project's files via the GitHub web interface — keep the folder structure exactly as-is, with `package.json` at the repo root (this avoids the nested-root-directory build issue you hit with SpineSync).

**Deploy on Vercel:**
1. Import the GitHub repo into Vercel.
2. Framework preset: **Vite**.
3. Add the two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in Vercel's Project Settings → Environment Variables.
4. Deploy.
5. Back in Supabase → Authentication → URL Configuration, add your live Vercel URL to the redirect allow-list, or magic links won't work in production.

## Project structure

```
src/
  supabaseClient.js   – Supabase client setup
  lib/db.js           – all database reads/writes
  theme.js            – shared colours, fonts, UI primitives
  Auth.jsx            – magic-link sign-in screen
  App.jsx             – auth gate + main app shell/navigation
  views/
    Bookings.jsx       – bookings list + booking form
    Clients.jsx        – clients list + client form
    Invoices.jsx        – invoices list, invoice form, printable invoice
    Settings.jsx        – practice details form
supabase/migrations/0001_init.sql – schema + Row Level Security
```

## Automated reminders (patient + clinician)

Every scheduled booking now automatically queues two reminder emails: one to the patient 24 hours before, one to you (the clinician) 2 hours before. This needs three things set up once:

1. **Run the extra migrations.** In Supabase SQL Editor, run `supabase/migrations/0002_features.sql` (adds the reminder queue + trigger), then hold off on `0003_cron_setup.sql` until step 3.
2. **Get a Resend API key.** Sign up free at [resend.com](https://resend.com), create an API key. You can send from `onboarding@resend.dev` for testing, or verify your own domain for a proper "from" address.
3. **Deploy the Edge Function** (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set RESEND_API_KEY=your_resend_key
   supabase secrets set REMINDER_FROM_EMAIL=onboarding@resend.dev
   supabase functions deploy send-reminders --no-verify-jwt
   ```
4. **Schedule it.** Open `supabase/migrations/0003_cron_setup.sql`, replace `YOUR-PROJECT-REF` and `YOUR-SERVICE-ROLE-KEY` (Project Settings → API → service_role key — keep this secret, never put it in frontend code), then run it in SQL Editor. This checks for due reminders every 10 minutes.

Manual **WhatsApp / email reminder** buttons are still on each booking too, for a one-tap "notify right now" option alongside the automatic scheduled ones.

## Nightly practitioner digest (tomorrow's bookings)

Each practitioner with a connected email also gets one extra email around **18:30 the evening before**, listing every patient booked for the next day, in order — a quick end-of-day overview rather than the 2-hour-before ping above. It reuses the same Resend account as the reminders, so if you've already done the steps above, only the cron scheduling is new:

1. **Run the extra migrations.** In Supabase SQL Editor, run `supabase/migrations/0010_daily_digest.sql` (adds a small log table so the digest never double-sends), then hold off on `0011_daily_digest_cron.sql` until step 3.
2. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy send-daily-digest --no-verify-jwt
   ```
   It reads the same `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` secrets you already set for reminders — nothing extra to configure there.
3. **Schedule it.** Open `supabase/migrations/0011_daily_digest_cron.sql`, replace `YOUR-PROJECT-REF` and `YOUR-SERVICE-ROLE-KEY`, then run it in SQL Editor. It fires once a day at 16:30 UTC (18:30 SAST — South Africa has no DST, so this never needs adjusting).

Only bookings with a practitioner assigned are included (same as Google Calendar sync) — an unassigned booking has nowhere to be emailed to. If a practitioner has no bookings the next day, they simply get no email that night.

## Editable invoices

Every invoice can be edited after creation — line items, quantities, rates, and the **VAT rate itself** (not fixed at 15%, in case you need a zero-rated or custom-rate line). Open an invoice and tap **Edit invoice**.

## Team access (Practice Manager, GP, Biokineticist)

One practice, up to a few separate logins, all seeing the same data:

1. The **first person to sign in** (typically the Practice Manager) automatically becomes the practice owner — nothing to configure.
2. That person goes to **Settings → Team access → Invite**, enters the GP's (or biokineticist's) name, email, and role, and sends the invite. This creates a placeholder row — no account exists for them yet.
3. When the invited person opens the app and signs in with **that same email** via the normal magic-link flow, a database trigger automatically links their new account to the practice. They immediately see the same clients, bookings, and invoices as everyone else — no separate setup.
4. Inviting someone as GP or Biokineticist also adds a matching entry under **Practitioners**, so they show up in the booking form's practitioner dropdown right away.
5. Only the Practice Manager sees the Team access section and can invite or remove teammates. All three roles can create bookings, clients, and invoices.

Each practitioner can independently connect **their own** Google account (Settings → next to their name → Connect) — a practice can have several different Google accounts connected at once, one per practitioner, and each practitioner's bookings sync only to their own calendar. See **Google Calendar sync** below.

## Google Calendar sync

Scheduled bookings can sync to Google Calendar — and since each practitioner connects their own Google account (Settings → Practitioners → next to their name), a GP and a biokineticist sharing one practice can each have bookings land on their own calendar, under their own email. This uses a server-side OAuth flow, so the sync keeps working even when nobody has the app open. You need your own OAuth Client ID/Secret:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project (or use an existing one).
2. **APIs & Services → Library** → enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → set it up as **External**, add your own email (and any other practitioner's) as a test user (or publish it later once verified).
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID** → Application type: **Web application**.
5. Under **Authorized redirect URIs**, add your deployed callback function URL:
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth-callback`
6. Deploy the four Google edge functions and set their secrets:
   ```bash
   supabase functions deploy google-oauth-start google-oauth-callback google-calendar-push google-calendar-disconnect google-calendar-pull
   supabase secrets set GOOGLE_CLIENT_ID=your_client_id
   supabase secrets set GOOGLE_CLIENT_SECRET=your_client_secret
   supabase secrets set GOOGLE_REDIRECT_URI=https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth-callback
   supabase secrets set APP_URL=https://your-app.vercel.app
   ```
7. Run migration `0009_google_calendar_per_practitioner.sql` (after `0008_google_oauth.sql`) so each connection is keyed by practitioner instead of shared practice-wide.

In the app, go to Settings (gear icon) → **Practitioners**, and next to a practitioner's name click **Connect** — sign in with *that practitioner's* Google account. Repeat for each other practitioner with their own account; nothing is shared between them. If a connection stops syncing, click **Reconnect** on that practitioner's row. Only bookings with status "scheduled" are synced; marking one completed/cancelled removes it from that practitioner's calendar (and sends the patient a cancellation email).

**Notifying the patient:** every synced event is created with `sendUpdates=all`, so Google itself emails a calendar invite to the **patient**, if the client record has an email address saved (Clients → edit client) — the event lives on the practitioner's own calendar either way. Patients get a reminder email 1 day before and a popup reminder 1 hour before. No email address on the client record means no invite is sent to the patient — the event still syncs to the practitioner's calendar regardless.

This uses Google's own invite emails, not a custom email service, so there's nothing extra to configure beyond the OAuth credentials above — just make sure your clients' email addresses are filled in.
