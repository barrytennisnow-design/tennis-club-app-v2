"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MyMatchesPage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [rosterByMatch, setRosterByMatch] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }
    const { data: p } = await supabase
      .from("players")
      .select("*")
      .eq("auth_user_id", userData.user.id)
      .single();
    setPlayer(p);

    if (p) {
      const { data: mp } = await supabase
        .from("match_players")
        .select("id, response_status, decline_reason, match_id, matches!inner(id, match_date, time_slot, status, proposed_at, confirmed_at, cancelled_at, auto_cancel_hours, nudge_count, court:courts(name))")
        .eq("player_id", p.id);
      const nonDraftMatches = (mp ?? []).filter((row: any) => row.matches?.status !== "draft");
      setMyMatches(nonDraftMatches);

      // Full roster (all 4 players + their responses) for each match,
      // shown like the old sheet's "Proposed Matches" tab -- everyone
      // on one row, e.g. "Mike Tune : ACCEPTED".
      const matchIds = nonDraftMatches.map((row: any) => row.match_id);
      if (matchIds.length > 0) {
        const { data: allRoster } = await supabase
          .from("match_players")
          .select("match_id, response_status, players(first_name, last_name)")
          .in("match_id", matchIds);
        const grouped: Record<string, any[]> = {};
        for (const row of allRoster ?? []) {
          if (!grouped[row.match_id]) grouped[row.match_id] = [];
          grouped[row.match_id].push(row);
        }
        setRosterByMatch(grouped);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(matchPlayerId: string, response: "accepted" | "declined") {
    let declineReason: string | null = null;
    if (response === "declined") {
      declineReason = window.prompt("Optional: let the group know why you're declining") || null;
    }
    setBusyId(matchPlayerId);
    await fetch("/api/respond-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_player_id: matchPlayerId, response, decline_reason: declineReason }),
    });
    setBusyId(null);
    load();
  }

  if (loading) return <p>Loading...</p>;
  if (!player) return <p>Please <a href="/login" className="underline">log in</a>.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Matches</h1>
      {myMatches.length === 0 && <p className="text-stone-500">No match invites yet.</p>}
      {myMatches.map((mp) => {
        const roster = rosterByMatch[mp.match_id] ?? [];
        const deadline = mp.matches.proposed_at && mp.matches.auto_cancel_hours
          ? new Date(new Date(mp.matches.proposed_at).getTime() + mp.matches.auto_cancel_hours * 3600000)
          : null;
        return (
          <div key={mp.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                Match M{mp.matches.id.slice(0, 4)} · {mp.matches.match_date} · {mp.matches.time_slot} · {mp.matches.court?.name ?? "Court TBD"}
              </p>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">
                Match: {mp.matches.status}
              </span>
            </div>

            <div className="mt-1 text-xs text-stone-500">
              {mp.matches.proposed_at && <span>Proposed: {new Date(mp.matches.proposed_at).toLocaleString()}</span>}
              {deadline && mp.matches.status === "proposed" && (
                <span className="ml-3">Respond by: {deadline.toLocaleString()}</span>
              )}
              {mp.matches.confirmed_at && <span className="ml-3">Confirmed: {new Date(mp.matches.confirmed_at).toLocaleString()}</span>}
              {mp.matches.cancelled_at && <span className="ml-3">Cancelled: {new Date(mp.matches.cancelled_at).toLocaleString()}</span>}
              {mp.matches.nudge_count > 0 && <span className="ml-3">Nudges sent: {mp.matches.nudge_count}</span>}
            </div>

            {/* All 4 players + status, formatted like the old sheet's
                "Proposed Matches" tab: "Name : STATUS" per player */}
            <ul className="mt-2 space-y-0.5 text-sm text-stone-700">
              {roster.map((r: any, i: number) => (
                <li key={i}>
                  {r.players.first_name} {r.players.last_name} : <strong>{r.response_status.toUpperCase()}</strong>
                </li>
              ))}
            </ul>

            {mp.decline_reason && <p className="mt-1 text-sm italic text-stone-500">Your reason: "{mp.decline_reason}"</p>}

            {mp.matches.status === "proposed" && mp.response_status === "proposed" && (
              <div className="mt-2 flex gap-2">
                <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "accepted")}
                  className="rounded-md bg-court-green px-3 py-1 text-sm text-white disabled:opacity-50">Accept</button>
                <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "declined")}
                  className="rounded-md border border-stone-300 px-3 py-1 text-sm disabled:opacity-50">Decline</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}