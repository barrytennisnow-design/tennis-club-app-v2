// Lets the manager instantly "become" any player, in the same
// browser tab, to test the system as they'd see it -- no email
// involved. Before switching, we remember the manager's own email
// in a cookie so /api/admin/stop-impersonating can switch back
// later, also with zero emails.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export const IMPERSONATOR_COOKIE = "ctn_impersonator_email";

export async function POST(request: Request) {
  const { player_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("players")
    .select("role, email")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("players")
    .select("id, first_name, last_name, email")
    .eq("id", player_id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: linkError?.message || "Could not generate session" }, { status: 500 });
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  // Remember who the real manager was, so we can switch back later
  // without needing another email round-trip.
  cookies().set(IMPERSONATOR_COOKIE, me.email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  return NextResponse.json({ ok: true, name: `${target.first_name} ${target.last_name}`, email: target.email });
}
