// Swaps a player out of a DRAFT match for a different player.
// Only allowed while the match is still a draft (before the
// manager clicks "Propose" and emails go out) -- no email is
// sent here, since drafts are silent working state.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const { match_id, old_player_id, new_player_id } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role, permissions").eq("auth_user_id", userData.user.id).single();
  if (!hasPermission(me, "matrix_swap_players")) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();

  const { data: match } = await admin.from("matches").select("id, status, match_date, time_slot").eq("id", match_id).single();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "draft") {
    return NextResponse.json({ error: "Can only swap players on a draft match" }, { status: 400 });
  }

  // Prevent double-booking: the incoming player must not already be
  // in ANY other match (draft, proposed, or confirmed) that same
  // day/time-slot.
  const { data: conflicting } = await admin
    .from("match_players")
    .select("id, matches!inner(match_date, time_slot, status)")
    .eq("player_id", new_player_id)
    .eq("matches.match_date", match.match_date)
    .eq("matches.time_slot", match.time_slot)
    .neq("matches.status", "cancelled");

  if (conflicting && conflicting.length > 0) {
    return NextResponse.json(
      { error: "That player is already in another match that day" },
      { status: 400 }
    );
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
