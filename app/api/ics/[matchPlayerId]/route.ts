import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseServer";
import { buildMatchIcs } from "@/lib/ics";
import { getDefaultTimeDisplay, resolveTimeDisplay } from "@/lib/timeDisplay";

// Deliberately NOT session/cookie-based. iOS's Mail/Calendar apps
// often fetch a .ics URL (or anything served as text/calendar)
// through their own independent request, separate from Safari's
// authenticated browsing session -- so a check like "is there a
// valid login cookie on this request" fails there specifically,
// even for the match's own participant, which is exactly the
// "Not authorized" symptom this replaces. Instead this uses the
// match_players row's own id (an unguessable UUID, already unique
// per player per match) as the credential -- same philosophy as
// this app's existing bookmarkable /access/[token] login link.
export async function GET(request: Request, { params }: { params: { matchPlayerId: string } }) {
  const admin = createAdminClient();

  const { data: mp } = await admin
    .from("match_players")
    .select(
      "player_id, matches!inner(id, match_number, match_date, time_slot, time_display, status, court:courts(name), match_players(player_id, players(first_name, last_name)))"
    )
    .eq("id", params.matchPlayerId)
    .single();

  if (!mp) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const match = mp.matches as any;
  const defaultTimeDisplay = await getDefaultTimeDisplay(admin);
  const timeDisplay = resolveTimeDisplay(match, defaultTimeDisplay);
  const playerNames = match.match_players
    .filter((row: any) => row.players)
    .map((row: any) => `${row.players.first_name} ${row.players.last_name}`);

  const ics = buildMatchIcs({
    matchId: match.id,
    matchDate: match.match_date,
    timeDisplay,
    courtName: match.court?.name ?? "Court TBD",
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
