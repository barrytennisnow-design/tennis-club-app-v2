// Swaps a player out of a DRAFT match for a different player.
// Only allowed while the match is still a draft (before the
// manager clicks "Propose" and emails go out) -- no email is
// sent here, since drafts are silent working state.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { match_id, old_player_id, new_player_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin.from("matches").select("id, status").eq("id", match_id).single();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "draft") {
    return NextResponse.json({ error: "Can only swap players on a draft match" }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("match_players")
    .delete()
    .eq("match_id", match_id)
    .eq("player_id", old_player_id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: insertError } = await admin
    .from("match_players")
    .insert({ match_id, player_id: new_player_id, response_status: "proposed" });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
