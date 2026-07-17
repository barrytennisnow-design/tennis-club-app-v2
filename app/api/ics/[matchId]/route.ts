import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { buildMatchIcs } from "@/lib/ics";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";

// GET so this can be a plain link (<a href="...">), not a JS-triggered
// download -- that's the actual fix for iOS Safari, which doesn't
// reliably turn a Blob/createObjectURL download into an "Add to
// Calendar" action for .ics files. A real navigation to a URL that
// returns proper text/calendar headers works correctly on both
// platforms.
export async function GET(request: Request, { params }: { params: { matchId: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await supabase.from("players").select("id, role").eq("auth_user_id", userData.user.id).single();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: match } = await admin
    .from("matches")
    .select("id, match_number, match_date, time_slot, time_display, status, court:courts(name), match_players(player_id, players(first_name, last_name))")
    .eq("id", params.matchId)
    .single();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  // Only a manager or someone actually in the match can download its invite.
  const isParticipant = match.match_players.some((mp: any) => mp.player_id === me.id);
  if (me.role !== "manager" && !isParticipant) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
  const playerNames = match.match_players
    .filter((mp: any) => mp.players)
    .map((mp: any) => `${mp.players.first_name} ${mp.players.last_name}`);

  const ics = buildMatchIcs({
    matchId: match.id,
    matchDate: match.match_date,
    timeDisplay,
    courtName: (match.court as any)?.name ?? "Court TBD",
    playerNames,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": `attachment; filename="match-${match.match_number}.ics"`,
    },
  });
}
