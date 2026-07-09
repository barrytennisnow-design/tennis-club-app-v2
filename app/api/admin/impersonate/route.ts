// Lets the manager instantly "become" any player, in the same
// browser tab, to test the system as they'd see it -- no need to
// know that player's email or wait for a link. Uses the same
// silent-magic-link mechanism as /access/[token].
//
// IMPORTANT: this replaces the manager's own session with the
// target player's session in this browser. To go back to being
// the manager, log in again as the manager afterward.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { player_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("players")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("players")
    .select("id, email")
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
    return NextResponse.json({ error: "Could not generate session" }, { status: 500 });
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: target.email });
}
