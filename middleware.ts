// TEMPORARY TESTING FEATURE -- delete this entire file before the
// system goes live. While club_settings.email_test_mode_disable_emails
// is on, any visitor with no existing session is automatically logged
// in as the first active manager account -- no login link, no code,
// no click. This exists purely so testing doesn't require waiting on
// emails; it is a genuine authentication bypass while active, and
// must never ship live.
//
// How it actually establishes a real session (not a fake one): it
// uses the Supabase admin API to generate a one-time login code for
// the manager account, then immediately verifies that code itself,
// server-side, right here -- exactly what happens when a person types
// a code on the login page, just automated. Real session cookies get
// set on the response, so every page/API route downstream sees a
// genuinely authenticated manager, same as if they'd logged in by
// hand.

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (user) return response; // already logged in as someone -- never override a real session

  // Guard against retrying on every single page load if the session
  // somehow isn't sticking (e.g. a cookie-propagation edge case) --
  // without this, a broken loop here would hammer Supabase's own
  // magic-link rate limit for the manager's email, which could then
  // make REAL login attempts for that same email fail too.
  const recentAttemptCookie = request.cookies.get("auto_login_attempted");
  if (recentAttemptCookie) return response;

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: settings } = await admin
    .from("club_settings")
    .select("email_test_mode_disable_emails")
    .single();
  if (settings?.email_test_mode_disable_emails !== true) return response; // feature is off -- normal login required

  const { data: manager } = await admin
    .from("players")
    .select("email")
    .eq("role", "manager")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!manager?.email) return response; // no manager account to log in as

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: manager.email,
  });
  const token = linkData?.properties?.hashed_token;
  if (!token) return response;

  // Verifying through the REQUEST-scoped `supabase` client (not the
  // admin client) is what makes the `set` callback above fire and
  // actually attach real session cookies to `response`. Note this
  // reassigns `response` to a new object each time it fires -- which
  // is exactly why the guard cookie below is set LAST, on whatever
  // `response` ends up being, rather than earlier (an earlier
  // attempt at this got silently wiped out by that reassignment).
  await supabase.auth.verifyOtp({ email: manager.email, token, type: "email" });

  response.cookies.set("auto_login_attempted", "1", { maxAge: 60, path: "/" });
  return response;
}

export const config = {
  // Runs on every page/API route except static assets and the cron
  // endpoint (which authenticates via CRON_SECRET, not a user
  // session, and should never be auto-logged-in).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
