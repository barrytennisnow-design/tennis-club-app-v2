// Same idea as /api/admin/impersonate, but as a real GET link/redirect
// instead of a background fetch() call. This matches the pattern your
// actual login already uses successfully (/auth/callback) -- a full
// page navigation reliably carries the new session cookies forward,
// where a fetch()-then-reload can be less reliable across browsers.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { IMPERSONATOR_COOKIE } from "@/lib/impersonation";
import { ensurePlayerAuthLinked } from "@/lib/linkPlayerAuth";

export async function GET(request: Request, { params }: { params: { player_id: string } }) {
  const { origin } = new URL(request.url);
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.redirect(`${origin}/login?error=not_authenticated`);
  }

  const { data: me } = await supabase
    .from("players")
    .select("role, email")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (me?.role !== "manager") {
    return NextResponse.redirect(`${origin}/?error=not_authorized`);
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("players")
    .select("id, email")
    .eq("id", params.player_id)
    .single();

  if (!target) {
    return NextResponse.redirect(`${origin}/admin/roster?error=player_not_found`);
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.redirect(`${origin}/admin/roster?error=link_failed`);
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.redirect(`${origin}/admin/roster?error=verify_failed`);
  }

  await ensurePlayerAuthLinked(admin, target.id, linkData.user.id);

  cookies().set(IMPERSONATOR_COOKIE, me.email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  return NextResponse.redirect(`${origin}/profile`);
}
