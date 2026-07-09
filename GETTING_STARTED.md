# Getting Started — No Experience Needed

This walks through every click, in order. Budget about 45-60 minutes for
the first time through. Everything is free.

You'll create accounts on 4 free websites:
1. **GitHub** — stores your code
2. **Supabase** — your database + login system
3. **Resend** — sends emails
4. **Vercel** — hosts your actual website

---

## STEP 1 — Create a GitHub account and upload the code

1. Go to **https://github.com/signup** and create a free account.
2. Once logged in, go to **https://github.com/new**
3. Name the repository `tennis-club-app` (or anything you like)
4. Leave it set to **Public** (or Private, either works)
5. Do NOT check any of the "Initialize with..." boxes
6. Click **Create repository**
7. On the next page, look for a link that says **"uploading an existing file"**
   — click that
8. Unzip the `tennis-club-app.zip` file I gave you on your computer (double
   click it — most computers unzip automatically)
9. Drag the whole unzipped `tennis-app` folder's **contents** (not the
   folder itself — open it and select everything inside) into the GitHub
   upload box
10. Scroll down, click **Commit changes**

You now have your code on GitHub. Keep this browser tab open — you'll need
this repo again in Step 4.

---

## STEP 2 — Create your Supabase database

1. Go to **https://supabase.com** → click **Start your project**
2. Sign up (easiest: "Continue with GitHub" since you just made that account)
3. Click **New Project**
4. Fill in:
   - **Name:** Tennis Club (or anything)
   - **Database Password:** click "Generate a password" and **save it
     somewhere** (a notes app) — you likely won't need it again but keep it
     just in case
   - **Region:** pick whichever is closest to Florida (e.g. "East US")
5. Click **Create new project** and wait ~2 minutes while it sets up

### Now load your database structure:

6. On the left sidebar, click the **SQL Editor** icon (looks like `>_`)
7. Click **New query**
8. Open the file `tennis-app/supabase/schema.sql` from the zip I gave you
   (open it in Notepad, TextEdit, or any text editor)
9. Select all the text (Ctrl+A / Cmd+A), copy it, and paste it into the
   Supabase SQL editor
10. Click **Run** (bottom right, or Ctrl+Enter). You should see "Success."
11. Click **New query** again, and repeat steps 8-10 with
    `tennis-app/supabase/seed.sql`
12. Click **New query** again, and repeat with
    `tennis-app/supabase/import_roster.sql` — this loads your real 40
    players in

### Now grab your keys (you'll need these in Step 4):

13. On the left sidebar, click the **gear icon (Settings)** → **API Keys**
    (or click the **Connect** button near the top of your project page —
    either one gets you to the same info)
14. You'll see tabs: **API Keys** and **Legacy API Keys**. Click **API Keys**
    (not Legacy). You'll see:
    - **Project URL** → copy this, label it `NEXT_PUBLIC_SUPABASE_URL`
    - **Publishable key** (starts with `sb_publishable_...`) → copy this,
      label it `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - **Secret keys** section — if empty, click **Create new API Keys**
      first, then copy the value shown (starts with `sb_secret_...`) →
      label it `SUPABASE_SERVICE_ROLE_KEY` — keep this one especially
      private

    (Supabase renamed these recently — "Publishable key" does the same job
    the old "anon key" used to, and "Secret key" does the same job the old
    "service_role key" used to. The labels above are what matters for the
    next step, not which exact key-naming system your project shows.)

---

## STEP 3 — Create your Resend account (for sending emails)

1. Go to **https://resend.com** → click **Sign up** (free, no credit card)
2. Once logged in, click **API Keys** in the left sidebar
3. Click **Create API Key**, name it anything (e.g. "tennis app"), click
   Create
4. Copy the key shown (starts with `re_`) into your notes file, labeled
   `RESEND_API_KEY`
5. For now, in your notes, just write:
   `EMAIL_FROM=Club Tennis <onboarding@resend.dev>`
   (This works immediately for testing. Later, if you want emails to go to
   ALL your players — not just yourself — come back and I'll walk you
   through verifying your own domain, which takes 10 more minutes.)

6. Make up a random secret password for the reminder job. Anything works,
   e.g. mash your keyboard: `xk29Lp7qzM3vWnR8`. Write it in your notes
   labeled `CRON_SECRET`.

---

## STEP 4 — Deploy your website with Vercel

1. Go to **https://vercel.com/signup**
2. Click **Continue with GitHub** and log in with the GitHub account from
   Step 1
3. Click **Add New...** → **Project**
4. Find your `tennis-club-app` repo in the list and click **Import**
5. Before clicking Deploy, click to expand **Environment Variables**
6. Add each of these one at a time (Name on the left, Value on the right,
   click "Add" after each):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | (from Step 2, #14) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (from Step 2, #14) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (from Step 2, #14) |
   | `RESEND_API_KEY` | (from Step 3, #4) |
   | `EMAIL_FROM` | `Club Tennis <onboarding@resend.dev>` |
   | `CRON_SECRET` | (your made-up secret from Step 3, #6) |
   | `NEXT_PUBLIC_SITE_URL` | leave blank for now, we'll fix this next |

7. Click **Deploy** and wait ~2 minutes
8. When it's done, click **Continue to Dashboard** — you'll see a URL like
   `tennis-club-app-abc123.vercel.app`. Copy that full URL (with `https://`
   in front).

### One more fix-up now that you have your real URL:

9. Go to **Settings** (top nav) → **Environment Variables**
10. Find `NEXT_PUBLIC_SITE_URL`, click the **⋯** menu → **Edit**, and paste
    in your real URL from step 8 (e.g. `https://tennis-club-app-abc123.vercel.app`)
    — no trailing slash
11. Save
12. Go to the **Deployments** tab, click the **⋯** on the newest deployment
    → **Redeploy** (this picks up the URL you just fixed)

---

## STEP 5 — Connect Supabase to your real website URL

1. Back in Supabase: **Authentication** (left sidebar) → **URL Configuration**
2. **Site URL:** paste your Vercel URL from Step 4
3. **Redirect URLs:** click Add URL, paste your Vercel URL + `/auth/callback`
   (e.g. `https://tennis-club-app-abc123.vercel.app/auth/callback`)
4. Save

---

## STEP 6 — Make yourself the manager

1. In Supabase, go to **SQL Editor** → **New query**
2. Paste this, replacing the email with your actual email address:
   ```sql
   update players set role = 'manager', status = 'active'
   where email = 'your-email@example.com';
   ```
   (If you're not already one of the 40 imported players, first sign up
   through your live website at `/signup`, THEN run this command.)
3. Click Run

---

## STEP 7 — Try it out

1. Go to your website URL (e.g. `https://tennis-club-app-abc123.vercel.app`)
2. Click **Log in**, type your email, check your inbox, click the link
3. Go to `/admin` in the address bar — you should see the manager dashboard
4. Go to `/admin/roster` — you should see your 40 imported players

If any step above doesn't work exactly like this describes, copy the exact
error message or take a screenshot and send it — that's much easier to
debug together than guessing.

---

## What to do next

Once this is live, come back and I can walk you through, one at a time:
- Verifying your own email domain in Resend (so emails go to everyone, not
  just your own inbox)
- Testing the match-making flow end-to-end with real players
- Any tweaks to how matches get grouped, or how the site looks
