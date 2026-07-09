// Core match-making algorithm -- builds silent DRAFT matches only.
// No emails are sent here. Drafts are a manager's working scratch
// pad: re-running this wipes out any existing drafts and rebuilds
// them fresh from current availability, WITHOUT touching any match
// that's already been proposed, confirmed, or cancelled (those are
// "live" and out of scope for regeneration).
//
// For each day/time-slot in the given date range:
//   1. Find active players available that day who are not already
//      tied up in a PROPOSED or CONFIRMED match that day (drafts
//      don't count as "tied up" -- they're freely rebuildable).
//   2. Sort them by ranking (so groups are skill-balanced).
//   3. Chunk into groups of 4. Leftover 1-3 players simply aren't
//      drafted that day.
//   4. Assign each group of 4 to a court on a rotating basis.
//   5. Insert a `matches` row (status=draft) + 4 `match_players`
//      rows (status=proposed, meaning "proposed to be in this
//      group" -- no email goes out at this stage; that field just
//      tracks the assignment until the manager clicks Propose).

export interface GenerateMatchesParams {
  supabaseAdmin: any;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export async function generateMatches({ supabaseAdmin, startDate, endDate }: GenerateMatchesParams) {
  // Wipe existing DRAFT matches so this run starts clean. Their
  // match_players rows cascade-delete automatically (FK ON DELETE
  // CASCADE). Proposed/confirmed/cancelled matches are untouched.
  const { data: oldDrafts } = await supabaseAdmin.from("matches").select("id").eq("status", "draft");
  if (oldDrafts && oldDrafts.length > 0) {
    await supabaseAdmin.from("matches").delete().in("id", oldDrafts.map((m: any) => m.id));
  }

  const { data: courts } = await supabaseAdmin.from("courts").select("*").order("name");
  const courtList = courts && courts.length > 0 ? courts : [{ id: null, name: "Court TBD" }];

  const { data: availabilityRows } = await supabaseAdmin
    .from("availability")
    .select("player_id, date, time_slot, players!inner(id, first_name, last_name, email, ranking, status)")
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("players.status", "active");

  // Only PROPOSED and CONFIRMED matches lock a player out of being
  // re-drafted -- drafts themselves never lock anyone (we just wiped
  // them above anyway).
  const { data: lockedRows } = await supabaseAdmin
    .from("locked_availability")
    .select("player_id, date, time_slot");
  const lockedSet = new Set((lockedRows ?? []).map((r: any) => `${r.player_id}_${r.date}_${r.time_slot}`));

  const byDay: Record<string, any[]> = {};
  for (const row of availabilityRows ?? []) {
    const key = `${row.date}_${row.time_slot}`;
    if (lockedSet.has(`${row.player_id}_${row.date}_${row.time_slot}`)) continue;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
  }

  const results: { date: string; time_slot: string; matchesCreated: number }[] = [];
  let courtCursor = 0;

  for (const key of Object.keys(byDay)) {
    const [date, time_slot] = key.split("_");
    const players = byDay[key]
      .slice()
      .sort((a, b) => (a.players.ranking ?? 0) - (b.players.ranking ?? 0));

    let created = 0;
    for (let i = 0; i + 4 <= players.length; i += 4) {
      const group = players.slice(i, i + 4);
      const court = courtList[courtCursor % courtList.length];
      courtCursor++;

      const { data: match, error: matchError } = await supabaseAdmin
        .from("matches")
        .insert({
          match_date: date,
          time_slot,
          court_id: court.id,
          status: "draft",
        })
        .select()
        .single();

      if (matchError || !match) continue;

      await supabaseAdmin.from("match_players").insert(
        group.map((g: any) => ({
          match_id: match.id,
          player_id: g.player_id,
          response_status: "proposed",
        }))
      );

      created++;
    }
    if (created > 0) results.push({ date, time_slot, matchesCreated: created });
  }

  return results;
}
