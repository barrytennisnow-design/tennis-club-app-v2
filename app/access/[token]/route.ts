// The "reusable login link" a player bookmarks / adds to their
// phone's home screen. Visiting /access/<token> logs them in
// immediately, every time, forever -- no email, no expiring link.
//
// How: we look up the player by their permanent access_token,
// then use Supabase's admin API to silently mint a brand-new,
// valid magic-link sign-in behind the scenes and complete it
// server-side -- the player never sees an email or a code, they
// just land on their profile logged in.
//
// The token itself is emailed to the player ONCE (or handed out
// by the manager) -- see /api/admin/send-access-link.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const { origin } = new URL(request.url);
  const admin = createAdminClient();

  const { data: player } = await admin
    .from("players")
    .select("id, email, status")
    .eq("access_token", params.token)
    .maybeSingle();

  if (!player) {
    return NextResponse.redirect(`${origin}/?error=invalid_link`);
  }

  // Mint a fresh magic-link behind the scenes for this player.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: player.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.redirect(`${origin}/?error=link_failed`);
  }

  // Complete that sign-in server-side, right now, using the
  // request-bound client so the resulting session cookie gets
  // attached to THIS browser's response.
  const supabase = createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.redirect(`${origin}/?error=verify_failed`);
  }

  return NextResponse.redirect(`${origin}/profile`);
}
