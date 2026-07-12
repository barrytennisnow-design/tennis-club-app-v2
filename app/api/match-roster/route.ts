import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchIds = searchParams.get("match_ids");

  if (!matchIds) {
    return NextResponse.json({ error: "match_ids required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();

  // Verify the user is a player in at least one of these matches
  const { data: userPlayer } = await admin
    .from("players")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .single();

  if (!userPlayer) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const ids = matchIds.split(",");
  
  // Check if user is in any of these matches
  const { data: userMatchPlayers } = await admin
    .from("match_players")
    .select("match_id")
    .eq("player_id", userPlayer.id)
    .in("match_id", ids);

  if (!userMatchPlayers || userMatchPlayers.length === 0) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Fetch roster for all matches the user is in
  const { data: allRoster } = await admin
    .from("match_players")
    .select("match_id, response_status, players(first_name, last_name, phone)")
    .in("match_id", ids);

  return NextResponse.json({ roster: allRoster ?? [] });
}
