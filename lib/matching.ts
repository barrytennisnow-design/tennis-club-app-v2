// Core match-making algorithm -- builds silent DRAFT matches only.
// No emails are sent here. Drafts are a manager's working scratch
// pad: re-running this wipes out any existing DRAFTS ONLY and
// rebuilds them fresh from current availability, WITHOUT touching
// any match that's already been proposed, confirmed, or cancelled
// (those are "live"/historical and out of scope for regeneration).
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

// Shared by generateMatches (below) and the self-serve match-builder
// API route -- ANY new match, regardless of who/what creates it,
// needs the same "next number after the highest visible one" logic.
// This exact logic has already had two numbering bugs fixed in it
// (counting stale draft/cancelled rows, and non-chronological
// assignment order) -- duplicating it elsewhere risks reintroducing
// either one.
export async function getNextMatchNumber(supabaseAdmin: any): Promise<number> {
  const { data: maxMatch } = await supabaseAdmin
    .from("matches")
    .select("match_number")
    .neq("status", "draft")
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (maxMatch?.match_number ?? 0) + 1;
}

export async function generateMatches({ supabaseAdmin, startDate, endDate }: GenerateMatchesParams) {
  // Number the new batch starting from the highest match_number ever
  // assigned to a proposed, confirmed, OR cancelled match. Match
  // numbers are unique and must never be reused -- a cancelled match
  // stays permanently visible on the Matches page under its original
  // number, so handing that same number to a new match would put two
  // different matches on screen both labeled e.g. "M3". Only drafts
  // are excluded: they're this function's own scratch pad, wiped and
  // rebuilt every run, and never held a number that needs protecting.
  // If there are no non-draft matches at all, numbering restarts at M1.
  let nextMatchNumber = await getNextMatchNumber(supabaseAdmin);

  // Wipe existing DRAFT matches so this run starts clean. Cancelled
  // matches are NOT touched -- they're historical record and should
  // stay visible on the Matches Tracking page indefinitely, same as
  // proposed/confirmed matches. (This used to also delete cancelled
  // matches "to clear the clutter" -- that was wrong: it silently
  // erased real cancellation history every time a manager regenerated
  // the matrix, whether the match came from the matrix or self-serve.)
  const { data: staleMatches } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("status", "draft");
  if (staleMatches && staleMatches.length > 0) {
    await supabaseAdmin.from("matches").delete().in("id", staleMatches.map((m: any) => m.id));
  }

  // Courts are managed on the Manager Settings page (add / edit /
  // reorder / default / retire / clone). Only ACTIVE courts are
  // eligible for auto-assignment -- a retired court stays attached
  // to its historical matches but is never picked for new ones.
  // Ordering follows the manager's sort_order, and the designated
  // default court (courts.is_default) is always preferred.
  const { data: courts } = await supabaseAdmin
    .from("courts")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  const courtList = courts && courts.length > 0 ? courts : [{ id: null, name: "Court TBD" }];
  const defaultCourt = courtList.find((c: any) => c.is_default) ?? null;

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

  // Match numbers are assigned in loop order below, so that order has
  // to be chronological (earliest date first) -- otherwise whatever
  // order Supabase happened to return availability rows in (NOT
  // date order) determines numbering, which is what was causing
  // later dates to sometimes get lower numbers than earlier ones.
  // Same-day slots are then ordered by time_slot name as a stable
  // tiebreaker.
  const orderedKeys = Object.keys(byDay).sort((a, b) => {
    const [dateA, slotA] = a.split("_");
    const [dateB, slotB] = b.split("_");
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return slotA.localeCompare(slotB);
  });

  for (const key of orderedKeys) {
    const [date, time_slot] = key.split("_");
    const players = byDay[key]
      .slice()
      .sort((a, b) => (a.players.ranking ?? 0) - (b.players.ranking ?? 0));

    let created = 0;
    for (let i = 0; i + 4 <= players.length; i += 4) {
      const group = players.slice(i, i + 4);
      const court = defaultCourt ?? courtList[courtCursor % courtList.length];
      courtCursor++;

      const { data: match, error: matchError } = await supabaseAdmin
        .from("matches")
        .insert({
          match_number: nextMatchNumber++,
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
