# Get these from your Supabase project: Settings -> API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Service role key: Settings -> API -> service_role (SECRET, server-only)
# Used only in app/api routes for admin actions (approving players, generating matches)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Full URL of your deployed app (used to build magic-link redirect)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Resend (https://resend.com) - free tier, used to send match-proposed,
# nudge, and cancellation emails. Get a key at resend.com/api-keys.
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Club Tennis <onboarding@resend.dev>

# Random secret string you make up yourself (e.g. run `openssl rand -hex 16`).
# Protects the /api/cron/match-reminders endpoint so only Vercel's
# scheduler (or you, manually) can trigger it.
CRON_SECRET=your-random-secret-string

# Sandbox mode (optional, for testing): when SANDBOX_MODE=true, every
# email the system would send to a player instead goes to SANDBOX_EMAIL,
# with the real intended recipient noted in the subject line. Great for
# testing match proposals/nudges without spamming real players. Leave
# SANDBOX_MODE unset (or "false") for real production use.
SANDBOX_MODE=false
SANDBOX_EMAIL=you@example.com
