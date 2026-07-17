import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { linkOrCreatePlayerForNewLogin } from "@/lib/linkPlayerAuth";

// Called right after a successful client-side supabase.auth.verifyOtp()
// on the login page (the "type the code" path). That call already
// established a real session via cookies in THIS browser -- this
// route just does the same first-login player-linking that
// /auth/callback does for the "click the link" path, so both ways of
// logging in behave identically.
export async function POST() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  await linkOrCreatePlayerForNewLogin(admin, userData.user);

  return NextResponse.json({ ok: true });
}
