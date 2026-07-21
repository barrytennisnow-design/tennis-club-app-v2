"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDate } from "@/lib/formatDate";
import { formatPhone } from "@/lib/formatPhone";
import { proposerDisplayName } from "@/lib/formatName";

function formatLongDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday}, ${formatShortDate(dateStr)}`;
}

export default function MyMatchesPage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [rosterByMatch, setRosterByMatch] = useState<Record<string, any[]>>({});
  const [timeDisplay, setTimeDisplay] = useState("morning");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    // The default time is whatever the manager has flagged as
    // default on the Match Times list in Manager Settings.
    const { data: defaultSlot } = await supabase
      .from("time_slots")
      .select("description")
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();
    if (defaultSlot) setTimeDisplay(defaultSlot.description);

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
        .select(
          "id, response_status, decline_reason, match_id, matches!inner(id, match_number, match_date, time_slot, time_display, status, proposed_at, confirmed_at, cancelled_at, auto_cancel_hours, nudge_count, court:courts(name), proposer:players!proposed_by(first_name, last_name))"
        )
        .eq("player_id", p.id);
      const visibleMatches = (mp ?? []).filter((row: any) => row.matches?.status !== "draft" && row.matches?.status !== "cancelled");
      // Newest match date first, oldest at the bottom.
      visibleMatches.sort((a: any, b: any) => b.matches.match_date.localeCompare(a.matches.match_date));
      setMyMatches(visibleMatches);

      const matchIds = visibleMatches.map((row: any) => row.match_id);
      if (matchIds.length > 0) {
        const response = await fetch(`/api/match-roster?match_ids=${matchIds.join(",")}`);
        if (response.ok) {
          const { roster } = await response.json();
          const grouped: Record<string, any[]> = {};
          for (const row of roster ?? []) {
            if (!grouped[row.match_id]) grouped[row.match_id] = [];
            grouped[row.match_id].push(row);
          }
          setRosterByMatch(grouped);
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (loading || myMatches.length === 0) return;
    if (typeof window === "undefined" || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, myMatches]);

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
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Your Matches</h1>
      {myMatches.length === 0 && <p className="text-stone-500">No match invites yet.</p>}

      {myMatches.map((mp) => {
        const roster = rosterByMatch[mp.match_id] ?? [];
        const deadline = mp.matches.proposed_at && mp.matches.auto_cancel_hours
          ? new Date(new Date(mp.matches.proposed_at).getTime() + mp.matches.auto_cancel_hours * 3600000)
          : null;

        return (
          <div key={mp.id} id={`match-${mp.matches.id}`} className="scroll-mt-4 rounded-md border p-4">
            <p className="font-semibold">
              Match ID: M{mp.matches.match_number}{" "}
              <span className={
                mp.matches.status === "confirmed" ? "text-green-700" :
                mp.matches.status === "cancelled" ? "text-red-700" :
                "text-yellow-700"
              }>
                {mp.matches.status.toUpperCase()}
              </span>
            </p>
            <p>Date: {formatLongDate(mp.matches.match_date)}</p>
            <p>Time: {mp.matches.time_display || timeDisplay}</p>
            <p>Court: {mp.matches.court?.name ?? "TBD"}</p>
            <p>Proposed by: {proposerDisplayName(mp.matches.proposer) ?? "Manager"}</p>

            <p className="mt-3 font-medium">Players:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              {roster.map((r: any, i: number) => (
                <li key={i}>
                  {r.players ? `${r.players.first_name} ${r.players.last_name}` : 'Unknown Player'}{" "}
                  Status: <strong>{r.response_status.toUpperCase()}</strong>
                  {r.players?.phone && <> | Phone: {formatPhone(r.players.phone)}</>}
                </li>
              ))}
            </ul>

            {mp.decline_reason && (
              <p className="mt-2 text-sm italic text-stone-500">Your reason: "{mp.decline_reason}"</p>
            )}

            <div className="mt-2 text-xs text-stone-400">
              {mp.matches.proposed_at && <span>Proposed: {new Date(mp.matches.proposed_at).toLocaleString()}</span>}
              {deadline && mp.matches.status === "proposed" && (
                <span className="ml-3">Respond by: {deadline.toLocaleString()}</span>
              )}
              {mp.matches.confirmed_at && <span className="ml-3">Confirmed: {new Date(mp.matches.confirmed_at).toLocaleString()}</span>}
              {mp.matches.cancelled_at && <span className="ml-3">Cancelled: {new Date(mp.matches.cancelled_at).toLocaleString()}</span>}
              {mp.matches.nudge_count > 0 && <span className="ml-3">Nudges sent: {mp.matches.nudge_count}</span>}
            </div>

            {mp.matches.status === "proposed" && mp.response_status === "proposed" && (
              <div className="mt-3 flex gap-2">
                <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "accepted")}
                  className="rounded-md bg-court-green px-3 py-1 text-sm text-white disabled:opacity-50">Accept</button>
                <button disabled={busyId === mp.id} onClick={() => respond(mp.id, "declined")}
                  className="rounded-md border border-stone-300 px-3 py-1 text-sm disabled:opacity-50">Decline</button>
              </div>
            )}

            {mp.matches.status === "confirmed" && (
              <div className="mt-3 space-y-3">
                <a
                  href={`/api/ics/${mp.id}`}
                  className="inline-block rounded-md bg-court-green px-3 py-1 text-sm text-white"
                >
                  Download Calendar Invite (.ics)
                </a>
                <p className="text-sm text-stone-500">
                  If you can not make it to a confirmed match please contact the other players in the
                  match to cancel the match or arrange a sub player.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
