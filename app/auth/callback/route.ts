import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { linkOrCreatePlayerForNewLogin } from "@/lib/linkPlayerAuth";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/matches";

  const supabase = createClient();
  let user = null;
  let authError: string | null = null;

  if (code) {
    // Real users clicking a link they themselves requested from the
    // browser go through this path (PKCE).
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      user = data.user;
    } else {
      // Most common cause: the single-use code was already consumed --
      // typically by an email provider's link-scanning/safety-check
      // bot visiting the link before the person did, or the person
      // clicking an old link a second time. Send them back to /login
      // with a clear reason instead of silently landing on a page
      // that requires auth and bouncing them again.
      authError = error.message;
    }
  } else if (tokenHash && type) {
    // Links generated server-side (e.g. via the admin API -- used by
    // Playwright's global-setup.ts, and by any other server-initiated
    // "send access link" / impersonation feature) can't carry a PKCE
    // code verifier, so Supabase issues them as a token_hash instead.
    // This verifies that token_hash directly, no fragment/implicit-flow
    // redirect involved.
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      user = data.user;
    } else {
      authError = error.message;
    }
  } else if (!code) {
    authError = "Missing login code -- the link may be incomplete.";
  }

  if (user) {
    // Uses the admin client because RLS rightly blocks a user from
    // touching a players row they don't yet own.
    const admin = createAdminClient();
    await linkOrCreatePlayerForNewLogin(admin, user);
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Don't silently redirect to a page that requires auth (which would
  // just bounce back to /login with no explanation). Send the person
  // to /login with a reason, and a hint to use the 6-digit code
  // instead if the link keeps failing.
  const reason = encodeURIComponent(
    authError || "That login link didn't work -- it may have expired or already been used."
  );
  return NextResponse.redirect(`${origin}/login?linkError=${reason}`);
}
