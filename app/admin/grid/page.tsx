"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatPhone } from "@/lib/formatPhone";
import { formatShortDateWithWeekday } from "@/lib/formatDate";

function isoDaysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
// Builds every date from start to end, inclusive. Used so the grid
// ALWAYS shows exactly the range currently selected in the date
// pickers -- previously the grid was hardcoded to "today + 30 days"
// regardless of what range you generated matches for, so newly
// created matches outside that fixed window silently never appeared.
function daysBetween(start: string, end: string) {
  const days: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  let guard = 0;
  while (cur <= last && guard < 400) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return days;
}

// Same color palette style as the old sheet -- one color per match,
// cycling through the set, NOT tied to status. "Unassigned" (available
// but not yet in a match) always gets the light grey.
const MATCH_PALETTE = [
  "bg-[#FFE8D6]", // orange
  "bg-[#D4EDDA]", // green
  "bg-[#FFF3CD]", // yellow
  "bg-[#D1ECF1]", // blue
  "bg-[#F8D7DA]", // red
  "bg-[#E5D4ED]", // purple
];
const UNASSIGNED_COLOR = "bg-[#F8F9FA]";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [defaultTimeDisplay, setDefaultTimeDisplay] = useState("");
  const [timeChoice, setTimeChoice] = useState<string>("");
  const [customTime, setCustomTime] = useState<string>("");
  const [availabilityByDay, setAvailabilityByDay] = useState<Record<string, any[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDaysFromNow(0));
  const [endDate, setEndDate] = useState(isoDaysFromNow(29));
  const [viewStart, setViewStart] = useState(isoDaysFromNow(0));
  const [viewEnd, setViewEnd] = useState(isoDaysFromNow(29));
  const [selected, setSelected] = useState<{ playerId: string; date: string } | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapSlots, setSwapSlots] = useState<{ playerId: string; matchId: string | null; date: string; label: string }[]>([]);
  const [swapBusy, setSwapBusy] = useState(false);
  const [editingMatch, setEditingMatch] = useState<{ matchId: string; field: 'court' | 'time' } | null>(null);
  const [tempCourt, setTempCourt] = useState<string>("");
  const [tempTime, setTempTime] = useState<string>("");
  const days = daysBetween(viewStart, viewEnd);

  async function load() {
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name, ranking, days_per_week, days_in_a_row, zip, phone, email, notes, status")
      .eq("status", "active");
    const sorted = (playerRows ?? []).slice().sort((a, b) => {
      const rankDiff = (b.ranking ?? 0) - (a.ranking ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return a.first_name.localeCompare(b.first_name);
    });
    setPlayers(sorted);

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("id, match_number, match_date, time_slot, time_display, status, court:courts(id, name), match_players(id, player_id, response_status, players(id, first_name, last_name))")
      .gte("match_date", days[0])
      .lte("match_date", days[days.length - 1])
      .neq("status", "cancelled");
    if (matchError) {
      setLoadError(`Couldn't load matches: ${matchError.message}`);
    } else {
      setLoadError(null);
    }
    setMatches(matchRows ?? []);

    // Only ACTIVE courts are offered as assignment options -- courts
    // retired from Manager Settings drop out of the picker but stay
    // attached to whatever historical matches already reference them.
    const { data: courtRows } = await supabase
      .from("courts")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    setCourts(courtRows ?? []);

    // Same for time slots -- managed on the Manager Settings page,
    // and the one flagged is_default drives the "Default (...)"
    // option and the fallback shown when a match has no override.
    const { data: timeSlotRows } = await supabase
      .from("time_slots")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    setTimeSlots(timeSlotRows ?? []);
    const defaultSlot = (timeSlotRows ?? []).find((t: any) => t.is_default);
    setDefaultTimeDisplay(defaultSlot?.description ?? "");

    const { data: availRows } = await supabase
      .from("availability")
      .select("date, time_slot, player_id, players(id, first_name, last_name, status)");
    const byDay: Record<string, any[]> = {};
    for (const row of availRows ?? []) {
      if ((row as any).players?.status !== "active") continue;
      const key = `${row.date}_${row.time_slot}`;
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(row);
    }
    setAvailabilityByDay(byDay);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [viewStart, viewEnd]);

  async function handleGenerate() {
    setGenerating(true);
    setLastResult(null);
    const res = await fetch("/api/generate-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    const json = await res.json();
    setGenerating(false);
    if (json.ok) {
      const total = json.results.reduce((s: number, r: any) => s + r.matchesCreated, 0);
      setLastResult(`Built ${total} draft match(es) across ${json.results.length} day(s). Cancelled matches were cleared and their players redrafted.`);
      // Make sure the grid's visible window actually covers whatever
      // range was just generated -- otherwise new matches could exist
      // in the database but never show up on screen.
      let expanded = false;
      if (startDate < viewStart) { setViewStart(startDate); expanded = true; }
      if (endDate > viewEnd) { setViewEnd(endDate); expanded = true; }
      if (!expanded) load();
    } else {
      setLastResult(`Error: ${json.error}`);
    }
  }

  // player_id_date -> match they're in that day (if any)
  const cellIndex: Record<string, any> = {};
  for (const m of matches) {
    for (const mp of m.match_players) {
      cellIndex[`${mp.player_id}_${m.match_date}`] = m;
    }
  }
  // player_id_date -> true if available that day but not in a match
  const availIndex = new Set<string>();
  for (const key of Object.keys(availabilityByDay)) {
    const [date] = key.split("_");
    for (const row of availabilityByDay[key]) {
      if (!cellIndex[`${row.player_id}_${date}`]) availIndex.add(`${row.player_id}_${date}`);
    }
  }

  // Only show players available (or already matched) on at least one
  // of the visible days -- keeps the grid focused on people who are
  // actually relevant right now.
  const daySet = new Set(days);
  const relevantPlayerIds = new Set<string>();
  for (const key of Object.keys(availabilityByDay)) {
    const [date] = key.split("_");
    if (!daySet.has(date)) continue;
    for (const row of availabilityByDay[key]) relevantPlayerIds.add(row.player_id);
  }
  for (const m of matches) {
    for (const mp of m.match_players) relevantPlayerIds.add(mp.player_id);
  }
  const visiblePlayers = players.filter((p) => relevantPlayerIds.has(p.id));

  const overloaded = new Set<string>();
  for (const p of visiblePlayers) {
    const matchDates = matches
      .filter((m) => m.match_players.some((mp: any) => mp.player_id === p.id))
      .map((m) => m.match_date)
      .sort();
    if (p.days_per_week) {
      for (const d of matchDates) {
        const windowStart = new Date(d);
        windowStart.setDate(windowStart.getDate() - 6);
        const count = matchDates.filter((d2) => d2 >= windowStart.toISOString().slice(0, 10) && d2 <= d).length;
        if (count > p.days_per_week) overloaded.add(`${p.id}_${d}`);
      }
    }
    if (p.days_in_a_row) {
      let streak: string[] = [];
      for (let i = 0; i < matchDates.length; i++) {
        if (streak.length === 0) {
          streak = [matchDates[i]];
        } else {
          const prev = new Date(streak[streak.length - 1]);
          prev.setDate(prev.getDate() + 1);
          if (prev.toISOString().slice(0, 10) === matchDates[i]) streak.push(matchDates[i]);
          else {
            if (streak.length > p.days_in_a_row) streak.forEach((d) => overloaded.add(`${p.id}_${d}`));
            streak = [matchDates[i]];
          }
        }
      }
      if (streak.length > p.days_in_a_row) streak.forEach((d) => overloaded.add(`${p.id}_${d}`));
    }
  }

  // Active courts, plus -- if this particular match already has a
  // court assigned that's since been retired -- that court too, so
  // the <select> doesn't silently blank out an existing assignment.
  function courtOptionsFor(match: any) {
    if (match?.court && !courts.some((c) => c.id === match.court.id)) {
      return [...courts, match.court];
    }
    return courts;
  }

  const timeSlotDescriptions = timeSlots.map((t) => t.description);

  const selectedMatch = selected ? cellIndex[`${selected.playerId}_${selected.date}`] : null;
  const selectedPlayer = selected ? players.find((p) => p.id === selected.playerId) : null;

  async function handleAssignCourt(courtId: string) {
    if (!selectedMatch) return;
    await fetch("/api/admin/assign-court", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: selectedMatch.id, court_id: courtId || null }),
    });
    load();
  }

  async function handleSetTime(value: string) {
    if (!selectedMatch) return;
    const finalValue = value === "__default__" ? "" : value === "__custom__" ? customTime : value;
    await fetch("/api/admin/set-match-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: selectedMatch.id, time_display: finalValue }),
    });
    load();
  }

  async function handleInlineCourtChange(matchId: string, courtId: string) {
    await fetch("/api/admin/assign-court", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, court_id: courtId || null }),
    });
    load();
  }

  async function handleInlineTimeChange(matchId: string, timeValue: string) {
    const finalValue = timeValue === "__default__" ? "" : timeValue === "__custom__" ? tempTime : timeValue;
    await fetch("/api/admin/set-match-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, time_display: finalValue }),
    });
    load();
  }

  async function handleInlinePropose(matchId: string) {
    if (!confirm("Email all 4 players asking them to accept or decline?")) return;
    const res = await fetch("/api/admin/propose-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    load();
  }

  async function handleInlineCancel(matchId: string) {
    if (!confirm("Cancel this match?")) return;
    const res = await fetch("/api/admin/cancel-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    load();
  }

  async function handlePropose() {
    if (!selectedMatch) return;
    if (!confirm("Email all 4 players asking them to accept or decline?")) return;
    const res = await fetch("/api/admin/propose-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: selectedMatch.id }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    load();
  }

  async function handleCancel() {
    if (!selectedMatch) return;
    if (!confirm("Cancel this match?")) return;
    const res = await fetch("/api/admin/cancel-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: selectedMatch.id }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    setSelected(null);
    load();
  }

  function handleCellClick(playerId: string, date: string, hasMatch: any, isUnassigned: boolean) {
    if (!swapMode) {
      if (hasMatch) setSelected(selected?.playerId === playerId && selected?.date === date ? null : { playerId, date });
      return;
    }
    // Swap mode: only draft-match players or Unassigned cells are eligible.
    if (!hasMatch && !isUnassigned) return;
    if (hasMatch && hasMatch.status !== "draft") return;

    const player = players.find((p) => p.id === playerId);
    const label = hasMatch ? `M${hasMatch.match_number}` : "Unassigned";
    const slot = { playerId, matchId: hasMatch ? hasMatch.id : null, date, label: `${player?.first_name} (${label})` };

    setSwapSlots((prev) => {
      const already = prev.find((s) => s.playerId === playerId && s.date === date);
      if (already) return prev.filter((s) => s !== already); // click again to deselect
      if (prev.length === 0) return [slot];
      if (prev.length === 1) {
        if (prev[0].date !== date) {
          alert("Both players must be on the same day to swap.");
          return prev;
        }
        return [prev[0], slot];
      }
      return [slot]; // start fresh if 2 already picked
    });
  }

  async function confirmSwap() {
    if (swapSlots.length !== 2) return;
    setSwapBusy(true);
    const res = await fetch("/api/admin/swap-two-players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotA: { playerId: swapSlots[0].playerId, matchId: swapSlots[0].matchId },
        slotB: { playerId: swapSlots[1].playerId, matchId: swapSlots[1].matchId },
      }),
    });
    const json = await res.json();
    setSwapBusy(false);
    if (!json.ok) {
      alert(`Couldn't swap: ${json.error}`);
      return;
    }
    setSwapSlots([]);
    load();
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className="space-y-1.5">
      <h1 className="text-base font-bold">Match Matrix</h1>

      {loadError && (
        <p className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">{loadError}</p>
      )}
      {lastResult && (
        <p className="text-xs text-stone-500">{lastResult}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
        <span className="text-stone-500">Generate:</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="rounded border border-stone-300 px-1.5 py-0.5 text-xs" />
        <span className="text-stone-400">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="rounded border border-stone-300 px-1.5 py-0.5 text-xs" />
        <button onClick={handleGenerate} disabled={generating}
          className="rounded-md bg-court-green px-3 py-1 text-xs text-white disabled:opacity-50">
          {generating ? "Generating..." : "Generate Match Matrix"}
        </button>

        <span className="ml-2 text-stone-500">Showing:</span>
        <input type="date" value={viewStart} onChange={(e) => setViewStart(e.target.value)}
          className="rounded border border-stone-300 px-1.5 py-0.5 text-xs" />
        <span className="text-stone-400">to</span>
        <input type="date" value={viewEnd} onChange={(e) => setViewEnd(e.target.value)}
          className="rounded border border-stone-300 px-1.5 py-0.5 text-xs" />

        <button
          onClick={() => { setSwapMode(!swapMode); setSwapSlots([]); setSelected(null); }}
          className={`rounded-md px-3 py-1 text-xs font-medium ${swapMode ? "bg-purple-600 text-white" : "border border-purple-400 text-purple-700"}`}
        >
          {swapMode ? "Swap mode ON" : "Swap two players"}
        </button>

        {swapMode && swapSlots.length > 0 && (
          <div className="flex items-center gap-1.5 rounded bg-purple-50 px-2 py-1 text-xs">
            {swapSlots.map((s, i) => (
              <span key={i} className="rounded bg-white px-1.5 py-0.5">{s.label}</span>
            ))}
            {swapSlots.length === 2 && (
              <button onClick={confirmSwap} disabled={swapBusy}
                className="rounded bg-purple-600 px-2 py-0.5 text-white disabled:opacity-50">
                {swapBusy ? "..." : "Confirm"}
              </button>
            )}
            <button onClick={() => setSwapSlots([])} className="text-purple-500 underline">clear</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs">
          <thead className="bg-stone-100">
            <tr>
              <th className="sticky left-0 z-10 bg-stone-100 px-2 py-0.5 text-left">First</th>
              <th className="sticky left-[64px] z-10 bg-stone-100 px-2 py-0.5 text-left">Last</th>
              <th className="sticky left-[128px] z-10 bg-stone-100 px-1 py-0.5 text-left">Rank</th>
              {days.map((d) => (
                <th key={d} className="whitespace-nowrap px-1.5 py-0.5 text-center font-normal">
                  {formatShortDateWithWeekday(d)}
                </th>
              ))}
              <th className="whitespace-nowrap px-1.5 py-0.5">Days/wk</th>
              <th className="whitespace-nowrap px-1.5 py-0.5">Days in row</th>
              <th className="whitespace-nowrap px-1.5 py-0.5">Zip</th>
              <th className="whitespace-nowrap px-1.5 py-0.5">Phone</th>
              <th className="whitespace-nowrap px-1.5 py-0.5">Email</th>
              <th className="whitespace-nowrap px-1.5 py-0.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((p) => (
              <tr key={p.id} className="border-t leading-tight">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-0 font-medium">{p.first_name}</td>
                <td className="sticky left-[64px] z-10 whitespace-nowrap bg-white px-2 py-0 font-medium">{p.last_name}</td>
                <td className="sticky left-[128px] z-10 whitespace-nowrap bg-white px-1 py-0 text-stone-500">{p.ranking ?? "—"}</td>
                {days.map((d) => {
                  const m = cellIndex[`${p.id}_${d}`];
                  const isAvailUnassigned = !m && availIndex.has(`${p.id}_${d}`);
                  const isOverloaded = overloaded.has(`${p.id}_${d}`);
                  const isSelected = selected?.playerId === p.id && selected?.date === d;
                  const color = m
                    ? MATCH_PALETTE[m.match_number % MATCH_PALETTE.length]
                    : isAvailUnassigned
                    ? UNASSIGNED_COLOR
                    : "";
                  // Get player's response status for this match
                  const playerMatch = m ? m.match_players?.find((mp: any) => mp.player_id === p.id) : null;
                  const responseStatus = playerMatch?.response_status;
                  // For draft matches, always show DRAFT status
                  const displayStatus = m?.status === "draft" ? "DRAFT" : (responseStatus ? responseStatus.toUpperCase() : m?.status?.toUpperCase() || "");
                  return (
                    <td key={d} className="p-0 text-center">
                      <button
                        disabled={!m && !isAvailUnassigned}
                        onClick={() => handleCellClick(p.id, d, m, isAvailUnassigned)}
                        className={`block w-full whitespace-nowrap rounded px-1 py-0 leading-tight ${color} ${isOverloaded ? "ring-2 ring-orange-400" : ""} ${isSelected ? "outline outline-2 outline-purple-500" : ""} ${swapSlots.some((s) => s.playerId === p.id && s.date === d) ? "outline outline-2 outline-purple-600" : ""}`}
                      >
                        {m ? `${p.first_name} M${m.match_number} ${displayStatus}` : isAvailUnassigned ? `${p.first_name} Unas.` : ""}
                      </button>
                    </td>
                  );
                })}
                <td className="px-1.5 py-0 text-center">{p.days_per_week ?? "—"}</td>
                <td className="px-1.5 py-0 text-center">{p.days_in_a_row ?? "—"}</td>
                <td className="px-1.5 py-0 text-center">{p.zip ?? "—"}</td>
                <td className="whitespace-nowrap px-1.5 py-0">{formatPhone(p.phone) ?? "—"}</td>
                <td className="whitespace-nowrap px-1.5 py-0">{p.email}</td>
                <td className="whitespace-nowrap px-1.5 py-0 italic text-stone-500">{p.notes ?? ""}</td>
              </tr>
            ))}
            {/* Match details row */}
            <tr className="border-t bg-stone-50">
              <td colSpan={3} className="px-2 py-1 font-medium text-stone-600">Match Details</td>
              {days.map((d) => {
                // Get unique matches for this day
                const dayMatches = matches.filter((m) => m.match_date === d);
                const uniqueMatches = Array.from(new Map(dayMatches.map((m) => [m.id, m])).values());
                return (
                  <td key={d} className="p-1 align-top">
                    <div className="space-y-1">
                      {uniqueMatches.map((m) => {
                        const color = MATCH_PALETTE[m.match_number % MATCH_PALETTE.length];
                        return (
                          <div key={m.id} className={`rounded p-1 ${color}`}>
                            <div className="text-xs font-semibold">M{m.match_number}</div>
                            {m.status === "draft" ? (
                              <select
                                className="w-full rounded border border-stone-300 px-1 py-0.5 text-xs"
                                defaultValue={m.court?.id ?? ""}
                                onChange={(e) => handleInlineCourtChange(m.id, e.target.value)}
                              >
                                <option value="">Court TBD</option>
                                {courtOptionsFor(m).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            ) : (
                              <div className="text-xs">{m.court?.name ?? "Court TBD"}</div>
                            )}
                            {m.status === "draft" ? (
                              <select
                                className="w-full rounded border border-stone-300 px-1 py-0.5 text-xs mt-1"
                                defaultValue={
                                  !m.time_display
                                    ? "__default__"
                                    : timeSlotDescriptions.includes(m.time_display)
                                    ? m.time_display
                                    : "__custom__"
                                }
                                onChange={(e) => {
                                  if (e.target.value !== "__custom__") handleInlineTimeChange(m.id, e.target.value);
                                }}
                              >
                                <option value="__default__">Default ({defaultTimeDisplay})</option>
                                {timeSlotDescriptions.map((t) => <option key={t} value={t}>{t}</option>)}
                                <option value="__custom__">Custom...</option>
                              </select>
                            ) : (
                              <div className="text-xs">{m.time_display || defaultTimeDisplay}</div>
                            )}
                            {m.status === "draft" ? (
                              <button
                                onClick={() => handleInlinePropose(m.id)}
                                className="mt-1 w-full rounded bg-court-green px-2 py-0.5 text-xs text-white"
                              >
                                PROPOSE
                              </button>
                            ) : (
                              <button
                                onClick={() => handleInlineCancel(m.id)}
                                className="mt-1 w-full rounded border border-red-300 px-2 py-0.5 text-xs text-red-700"
                              >
                                CANCEL
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
              <td colSpan={5} className="px-2 py-1 text-stone-400 text-xs">
                Edit court/time for draft matches, or cancel proposed/confirmed matches
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {selectedMatch && selectedPlayer && (
        <div className="w-72 space-y-1 rounded-md border bg-stone-50 p-3 text-sm">
          <p className="font-bold">M{selectedMatch.match_number}</p>

          {selectedMatch.status === "draft" ? (
            <select
              className="w-full rounded border border-stone-300 px-1 py-0.5 text-sm"
              defaultValue={selectedMatch.court?.id ?? ""}
              onChange={(e) => handleAssignCourt(e.target.value)}
            >
              <option value="">Court TBD</option>
              {courtOptionsFor(selectedMatch).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <p>{selectedMatch.court?.name ?? "Court TBD"}</p>
          )}

          {selectedMatch.status === "draft" ? (
            <div key={selectedMatch.id}>
              <select
                className="w-full rounded border border-stone-300 px-1 py-0.5 text-sm"
                defaultValue={
                  !selectedMatch.time_display
                    ? "__default__"
                    : timeSlotDescriptions.includes(selectedMatch.time_display)
                    ? selectedMatch.time_display
                    : "__custom__"
                }
                onChange={(e) => {
                  setTimeChoice(e.target.value);
                  if (e.target.value !== "__custom__") handleSetTime(e.target.value);
                }}
              >
                <option value="__default__">Default ({defaultTimeDisplay})</option>
                {timeSlotDescriptions.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__custom__">Custom...</option>
              </select>
              {(timeChoice === "__custom__" || (!timeSlotDescriptions.includes(selectedMatch.time_display) && selectedMatch.time_display)) && (
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-1 py-0.5 text-sm"
                  defaultValue={selectedMatch.time_display || ""}
                  placeholder="e.g. 6:30am warmup, 6:45am start play"
                  onChange={(e) => setCustomTime(e.target.value)}
                  onBlur={(e) => handleSetTime(e.target.value)}
                />
              )}
            </div>
          ) : (
            <p>{selectedMatch.time_display || defaultTimeDisplay}</p>
          )}

          {selectedMatch.match_players.map((mp: any) => (
            <p key={mp.id}>
              {mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : 'Unknown Player'} :{" "}
              {selectedMatch.status === "draft" ? "DRAFT" : mp.response_status.toUpperCase()}
            </p>
          ))}

          <p className="font-semibold">STATUS: {selectedMatch.status.toUpperCase()}</p>

          {selectedMatch.status === "draft" ? (
            <button onClick={handlePropose} className="w-full rounded bg-court-green px-2 py-1 text-white">
              Propose
            </button>
          ) : (
            <button onClick={handleCancel} className="w-full rounded border border-red-300 px-2 py-1 text-red-700">
              Cancel match
            </button>
          )}
        </div>
      )}
    </div>
  );
}
