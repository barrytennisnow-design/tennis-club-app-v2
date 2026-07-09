"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MyMatchesPage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
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
      // Drafts are manager-only working state -- players never see
      // them until the manager clicks "Propose." Filtered in JS
      // rather than in the query itself, to avoid relying on
      // embedded-resource filter syntax.
      const { data: mp } = await supabase
        .from("match_players")
        .select("id, response_status, decline_reason, matches!inner(id, match_date, time_slot, status, court:courts(name)), match_id")
        .eq("player_id", p.id);
      const nonDraftMatches = (mp ?? []).filter((row: any) => row.matches?.status !== "draft");
      setMyMatches(nonDraftMatches);
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
      {myMatches.map((mp) => (
        <div key={mp.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {mp.matches.match_date} · {mp.matches.time_slot} · {mp.matches.court?.name ?? "Court TBD"}
            </p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">
              Match: {mp.matches.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600">Your response: {mp.response_status}</p>
          {mp.decline_reason && <p className="text-sm italic text-stone-500">Your reason: "{mp.decline_reason}"</p>}
          {mp.matches.status === "proposed" && mp.response_status === "proposed" && (
            <div className="mt-2 flex gap-2">
              <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "accepted")}
                className="rounded-md bg-court-green px-3 py-1 text-sm text-white disabled:opacity-50">Accept</button>
              <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "declined")}
                className="rounded-md border border-stone-300 px-3 py-1 text-sm disabled:opacity-50">Decline</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
