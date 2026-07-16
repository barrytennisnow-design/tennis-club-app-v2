import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

// Permanently deletes a match and its match_players rows (cascade).
// Unlike cancel-match, this is NOT reversible and sends no emails --
// it's meant for clearing out test/junk matches, not for real
// match-lifecycle actions. Manager-only, no captain permission for
// this one given how destructive and easy to misuse it'd be.
export async function POST(request: Request) {
  const { match_id } = await request.json();
  if (!match_id) return NextResponse.json({ error: "match_id is required" }, { status: 400 });

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (!me || me.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: clubSettings } = await admin.from("club_settings").select("allow_match_delete").single();
  if (clubSettings?.allow_match_delete === false) {
    return NextResponse.json({ error: "Match deletion is turned off in Settings" }, { status: 403 });
  }

  const { error } = await admin.from("matches").delete().eq("id", match_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
