"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function isoDaysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextNDays(n: number) {
  const days = [];
  for (let i = 0; i < n; i++) days.push(isoDaysFromNow(i));
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
  const [availabilityByDay, setAvailabilityByDay] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDaysFromNow(0));
  const [endDate, setEndDate] = useState(isoDaysFromNow(7));
  const [selected, setSelected] = useState<{ playerId: string; date: string } | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const days = nextNDays(30);

  async function load() {
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name, ranking, days_per_week, days_in_a_row, zip, phone, email, notes, status")
      .eq("status", "active")
      .order("first_name");
    setPlayers(playerRows ?? []);

    const { data: matchRows } = await supabase
      .from("matches")
      .select("id, match_number, match_date, time_slot, status, court:courts(id, name), match_players(id, player_id, response_status, players(id, first_name, last_name))")
      .gte("match_date", days[0])
      .lte("match_date", days[days.length - 1])
      .neq("status", "cancelled");
    setMatches(matchRows ?? []);

    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);

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
  }, []);

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
      load();
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

  const overloaded = new Set<string>();
  for (const p of players) {
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

  async function handleSwap() {
    if (!selectedMatch || !selected || !swapTarget) return;
    const res = await fetch("/api/admin/swap-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: selectedMatch.id, old_player_id: selected.playerId, new_player_id: swapTarget }),
    });
    const json = await res.json();
    if (!json.ok) {
      alert(`Couldn't swap: ${json.error}`);
      return;
    }
    setSwapTarget("");
    setSelected(null);
    load();
  }

  if (loading) return <p>Loading...</p>;

  const dayKey = selectedMatch ? `${selectedMatch.match_date}_${selectedMatch.time_slot}` : "";
  const playerIdsInSelectedMatch = new Set((selectedMatch?.match_players ?? []).map((mp: any) => mp.player_id));
  const busySet = new Set<string>();
  for (const m of matches) {
    for (const mp of m.match_players) busySet.add(`${mp.player_id}_${m.match_date}_${m.time_slot}`);
  }
  const swapOptions = (availabilityByDay[dayKey] ?? [])
    .filter((row: any) => !playerIdsInSelectedMatch.has(row.player_id))
    .filter((row: any) => !busySet.has(`${row.player_id}_${selectedMatch?.match_date}_${selectedMatch?.time_slot}`))
    .map((row: any) => row.players);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Match Matrix</h1>

      <div className="rounded-md border p-4 space-y-3">
        <p className="font-medium">Generate draft matches from current availability</p>
        <div className="flex items-center gap-3 text-sm">
          <label>From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="ml-1 rounded border border-stone-300 px-2 py-1" /></label>
          <label>To <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="ml-1 rounded border border-stone-300 px-2 py-1" /></label>
          <button onClick={handleGenerate} disabled={generating}
            className="rounded-md bg-court-green px-4 py-2 text-white disabled:opacity-50">
            {generating ? "Generating..." : "Generate Match Matrix"}
          </button>
        </div>
        {lastResult && <p className="text-sm text-stone-600">{lastResult}</p>}
      </div>

      <p className="text-xs text-stone-500">
        Click any colored cell to manage that match. Grey "Unassigned" means available that day but not yet matched.
        Orange-ringed cells mean that player is over their own days/week or days-in-a-row limit.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs">
          <thead className="bg-stone-100">
            <tr>
              <th className="sticky left-0 z-10 bg-stone-100 p-2 text-left">First</th>
              <th className="sticky left-[70px] z-10 bg-stone-100 p-2 text-left">Last</th>
              {days.map((d) => (
                <th key={d} className="whitespace-nowrap p-2 text-center font-normal">
                  {new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}
                </th>
              ))}
              <th className="whitespace-nowrap p-2">Rating</th>
              <th className="whitespace-nowrap p-2">Days/wk</th>
              <th className="whitespace-nowrap p-2">Days in row</th>
              <th className="whitespace-nowrap p-2">Zip</th>
              <th className="whitespace-nowrap p-2">Phone</th>
              <th className="whitespace-nowrap p-2">Email</th>
              <th className="whitespace-nowrap p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 font-medium">{p.first_name}</td>
                <td className="sticky left-[70px] z-10 whitespace-nowrap bg-white p-2 font-medium">{p.last_name}</td>
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
                  return (
                    <td key={d} className="p-1 text-center">
                      <button
                        disabled={!m}
                        onClick={() => m && setSelected(isSelected ? null : { playerId: p.id, date: d })}
                        className={`block w-full whitespace-nowrap rounded px-1.5 py-1 text-left ${color} ${isOverloaded ? "ring-2 ring-orange-400" : ""} ${isSelected ? "outline outline-2 outline-purple-500" : ""}`}
                      >
                        {m ? `${p.first_name} M${m.match_number}` : isAvailUnassigned ? `${p.first_name} Unassigned` : ""}
                      </button>
                    </td>
                  );
                })}
                <td className="p-2 text-center">{p.ranking ?? "—"}</td>
                <td className="p-2 text-center">{p.days_per_week ?? "—"}</td>
                <td className="p-2 text-center">{p.days_in_a_row ?? "—"}</td>
                <td className="p-2 text-center">{p.zip ?? "—"}</td>
                <td className="whitespace-nowrap p-2">{p.phone ?? "—"}</td>
                <td className="whitespace-nowrap p-2">{p.email}</td>
                <td className="whitespace-nowrap p-2 italic text-stone-500">{p.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMatch && selectedPlayer && (
        <div className="rounded-md border bg-stone-50 p-4 space-y-3">
          <p className="font-semibold">
            Match M{selectedMatch.match_number} · {selectedMatch.match_date} · {selectedMatch.time_slot} ·{" "}
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">{selectedMatch.status.toUpperCase()}</span>
          </p>
          <ul className="text-sm">
            {selectedMatch.match_players.map((mp: any) => (
              <li key={mp.id}>
                {mp.players.first_name} {mp.players.last_name}
                {selectedMatch.status !== "draft" && <span className="text-stone-400"> : {mp.response_status}</span>}
              </li>
            ))}
          </ul>

          {selectedMatch.status === "draft" && (
            <>
              <label className="block text-sm">
                Court:
                <select
                  className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
                  defaultValue={selectedMatch.court?.id ?? ""}
                  onChange={(e) => handleAssignCourt(e.target.value)}
                >
                  <option value="">TBD</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <div className="flex items-center gap-2 text-sm">
                <span>Swap out {selectedPlayer.first_name} for:</span>
                <select
                  className="rounded border border-stone-300 px-2 py-1 text-sm"
                  value={swapTarget}
                  onChange={(e) => setSwapTarget(e.target.value)}
                >
                  <option value="">Choose player...</option>
                  {swapOptions.map((sp: any) => <option key={sp.id} value={sp.id}>{sp.first_name} {sp.last_name}</option>)}
                </select>
                <button disabled={!swapTarget} onClick={handleSwap}
                  className="rounded bg-stone-200 px-2 py-1 text-xs disabled:opacity-40">Swap</button>
              </div>

              <button onClick={handlePropose} className="rounded-md bg-court-green px-4 py-2 text-sm text-white">
                Propose (emails players)
              </button>
            </>
          )}

          <button onClick={handleCancel} className="ml-2 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700">
            Cancel match
          </button>
        </div>
      )}
    </div>
  );
}
