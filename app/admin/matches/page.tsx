"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDate, formatShortDateWithWeekday } from "@/lib/formatDate";
import { useMyAccess } from "@/lib/useMyAccess";
import { hasPermission } from "@/lib/permissions";

export default function AdminMatchesPage() {
  const supabase = createClient();
  const access = useMyAccess();
  const [matches, setMatches] = useState<any[]>([]);
  const [allowDelete, setAllowDelete] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(id, name), proposer:players!proposed_by(first_name, last_name), match_players(id, response_status, decline_reason, player_id, players(id, first_name, last_name))")
      .not("status", "eq", "draft")
      .order("proposed_at", { ascending: false });
    setMatches(data ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("allow_match_delete").single();
    setAllowDelete(settingsRow?.allow_match_delete ?? true);
  }

  async function updateTimeout(matchId: string, hours: number) {
    await supabase.from("matches").update({ auto_cancel_hours: hours }).eq("id", matchId);
    load();
  }

  async function updateNudgeCount(matchId: string, count: number) {
    await supabase.from("matches").update({ nudge_count: count }).eq("id", matchId);
    load();
  }

  async function cancelMatch(matchId: string, matchNumber: number) {
    if (!confirm(`Cancel match M${matchNumber}? Everyone in it will be emailed that it's cancelled.`)) return;
    const res = await fetch("/api/admin/cancel-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.error ?? "Couldn't cancel that match"); return; }
    load();
  }

  async function deleteMatch(matchId: string, matchNumber: number) {
    if (!confirm(`Permanently DELETE match M${matchNumber}? This cannot be undone and sends no notifications -- only use this for test/junk matches.`)) return;
    const res = await fetch("/api/admin/delete-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.error ?? "Couldn't delete that match"); return; }
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

      {/* Cancel and (manager-only) permanent Delete are available
          right here now. Everything else -- propose/swap/court --
          still happens on the Match Matrix page. Cancelled matches
          stay listed here (only drafts are excluded from this view). */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-stone-100 text-left text-stone-600">
            <tr>
              <th className="p-2">Match</th>
              <th className="p-2">Proposed By</th>
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
              <th className="p-2">Actions</th>
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
                  <td className="p-2">{m.proposer ? `${m.proposer.first_name} ${m.proposer.last_name}` : "Manager"}</td>
                  <td className="p-2 whitespace-nowrap leading-tight">
                    <div>{formatShortDateWithWeekday(m.match_date).split(" ")[0]}</div>
                    <div>{formatShortDate(m.match_date)}</div>
                  </td>
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
                    {m.status === "proposed" && hasPermission(access, "matches_change_timeout") ? (
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
                    {m.status === "proposed" && hasPermission(access, "matches_change_nudge_count") ? (
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
                  <td className="p-2">
                    <div className="flex gap-1">
                      {(m.status === "proposed" || m.status === "confirmed") && hasPermission(access, "matrix_cancel_match") && (
                        <button
                          onClick={() => cancelMatch(m.id, m.match_number)}
                          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      )}
                      {access.role === "manager" && allowDelete && (
                        <button
                          onClick={() => deleteMatch(m.id, m.match_number)}
                          className="rounded border border-stone-400 px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
                          title="Permanently delete -- for test data cleanup only"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {matches.length === 0 && (
              <tr><td colSpan={16} className="p-4 text-center text-stone-400">No matches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
