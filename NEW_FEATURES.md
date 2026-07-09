# New Features: Test Data, No-Email Login Links, Manager Testing Tools

These are additive to everything you already have running. None of this
breaks what's already working — you're just adding files and running one
more SQL script.

## 1. How to add this to your live site

Same process as before:
1. On your computer, copy the **new/changed files** below into your local
   `tennis-app` folder (overwriting the old versions of any that already
   exist), matching the exact same folder structure.
2. Open GitHub Desktop (or the GitHub website upload, whichever worked for
   you before), commit, and push/upload.
3. Vercel will automatically rebuild.

**New/changed files in this update:**
- `supabase/migration_access_links.sql` (NEW — run this once in Supabase)
- `supabase/test_data_availability.sql` (NEW — run this once, optional test data)
- `app/access/[token]/route.ts` (NEW)
- `app/api/admin/send-access-link/route.ts` (NEW)
- `app/api/admin/impersonate/route.ts` (NEW)
- `app/api/admin/assign-court/route.ts` (NEW)
- `app/api/admin/swap-player/route.ts` (NEW)
- `app/admin/roster/page.tsx` (CHANGED — added buttons)
- `app/admin/matches/page.tsx` (CHANGED — added court/swap controls)
- `lib/email.ts` (CHANGED — added sandbox mode + access link email)
- `supabase/schema.sql` (CHANGED — only matters for brand-new installs;
  you already have a database, so use the migration file instead)
- `.env.example` (CHANGED — new optional variables, see below)

## 2. Run the new SQL

In Supabase → SQL Editor:

1. Run `supabase/migration_access_links.sql` — adds a permanent login
   token to every player (including your existing 40).
2. **Optional, for testing:** run `supabase/test_data_availability.sql` —
   loads realistic availability for 17 real players across the 30 days
   starting Monday 7/13/2026, based on their actual weekly patterns from
   your old Matcher spreadsheet. This lets you immediately test "Generate
   Matches" without manually clicking through 30 days of calendar squares
   yourself.

## 3. What each new feature does

### No-email reusable login links
Every player now has a permanent link at `/access/<their-unique-token>`.
Visiting it logs them in instantly — no email, no code, every single time,
forever. This is what they bookmark or "Add to Home Screen" on their phone.

**To get a player their link:** go to `/admin/roster`, find them, click
**"Send access link"**. This sends them ONE email containing their personal
link and instructions to bookmark it. After that, they never need email to
log in again.

(The regular `/login` email-link flow still exists too, as a backup.)

### Manager "log in as" (testing tool)
On `/admin/roster`, click **"Log in as (test)"** next to any player. This
instantly switches your own browser to that player's account so you can
test availability, matches, profile editing, etc. exactly as they'd
experience it.

**Important:** this replaces YOUR session, not adds a second one. When
you're done testing, go to `/login` and log in again with your own manager
email to get back to the manager view.

### Sandbox email mode
Add two environment variables in Vercel:
- `SANDBOX_MODE` = `true`
- `SANDBOX_EMAIL` = your own email address

While sandbox mode is on, **every** email the system would send to any
player — match proposals, nudges, cancellations, access links — instead
lands in your inbox, with the real intended recipient shown in the subject
line like `[TEST → realplayer@email.com] New match proposed`. This lets
you run full tests (including "Generate Matches" with real players) without
anyone else getting a single email.

**Turn it off** (set `SANDBOX_MODE` to `false` or delete the variable, then
redeploy) once you're ready for real emails to go to real players.

### Manual court assignment & player swap
On `/admin/matches`, every match now has:
- A **court dropdown** — change which court a match is on any time (not
  just at creation).
- Per-player **"Swap with..."** controls (only while a match is still
  PROPOSED, not after it's confirmed/cancelled) — pick a different
  available player from the dropdown and click "Swap in" to replace
  someone in the match. The newly-added player gets a fresh proposal
  email; the swapped-out player is simply removed from that match.

## 4. Suggested test run, start to finish

1. Set `SANDBOX_MODE=true` and `SANDBOX_EMAIL` to your own email in Vercel,
   redeploy.
2. Run both SQL files from step 2 above.
3. Go to `/admin/matches`, set the date range to `2026-07-13` through
   `2026-08-11` (the 30-day test window), click **Generate Matches**.
4. You should see several PROPOSED matches appear, built from the 17 test
   players' real availability patterns — and (since sandbox mode is on)
   a batch of test emails landing in your own inbox instead of real
   players' inboxes.
5. On `/admin/roster`, try **"Log in as (test)"** on one of those matched
   players, then go to `/matches` and Accept or Decline — watch the match
   flip to CONFIRMED or CANCELLED automatically.
6. Log back in as yourself (manager) via `/login`.
7. On `/admin/matches`, try the **court dropdown** and a **player swap**
   on a still-proposed match.
8. When you're happy with how it all behaves, turn `SANDBOX_MODE` back to
   `false` and redeploy before inviting real players.
