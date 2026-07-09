# Passkey Login (Face ID / Fingerprint / Device PIN)

This adds a faster login option on top of what you already have — it does
**not** replace email/bookmark-link login, which still works as a backup
(that's Supabase's own recommendation for this beta feature: never make
passkeys the *only* way in).

## Important limits, read this first

- **Passkeys are per-device.** A player who sets one up on their phone
  still needs email (or their bookmark link) the first time they use a
  different phone or computer — then can set up a passkey there too.
- **This is a beta API from Supabase.** It works today, but the interface
  could change in a future Supabase update.
- **A player must log in at least once the normal way** (email link or
  their bookmark link) before they can set up a passkey — you can't
  register a passkey as your very first-ever login.

## 1. Enable it in Supabase (one-time, required)

1. Go to your Supabase project → **Authentication** → look for **Passkeys**
   in the left sidebar (you may have noticed this earlier as "Passkeys
   Beta")
2. Toggle **Enable Passkey authentication** on
3. Fill in:
   - **Relying Party Display Name:** `Club Tennis` (or your club's name —
     this is what shows in the Face ID/fingerprint prompt)
   - **Relying Party ID:** your site's domain **without** `https://` and
     without any trailing slash — e.g. `tennis-club-app-gamma.vercel.app`
4. Save

**Important:** once players start registering passkeys, changing the
Relying Party ID later breaks all existing passkeys (they'd all need to
re-register). Set this once and leave it — don't change it after your
Vercel domain if you later add a custom domain, without expecting to
reset everyone's passkeys.

## 2. Get the new code onto your live site

Files changed/new in this update:
- `package.json` (changed — newer Supabase library version)
- `lib/supabaseClient.ts` (changed — opts in to the passkey feature)
- `app/login/page.tsx` (changed — adds "Sign in with Passkey" button)
- `app/profile/page.tsx` (changed — adds "Set up Passkey" button)

Same process as always: copy into your local folder, GitHub Desktop →
commit → push. Vercel will run `npm install` fresh and pick up the newer
Supabase library automatically.

## 3. How players use it

**First time (still needs email or their bookmark link):**
1. Log in normally
2. On `/profile`, see a green box: "🔒 Faster login" → click **Set up
   Passkey**
3. Their device prompts for Face ID / fingerprint / PIN — once approved,
   done

**Every time after, on that same device:**
1. Go to `/login`
2. Click **🔒 Sign in with Passkey** at the top (only shows on devices
   that support it)
3. Approve with Face ID / fingerprint / PIN — logged in instantly, no
   email at all

## 4. If it doesn't work

- If the "Sign in with Passkey" button doesn't appear at all: the device
  or browser doesn't support WebAuthn (rare on modern phones/computers,
  but older devices or some in-app browsers may not).
- If registration fails: double check step 1 was saved correctly in
  Supabase, and that the Relying Party ID exactly matches your live site's
  domain (no `https://`, no trailing slash, no typos).
- Either way, email / bookmark-link login always still works as the
  fallback — nobody gets locked out.
