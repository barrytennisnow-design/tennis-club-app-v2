# Club Tennis — Web App

Replaces the old Google Form + Sheets + Apps Script system with a real
database and website:

- **Public signup** → manager approval → active roster (was: Onboard Response
  form → manual copy into Roster tab)
- **Player self-service login** via magic link (email only, no password)
- **30-day rolling availability calendar** players manage themselves (was: a
  new Google Form re-sent and re-titled every single week)
- **Match-making engine**: manager clicks "Generate Matches," the system
  groups available, similarly-ranked players into 4-player matches, players
  accept/decline, and matches auto-confirm or auto-cancel based on responses
  (was: the "Match Matrix" / "Proposed Matches" spreadsheet, built by hand)
- **Email notifications**: players get emailed when proposed for a match,
  nudged if they haven't responded halfway to the deadline, and notified if
  a match auto-cancels — via a scheduled job that runs every 30 minutes
  (was: the manual "hour for auto cancel" / "Nudge Count" columns you had
  to watch and act on by hand)

Everything below runs on free tiers: **Supabase** (Postgres + Auth) and
**Vercel** (hosting). Total cost: $0/month for a club this size.

## 1. Create your Supabase project

1. Go to https://supabase.com → New Project (free tier).
2. Once created, open the **SQL Editor** and run, in order:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
   - `supabase/import_roster.sql` — loads your 40 existing players from the
     Roster tab (name, contact info, ranking, status, etc). They don't have
     a login yet; the first time each one logs in via magic link with the
     same email address, their account gets linked to this existing row
     automatically — no duplicate is created.
3. Go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — never
     put it in frontend code, only in server-side env vars)

## 2. Configure magic-link email

Supabase sends magic-link emails out of the box using its own mailer, which
is fine for getting started (rate-limited, fine for a club-sized group).
For a nicer sender address later: **Authentication → Settings → SMTP
Settings** and plug in any SMTP provider (e.g. free tier of Resend or
Postmark).

Under **Authentication → URL Configuration**, set:
- Site URL: your deployed URL (e.g. `https://your-club.vercel.app`)
- Redirect URLs: add `https://your-club.vercel.app/auth/callback`

## 3. Configure match-notification emails (Resend, free)

These are separate from the magic-link login emails above — this is what
sends "you've been proposed a match," nudges, and cancellation notices.

1. Sign up free at https://resend.com (3,000 emails/month free, no card
   needed for their sandbox sender).
2. Create an API key: **API Keys → Create API Key**.
3. Set `RESEND_API_KEY` in your env vars to that key.
4. For a quick start, leave `EMAIL_FROM` as the default
   `onboarding@resend.dev` sandbox sender — it works immediately but only
   delivers to your own verified email while testing. To send to all your
   players, verify your own domain under **Domains** in Resend (free, just
   DNS records), then set `EMAIL_FROM` to an address on that domain (e.g.
   `Club Tennis <matches@yourclub.com>`).
5. Generate a random `CRON_SECRET` (e.g. run `openssl rand -hex 16` in a
   terminal) and set it as an env var too — this locks down the reminder
   job so randoms can't hit the URL and spam-cancel matches.

If you skip this step entirely, the app still works — match emails are just
logged to the `email_log` table with status `skipped_no_api_key` instead of
actually sending, so nothing breaks.

## 4. Run locally (optional, to test first)

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your Supabase values from step 1
npm run dev
```

Visit http://localhost:3000

## 5. Deploy to Vercel (free)

1. Push this project to a GitHub repo.
2. Go to https://vercel.com → New Project → import the repo.
3. Add the same environment variables from `.env.example` in Vercel's
   project settings (Settings → Environment Variables), including
   `RESEND_API_KEY`, `EMAIL_FROM`, and `CRON_SECRET` from step 3.
4. Set `NEXT_PUBLIC_SITE_URL` to your Vercel URL once you have it (you may
   need to redeploy once after your first deploy to pick up the right URL).
5. Deploy.

Vercel reads `vercel.json` automatically and schedules
`/api/cron/match-reminders` to run every 30 minutes — no extra setup
needed once deployed. (Cron jobs only run on deployed Vercel projects, not
`npm run dev` locally — see the manual test below if you want to test it
before deploying.)

## 6. Make yourself the manager

1. Sign up as a player through the site (or log in if you already have a
   row from your old system — you don't, since this is a fresh database).
2. In Supabase SQL Editor, run:
   ```sql
   update players set role = 'manager', status = 'active'
   where email = 'your-email@example.com';
   ```
3. Log out and back in. You'll now see "Manager" in the nav.

## 7. How to test the whole flow end-to-end

1. **Sign up** a second test player (a personal email you can check) at
   `/signup`.
2. **Approve them**: log in as manager, go to `/admin`, set a rating,
   click Approve.
3. **Set availability**: log in as that test player, go to `/availability`,
   tap a few days in the next week.
4. Do the same for 3 more test players (or use imported roster players who
   have already logged in and set availability) so you have 4 available
   people on the same day.
5. **Generate a match**: as manager, go to `/admin/matches`, pick a date
   range covering that day, click "Generate Match Matrix." You should see
   a new DRAFT match — nothing is emailed yet.
6. **Propose it**: click "Propose (emails players)" on that draft. Now the
   4 players get an email (if Resend is configured).
7. **Respond**: log in as each test player, go to `/matches`, click Accept
   or Decline (declining lets you leave an optional reason). Once all 4
   accept, the match flips to CONFIRMED automatically and everyone gets a
   confirmation email with a calendar invite (.ics) attached. If one
   declines, it flips to CANCELLED and everyone's notified.
8. **Test the reminder/auto-cancel job manually** (without waiting for the
   real cron schedule or a deployed environment):
   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-club.vercel.app/api/cron/match-reminders
   ```
   You should get back something like
   `{"ok":true,"checked":1,"nudged":0,"cancelled":0}`. To actually see a
   nudge or cancellation fire, temporarily lower `auto_cancel_hours` on a
   test match to something small (e.g. `0.02` ≈ 1 minute) via the Supabase
   table editor, wait a minute, then hit the curl command again.
8. Check the **`email_log`** table in Supabase any time to see every email
   the system attempted to send and its status.

## How the pieces map to your old system

| Old system | New system |
|---|---|
| "to invite" tab | Not needed — anyone can hit `/signup` directly |
| Onboard Response form | `/signup` page |
| Manual copy to Roster | Manager clicks Approve on `/admin` — instant |
| Roster tab | `players` table, viewable at `/admin/roster` |
| Weekly Availability form (re-titled every Monday) | `/availability` — always-on 30-day rolling calendar |
| Prior Availability (messy stacked tabs) | `availability` table — one row per player per day, fully queryable, nothing to "archive" |
| Availability Control tab | No longer needed — no weekly manual date update |
| Match Matrix / Proposed Matches | `matches` + `match_players` tables, `/admin/matches` |
| Match AcceptReject tab | `match_players.response_status`, updated live from `/matches` |
| Outbox tab | `email_log` table (magic links themselves are handled directly by Supabase Auth) |

## Notes on the match-making algorithm

`lib/matching.ts` currently: for each day, pulls active players who marked
themselves available and aren't already in a proposed/confirmed match that
day, sorts by ranking, and groups into 4s (closest rankings play together).
Leftover players (not a multiple of 4) simply aren't matched that run — you
can re-run "Generate Matches" later or extend the algorithm (e.g. to
cross-load a day, prioritize players who haven't played recently, etc.).

The nudge/auto-cancel-by-timer behavior from the old sheet (columns like
"hour for auto cancel," "Nudge Count") is now fully wired up:
`app/api/cron/match-reminders/route.ts`, scheduled via `vercel.json` to run
every 30 minutes. Each match's `auto_cancel_hours` field controls its
deadline (default 24h from when it was proposed); at the halfway point,
anyone who hasn't responded gets one nudge email, and past the full
deadline the match auto-cancels and all 4 players are notified.

## What's intentionally left as a next step

- **Backfill on cancellation**: if a match auto-cancels or someone declines,
  the freed-up players aren't automatically re-matched — you'd click
  "Generate Matches" again to pick them up.
- **Multiple nudges**: currently one nudge per match at the halfway point,
  not the escalating reminders some clubs like. Easy to extend if wanted.
- **Custom sender domain**: works out of the box with Resend's sandbox
  sender for testing; for real day-to-day use with all your players,
  verify your own domain in Resend (free, just DNS records) — see step 3
  above.
