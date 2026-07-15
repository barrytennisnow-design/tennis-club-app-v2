// Swaps two players' positions on the Match Matrix. Handles both
// cases:
//   - One is in a draft match, the other is "Unassigned" (available
//     that day, no match yet) -- the unassigned player takes the
//     match spot, the other becomes unassigned.
//   - Both are in different draft matches the same day -- a true
//     two-way swap, each takes the other's spot.
// Both matches involved (if any) must still be DRAFT status.

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const { slotA, slotB } = await request.json();
  // slotA / slotB: { playerId: string, matchId: string | null }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role, permissions").eq("auth_user_id", userData.user.id).single();
  if (!hasPermission(me, "matrix_swap_players")) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!slotA?.playerId || !slotB?.playerId) {
    return NextResponse.json({ error: "Both players are required" }, { status: 400 });
  }
  if (!slotA.matchId && !slotB.matchId) {
    return NextResponse.json({ error: "At least one player must currently be in a match" }, { status: 400 });
  }
  if (slotA.playerId === slotB.playerId) {
    return NextResponse.json({ error: "Can't swap a player with themself" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Validate any involved match is still a draft.
  for (const matchId of [slotA.matchId, slotB.matchId].filter(Boolean)) {
    const { data: m } = await admin.from("matches").select("status").eq("id", matchId).single();
    if (!m || m.status !== "draft") {
      return NextResponse.json({ error: "Can only swap players on draft matches" }, { status: 400 });
    }
  }

  // Case: both in different matches -- true two-way swap.
  if (slotA.matchId && slotB.matchId) {
    await admin.from("match_players").delete().eq("match_id", slotA.matchId).eq("player_id", slotA.playerId);
    await admin.from("match_players").delete().eq("match_id", slotB.matchId).eq("player_id", slotB.playerId);
    await admin.from("match_players").insert([
      { match_id: slotA.matchId, player_id: slotB.playerId, response_status: "proposed" },
      { match_id: slotB.matchId, player_id: slotA.playerId, response_status: "proposed" },
    ]);
    return NextResponse.json({ ok: true });
  }

  // Case: one is unassigned -- move the unassigned player into the
  // match, and the matched player becomes unassigned.
  const matchId = slotA.matchId ?? slotB.matchId;
  const incomingPlayerId = slotA.matchId ? slotB.playerId : slotA.playerId;
  const outgoingPlayerId = slotA.matchId ? slotA.playerId : slotB.playerId;

  await admin.from("match_players").delete().eq("match_id", matchId).eq("player_id", outgoingPlayerId);
  await admin.from("match_players").insert({ match_id: matchId, player_id: incomingPlayerId, response_status: "proposed" });

  return NextResponse.json({ ok: true });
}
