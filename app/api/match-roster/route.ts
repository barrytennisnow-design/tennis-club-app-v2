import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { proposerDisplayName } from "@/lib/formatName";

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

  // The player-facing "Your Matches" page previously tried to read
  // matches.proposer (players!proposed_by) directly via the browser
  // client, which is subject to RLS on the players table -- since a
  // regular player generally can't read another player's row, that
  // join silently came back null and the page fell back to "Manager"
  // even for Build-a-Match matches proposed by a fellow player. Fetch
  // it here instead, same as the roster above, via the admin client,
  // so the player page can show the identical "Barry R. BAM4" style
  // attribution the manager Matches page already shows.
  const { data: matchRows } = await admin
    .from("matches")
    .select("id, target_size, proposer:players!proposed_by(first_name, last_name)")
    .in("id", ids);

  const matchInfo: Record<string, { proposedByName: string | null; acceptedCount: number; targetSize: number | null }> = {};
  for (const m of matchRows ?? []) {
    const proposer = Array.isArray(m.proposer) ? m.proposer[0] : m.proposer;
    const acceptedCount = (allRoster ?? []).filter((r: any) => r.match_id === m.id && r.response_status === "accepted").length;
    matchInfo[m.id] = { proposedByName: proposerDisplayName(proposer, m.target_size), acceptedCount, targetSize: m.target_size ?? null };
  }

  return NextResponse.json({ roster: allRoster ?? [], matchInfo });
}
