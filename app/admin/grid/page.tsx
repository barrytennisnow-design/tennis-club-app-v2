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
function shortName(p: { first_name: string; last_name: string }) {
  return `${p.first_name} ${p.last_name[0]}.`;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-stone-200 text-stone-700",
  proposed: "bg-yellow-200 text-yellow-900",
  confirmed: "bg-green-200 text-green-900",
};

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
      .select("id, first_name, last_name, days_per_week, days_in_a_row")
      .eq("status", "active")
      .order("last_name");
    setPlayers(playerRows ?? []);

    const { data: matchRows } = await supabase
      .from("matches")
      .select("id, match_date, time_slot, status, court:courts(id, name), match_players(id, player_id, response_status, players(id, first_name, last_name))")
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

  // player_id_date -> the match they're in that day (if any)
  const cellIndex: Record<string, any> = {};
  for (const m of matches) {
    for (const mp of m.match_players) {
      cellIndex[`${mp.player_id}_${m.match_date}`] = m;
    }
  }

  // Overload detection: rolling 7-day count vs days_per_week, and
  // consecutive-day streaks vs days_in_a_row.
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
          if (prev.toISOString().slice(0, 10) === matchDates[i]) {
            streak.push(matchDates[i]);
          } else {
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
        <p className="text-xs text-stone-500">
          Builds silent drafts (no emails). Clears out old drafts and cancelled matches each run;
          never touches anything already proposed or confirmed.
        </p>
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

      <p className="text-sm text-stone-600">
        Click a cell to manage that match.
        <span className="ml-2 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs">draft</span>
        <span className="ml-1 inline-block rounded bg-yellow-200 px-2 py-0.5 text-xs">proposed</span>
        <span className="ml-1 inline-block rounded bg-green-200 px-2 py-0.5 text-xs">confirmed</span>
        <span className="ml-2 inline-block rounded bg-orange-100 px-2 py-0.5 text-xs ring-1 ring-orange-400">over days/week or days-in-a-row limit</span>
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs">
          <thead className="bg-stone-100">
            <tr>
              <th className="sticky left-0 z-10 bg-stone-100 p-2 text-left">Player</th>
              {days.map((d) => (
                <th key={d} className="whitespace-nowrap p-2 text-center font-normal">
                  {new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 font-medium">
                  {p.first_name} {p.last_name}
                </td>
                {days.map((d) => {
                  const m = cellIndex[`${p.id}_${d}`];
                  const isOverloaded = overloaded.has(`${p.id}_${d}`);
                  const isSelected = selected?.playerId === p.id && selected?.date === d;
                  const others = m ? m.match_players.filter((mp: any) => mp.player_id !== p.id).map((mp: any) => shortName(mp.players)) : [];
                  return (
                    <td key={d} className="p-1 text-center">
                      <button
                        onClick={() => m && setSelected(isSelected ? null : { playerId: p.id, date: d })}
                        className={`block w-full rounded px-1 py-1 text-left ${m ? STATUS_COLORS[m.status] : "text-stone-300"} ${isOverloaded ? "ring-2 ring-orange-400" : ""} ${isSelected ? "outline outline-2 outline-purple-500" : ""}`}
                      >
                        {m ? others.join(", ") : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMatch && selectedPlayer && (
        <div className="rounded-md border bg-stone-50 p-4 space-y-3">
          <p className="font-semibold">
            Match M{selectedMatch.id.slice(0, 4)} · {selectedMatch.match_date} · {selectedMatch.time_slot} ·{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[selectedMatch.status]}`}>
              {selectedMatch.status.toUpperCase()}
            </span>
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
