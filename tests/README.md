# Testing this app

Two layers, for two different jobs:

1. **Unit tests** (`tests/unit/`) — test pure logic functions directly. No
   database, no browser, no deployed site needed. Fast (under a second),
   safe to run anytime, and already verified passing (45/45) against the
   current code.
2. **End-to-end tests** (`tests/specs/`) — drive a real browser against a
   real (test) deployment and a real (test) Supabase database, clicking
   through actual user flows. These need one-time setup below before they
   can run at all.

Start with unit tests — they need zero setup and already work.

---

## 1. Unit tests

### Run them

```bash
npm run test:unit
```

That's it. No environment variables, no database, no Playwright install.
Requires **Node 22.6 or newer** (uses `--experimental-strip-types` to run
`.mts` test files directly, with no extra build step or dependency).

If you're on an older Node version, check with `node --version`. On
Node 23.6+, drop the flag entirely — that version made TypeScript
stripping the default. On older Node, upgrade (nvm/Vercel dev tooling/
your package manager) or ask to add `tsx` as a devDependency instead.

### What's covered today

- `lib/permissions.ts` — `hasPermission` / `numericPermission`, including
  the exact captain-permission-gap pattern that caused two real bugs
  this session (missing roster visibility, missing display-days-ahead
  default).
- `lib/formatDate.ts` — date formatting, including the non-obvious
  "no leading zeros" format (`7-16-26`, not `07-16-26`) that's tripped
  up test code before.
- `lib/selfServe.ts` — the self-serve eligibility window boundary logic.
- `lib/matching.ts` — `getNextMatchNumber`, specifically the exact
  regression from this session: a DRAFT match sitting on the Match
  Matrix must reserve its number just as much as a proposed/
  confirmed/cancelled one, or a later self-serve proposal (or another
  Generate run) can be handed that same number.
- `lib/ics.ts` — calendar invite generation, specifically guarding the
  two real regressions from this session: the two-alarm requirement
  (30 min / 15 min) and the `X-APPLE-TRAVEL-DURATION` property
  confirmed from the prior working system's actual source code.

### Adding more

Any pure function (no database call, no React, no side effects) is a
good candidate. Copy the pattern in any existing `tests/unit/*.test.mts`
file: import directly from `../../lib/whatever.ts` (the `.ts` extension
in the import path is required with `--experimental-strip-types`,
unlike normal TypeScript), write `describe`/`test` blocks from
`node:test`, assert with `node:assert/strict`.

---

## 2. End-to-end (Playwright) tests

These click through the real app in a real browser — building self-serve
matches, generating the Match Matrix, cancelling/deleting matches,
checking what a captain can and can't see. They need a **dedicated test
environment**, set up once.

### ⚠️ Before anything else: never point these at your production Supabase project or live Vercel site

These tests create and delete real data — matches, availability, club
settings changes. Running them against production risk mixing test junk
into real club data, or (worse) emailing real members if sandbox mode
ever got toggled off mid-run. Everything below assumes a **second,
separate Supabase project** used only for testing.

### One-time setup

**A. Create a test Supabase project**

Free tier is fine. In the SQL Editor, run every file in `supabase/` in
this order:
1. `schema.sql`
2. Every `migration_*.sql` file, in roughly chronological order (check
   each file's own comments if order matters — most are independent)
3. `tests/fixtures/seed_test_players.sql` — creates the fake test
   accounts these tests log in as (`e2e-manager@example-test.invalid`
   and similar). These are NOT real people; the email domain is
   deliberately invalid so nothing can ever actually be delivered
   there even by accident.

**B. Deploy a test instance of the app**

Point a Vercel deployment (or `npm run dev` locally) at this test
Supabase project's URL/keys — completely separate from your production
Vercel env vars. Go to Settings on this test instance and turn **Email
Test Mode ON** with your own email as the sandbox address — belt and
suspenders alongside the fake test-player emails.

**C. Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

**D. Set environment variables** (in your shell, a `.env.test` file you
source, or your CI's secrets — NOT committed to the repo):

```bash
export TEST_SITE_URL="https://your-test-deployment.vercel.app"
export TEST_SUPABASE_URL="https://your-test-project.supabase.co"
export TEST_SUPABASE_SERVICE_ROLE_KEY="your-test-project-service-role-key"
```

The service role key is under your test project's Settings → API —
**never use your production project's service role key here.**

### Run them

```bash
cd tests
npx playwright test
```

First run will:
1. Log in as each test role (manager, captain, playerA–F) using a
   magic link generated server-side via the Supabase admin API (no real
   email needed — see `tests/setup/global-setup.ts` for exactly how).
2. Save each login session to `tests/.auth/*.json` (gitignored).
3. Run every spec in `tests/specs/`.

See results in the terminal, or open the HTML report after a run:

```bash
npx playwright show-report
```

### What's covered today

- **`self-serve-group-sizes.spec.ts`** — builds a self-serve match at
  every valid size (2 through 6 total players), plus confirms a
  non-opted-in player can still be *invited* into a match even though
  they can't build their own. This is the exact area that had a
  hardcoded "exactly 3 others" bug hiding every group size except
  doubles.
- **`captain-roster-visibility.spec.ts`** — confirms a captain can see
  the full roster (not just themselves) on both the Roster page and
  the Match Matrix. Guards against the RLS gap where captains could
  only ever see their own row despite having full permissions granted.
- **`match-numbering.spec.ts`** — confirms a cancelled match's number
  is never reused by a later Generate Match Matrix run, AND (added
  this session) that an un-proposed draft's number is never handed to
  a self-serve match built while that draft is still sitting on the
  Match Matrix.
- **`matches-delete-toggle.spec.ts`** — confirms the Settings page's
  "allow match delete" toggle actually blocks deletion server-side
  (not just hides the button), and that flipping it back on restores
  both.

### What's NOT covered yet (known gaps, worth adding next)

- Match proposal → accept/decline → auto-confirm flow end-to-end
- Auto-cancel timeout (cron job) behavior
- Email content/attachment correctness (would need an actual test
  inbox service, e.g. Mailosaur, since sandbox mode only redirects
  where email goes, not what's in it)
- Impersonation flow
- The Settings page's other manager-only toggles (sandbox mode,
  self-serve window)
- Visual/color regressions on the Match Matrix (the per-day color
  uniqueness fix) — this is inherently a visual check; consider
  Playwright's screenshot comparison (`toHaveScreenshot()`) if this
  area breaks again

### Adding more specs

Copy the pattern in any existing `tests/specs/*.spec.ts` file:
- `roleContextAndPage(browser, "manager" | "captain" | "playerA" | ...)`
  from `../setup/roles` gets you a logged-in browser context for
  whichever role the scenario needs — open multiple at once for
  multi-person flows (e.g. one player proposes, another accepts).
- `setAvailable(...)`, `clearTestMatchesOn(...)`, `isoDaysFromNow(...)`,
  `adminDb()` from `../setup/db` handle seeding/cleanup, always using
  dates relative to "today" so tests never go stale.
- Prefer hitting real API routes via `page.request.post(...)` for setup
  steps that aren't the actual thing under test (faster and more
  reliable than clicking through unrelated UI), and use real UI
  interaction (`page.getByRole(...).click()`) for the behavior you're
  actually verifying.
