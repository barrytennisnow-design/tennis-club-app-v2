"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDate } from "@/lib/formatDate";

export default function AdminMatchesPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(id, name), match_players(id, response_status, decline_reason, player_id, players(id, first_name, last_name))")
      .not("status", "eq", "draft")
      .order("match_date", { ascending: false });
    setMatches(data ?? []);
  }

  async function updateTimeout(matchId: string, hours: number) {
    await supabase.from("matches").update({ auto_cancel_hours: hours }).eq("id", matchId);
    load();
  }

  async function updateNudgeCount(matchId: string, count: number) {
    await supabase.from("matches").update({ nudge_count: count }).eq("id", matchId);
    load();
  }

  useEffect(() => {
    load();
  }, []);

  const statusStyles: Record<string, string> = {
    draft: "bg-stone-200 text-stone-700",
    proposed: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Matches Tracking</h1>
        <a href="/admin/grid" className="rounded-md bg-court-green px-4 py-2 text-sm text-white">
          Go to Match Matrix (generate / edit matches) →
        </a>
      </div>

      {/* Read-only overview -- all editing (propose/cancel/swap/court)
          happens on the Match Matrix page now. */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-stone-100 text-left text-stone-600">
            <tr>
              <th className="p-2">Match</th>
              <th className="p-2">Day</th>
              <th className="p-2">Time</th>
              <th className="p-2">Court</th>
              <th className="p-2">Player 1</th>
              <th className="p-2">Player 2</th>
              <th className="p-2">Player 3</th>
              <th className="p-2">Player 4</th>
              <th className="p-2">Status</th>
              <th className="p-2">Proposed</th>
              <th className="p-2">Confirmed</th>
              <th className="p-2">Cancelled</th>
              <th className="p-2">Hours for Auto Cancel</th>
              <th className="p-2">Nudge Count</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const rowColor =
                m.status === "confirmed" ? "bg-green-50" :
                m.status === "proposed" ? "bg-yellow-50" :
                m.status === "cancelled" ? "bg-red-50" :
                "bg-stone-50";
              const players = [0, 1, 2, 3].map((i) => m.match_players[i]);
              return (
                <tr key={m.id} className={`border-t ${rowColor}`}>
                  <td className="p-2 font-mono">M{m.match_number}</td>
                  <td className="p-2">{formatShortDate(m.match_date)}</td>
                  <td className="p-2">{m.time_display || m.time_slot}</td>
                  <td className="p-2">{m.court?.name ?? "TBD"}</td>
                  {players.map((mp: any, i: number) => (
                    <td key={i} className="p-2">
                      {mp ? (
                        <>
                          {mp.players ? `${mp.players.first_name} ${mp.players.last_name}` : 'Unknown Player'}
                          {m.status !== "draft" && (
                            <span className="text-stone-400"> : {mp.response_status.toUpperCase()}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[m.status]}`}>
                      {m.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2">{m.proposed_at ? new Date(m.proposed_at).toLocaleString() : "—"}</td>
                  <td className="p-2">{m.confirmed_at ? new Date(m.confirmed_at).toLocaleString() : "—"}</td>
                  <td className="p-2">{m.cancelled_at ? new Date(m.cancelled_at).toLocaleString() : "—"}</td>
                  <td className="p-2">
                    {m.status === "proposed" ? (
                      <input
                        type="number"
                        className="w-16 rounded border border-stone-300 px-1 py-0.5 text-xs"
                        value={m.auto_cancel_hours ?? 24}
                        onChange={(e) => updateTimeout(m.id, parseInt(e.target.value) || 24)}
                        min="1"
                      />
                    ) : (
                      <span className="text-stone-400">{m.auto_cancel_hours ?? 24}</span>
                    )}
                  </td>
                  <td className="p-2">
                    {m.status === "proposed" ? (
                      <input
                        type="number"
                        className="w-16 rounded border border-stone-300 px-1 py-0.5 text-xs"
                        value={m.nudge_count ?? 0}
                        onChange={(e) => updateNudgeCount(m.id, parseInt(e.target.value) || 0)}
                        min="0"
                      />
                    ) : (
                      <span className="text-stone-400">{m.nudge_count ?? 0}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {matches.length === 0 && (
              <tr><td colSpan={14} className="p-4 text-center text-stone-400">No matches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
