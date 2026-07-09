# Match Workflow Fix: Draft → Propose → Confirm/Cancel

This fixes the logic gaps you caught: matches now go through a real
workflow instead of emailing players the instant a match is generated.

## The new flow

1. **Manager clicks "Generate Match Matrix"** → builds silent **DRAFT**
   matches. No emails sent. Re-running this replaces all drafts, but never
   touches anything already proposed/confirmed/cancelled.
2. **Manager reviews drafts** on `/admin/matches` — can change the court,
   or swap a player out for someone else who's genuinely available that
   day and not already committed elsewhere.
3. **Manager clicks "Propose"** on a specific draft → *now* the 4 players
   get an email asking them to Accept or Decline.
4. **Players respond** on `/matches`. Declining lets them leave an
   optional reason.
5. **If all 4 accept** → match auto-confirms, everyone gets a confirmation
   email with a calendar invite (.ics file) attached.
6. **If anyone declines** → match auto-cancels, everyone's notified
   (including the reason, if given).
7. **Manager can cancel a match anytime** (draft, proposed, or confirmed)
   with a "Cancel match" button. Players only get an email if they'd
   already been proposed/confirmed — cancelling a draft is silent, since
   they never knew about it.
8. **Freed-up players automatically become available again** for the next
   "Generate Match Matrix" run — nothing extra needed, since the algorithm
   already only excludes players from proposed/confirmed matches, not
   cancelled ones.

## Files changed in this update

- `supabase/migration_draft_matches.sql` (NEW — run this once)
- `lib/matching.ts` (rewritten — no more emails, builds drafts, wipes old drafts before rebuilding)
- `lib/ics.ts` (NEW — calendar invite generator)
- `lib/email.ts` (added attachment support + confirmed-match template)
- `app/api/admin/propose-match/route.ts` (NEW)
- `app/api/admin/cancel-match/route.ts` (NEW)
- `app/api/respond-match/route.ts` (NEW — replaces direct database calls from the player's Accept/Decline buttons)
- `app/api/admin/swap-player/route.ts` (changed — draft-only, no email)
- `app/api/admin/assign-court/route.ts` (changed — draft-only)
- `app/admin/matches/page.tsx` (rewritten — Propose/Cancel buttons, swap list now filtered to genuinely-available, unlocked players)
- `app/matches/page.tsx` (changed — uses the new respond API, captures decline reason, hides drafts entirely from players)
- `README.md` (test-flow steps corrected)

## How to install this update

Same process as before:
1. Copy the changed/new files above into your local `tennis-app` folder
   (matching folder structure exactly), overwriting existing ones.
2. In Supabase SQL Editor, run `supabase/migration_draft_matches.sql`.
3. GitHub Desktop: review changes → commit → push. Vercel rebuilds
   automatically.

## Quick test

1. `/admin/matches` → Generate Match Matrix → confirm it says "Built N
   draft match(es)... nothing emailed yet."
2. Try a swap on a draft — confirm the dropdown only lists players who are
   actually available that day and not already locked into another match.
3. Click Propose on one draft — confirm players get an email now (or, if
   sandbox mode is on, confirm it lands in your own inbox labeled with the
   real intended recipient).
4. Log in as each of the 4 players (via "Log in as (test)" on the roster
   page) and Accept — confirm the match flips to CONFIRMED and a
   calendar invite email goes out once the 4th person accepts.
5. Try declining one instead — confirm it cancels and the reason shows up
   in the cancellation email and on the match_players decline_reason field.
6. Try "Cancel match" from the admin side on a still-proposed match —
   confirm the freed-up players show back up as valid swap candidates /
   get redrafted on the next "Generate Match Matrix" run.
