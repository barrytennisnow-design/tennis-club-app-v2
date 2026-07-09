"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function isoDaysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

export default function AdminMatchesPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [availabilityByDay, setAvailabilityByDay] = useState<Record<string, any[]>>({});
  const [lockedSet, setLockedSet] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDaysFromNow(0));
  const [endDate, setEndDate] = useState(isoDaysFromNow(7));
  const [swapTarget, setSwapTarget] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(id, name), match_players(id, response_status, decline_reason, player_id, players(id, first_name, last_name))")
      .order("match_date", { ascending: true });
    setMatches(data ?? []);

    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);

    // Everyone's availability, grouped by date_timeslot, so we can
    // filter swap candidates down to people who are actually
    // available that specific day -- not just "any active player."
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

    // Players already locked into a PROPOSED or CONFIRMED match that
    // day/time -- they shouldn't be offered as swap candidates even
    // if they marked themselves available.
    const { data: lockedRows } = await supabase.from("locked_availability").select("player_id, date, time_slot");
    setLockedSet(new Set((lockedRows ?? []).map((r: any) => `${r.player_id}_${r.date}_${r.time_slot}`)));
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
      const totalMatches = json.results.reduce((s: number, r: any) => s + r.matchesCreated, 0);
      setLastResult(`Built ${totalMatches} draft match(es) across ${json.results.length} day(s). Nothing has been emailed yet -- review below, then click Propose on each one you want to send out.`);
      load();
    } else {
      setLastResult(`Error: ${json.error}`);
    }
  }

  async function handleAssignCourt(matchId: string, courtId: string) {
    await fetch("/api/admin/assign-court", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, court_id: courtId || null }),
    });
    load();
  }

  async function handleSwap(matchId: string, oldPlayerId: string) {
    const key = `${matchId}_${oldPlayerId}`;
    const newPlayerId = swapTarget[key];
    if (!newPlayerId) return;
    await fetch("/api/admin/swap-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, old_player_id: oldPlayerId, new_player_id: newPlayerId }),
    });
    load();
  }

  async function handlePropose(matchId: string) {
    if (!confirm("This will email all 4 players asking them to accept or decline. Continue?")) return;
    setBusyMatchId(matchId);
    const res = await fetch("/api/admin/propose-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    setBusyMatchId(null);
    if (!json.ok) alert(`Error: ${json.error}`);
    load();
  }

  async function handleCancel(matchId: string) {
    if (!confirm("Cancel this match? Players who were already notified will get a cancellation email.")) return;
    setBusyMatchId(matchId);
    const res = await fetch("/api/admin/cancel-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    setBusyMatchId(null);
    if (!json.ok) alert(`Error: ${json.error}`);
    load();
  }

  const statusStyles: Record<string, string> = {
    draft: "bg-stone-200 text-stone-700",
    proposed: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Match Matrix</h1>

      <div className="rounded-md border p-4 space-y-3">
        <p className="font-medium">Generate draft matches from current availability</p>
        <p className="text-xs text-stone-500">
          This only builds drafts -- nothing is emailed to players until you click "Propose" on a specific match below.
          Re-running this replaces all existing drafts; it never touches matches that are already proposed, confirmed, or cancelled.
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

      <div className="space-y-3">
        {matches.map((m) => {
          const dayKey = `${m.match_date}_${m.time_slot}`;
          const playerIdsInMatch = new Set(m.match_players.map((mp: any) => mp.player_id));

          // Eligible swap-ins: marked available that exact day/time,
          // AND not already locked into another proposed/confirmed
          // match that day, AND not already in this match.
          const swapOptions = (availabilityByDay[dayKey] ?? [])
            .filter((row: any) => !playerIdsInMatch.has(row.player_id))
            .filter((row: any) => !lockedSet.has(`${row.player_id}_${m.match_date}_${m.time_slot}`))
            .map((row: any) => row.players);

          const isDraft = m.status === "draft";
          const isCancellable = m.status === "draft" || m.status === "proposed" || m.status === "confirmed";

          return (
            <div key={m.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {m.match_date} · {m.time_slot}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[m.status]}`}>
                  {m.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-stone-500">Court:</span>
                {isDraft ? (
                  <select
                    className="rounded border border-stone-300 px-2 py-1"
                    value={m.court?.id ?? ""}
                    onChange={(e) => handleAssignCourt(m.id, e.target.value)}
                  >
                    <option value="">Court TBD</option>
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <span>{m.court?.name ?? "Court TBD"}</span>
                )}

                {isDraft && (
                  <button
                    disabled={busyMatchId === m.id || !m.court?.id}
                    onClick={() => handlePropose(m.id)}
                    className="rounded-md bg-court-green px-3 py-1 text-xs text-white disabled:opacity-50"
                    title={!m.court?.id ? "Assign a court first" : undefined}
                  >
                    Propose (emails players)
                  </button>
                )}
                {isDraft && !m.court?.id && (
                  <span className="text-xs text-stone-400">assign a court before proposing</span>
                )}
                {isCancellable && (
                  <button
                    disabled={busyMatchId === m.id}
                    onClick={() => handleCancel(m.id)}
                    className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
                  >
                    Cancel match
                  </button>
                )}
              </div>

              <ul className="mt-3 space-y-2 text-sm text-stone-700">
                {m.match_players.map((mp: any) => {
                  const key = `${m.id}_${mp.player_id}`;
                  return (
                    <li key={mp.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-[10rem]">
                        {mp.players.first_name} {mp.players.last_name}
                        {!isDraft && <> — <em>{mp.response_status}</em></>}
                        {mp.decline_reason && <span className="text-red-600"> ("{mp.decline_reason}")</span>}
                      </span>
                      {isDraft && (
                        <>
                          <select
                            className="rounded border border-stone-300 px-2 py-0.5 text-xs"
                            value={swapTarget[key] ?? ""}
                            onChange={(e) => setSwapTarget({ ...swapTarget, [key]: e.target.value })}
                          >
                            <option value="">Swap with...</option>
                            {swapOptions.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                            ))}
                          </select>
                          <button
                            disabled={!swapTarget[key]}
                            onClick={() => handleSwap(m.id, mp.player_id)}
                            className="rounded bg-stone-200 px-2 py-0.5 text-xs disabled:opacity-40"
                          >
                            Swap in
                          </button>
                          {swapOptions.length === 0 && (
                            <span className="text-xs text-stone-400">no eligible players available that day</span>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {matches.length === 0 && <p className="text-stone-500">No matches yet.</p>}
      </div>
    </div>
  );
}
