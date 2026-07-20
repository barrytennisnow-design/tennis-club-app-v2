import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { linkOrCreatePlayerForNewLogin } from "@/lib/linkPlayerAuth";
import type { EmailOtpType } from "@supabase/supabase-js";

// Redeems a magic-link token_hash. Deliberately a POST endpoint,
// called only when the person clicks the "Finish logging in" button
// on /auth/confirm -- never on the plain GET page load. This is what
// makes it safe against email providers that auto-visit (GET) links
// in incoming mail to scan them for phishing/malware: that passive
// visit hits /auth/confirm's page (which does nothing by itself) and
// never reaches this route, so it can't burn the single-use token
// before the real person clicks.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tokenHash = body?.token_hash as string | undefined;
  const type = body?.type as EmailOtpType | undefined;

  if (!tokenHash || !type) {
    return NextResponse.json({ error: "Missing token_hash or type." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "That login link didn't work -- it may have expired or already been used." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  await linkOrCreatePlayerForNewLogin(admin, data.user);

  return NextResponse.json({ ok: true });
}
