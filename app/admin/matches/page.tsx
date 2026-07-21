"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDate, formatShortDateWithWeekday } from "@/lib/formatDate";
import { useMyAccess } from "@/lib/useMyAccess";
import { hasPermission } from "@/lib/permissions";
import { proposerDisplayName } from "@/lib/formatName";
import { MATCH_STATUS_STYLES, matchStatusLabel } from "@/lib/matchStatus";

export default function AdminMatchesPage() {
  const supabase = createClient();
  const access = useMyAccess();
  const [matches, setMatches] = useState<any[]>([]);
  const [allowDelete, setAllowDelete] = useState(true);
  // Local text buffers for the two editable number columns, keyed by
  // match id. The inputs are NOT bound directly to m.auto_cancel_hours /
  // m.nudge_count while being edited -- that used to fire a DB write +
  // full-table reload on every keystroke, and the resulting async
  // round trips could resolve out of order and stomp the value the
  // user just typed (it would appear to silently revert). Instead we
  // buffer here and only commit on blur / Enter.
  const [timeoutEdits, setTimeoutEdits] = useState<Record<string, string>>({});
  const [nudgeEdits, setNudgeEdits] = useState<Record<string, string>>({});
  const [defaultTimeDisplay, setDefaultTimeDisplay] = useState("");

  async function load() {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(id, name), proposer:players!proposed_by(first_name, last_name), match_players(id, response_status, decline_reason, player_id, players(id, first_name, last_name))")
      .not("status", "eq", "draft")
      .order("proposed_at", { ascending: false });
    setMatches(data ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("allow_match_delete").single();
    setAllowDelete(settingsRow?.allow_match_delete ?? true);
    // time_slot is just an internal label ("morning") -- the actual
    // human-readable time only exists on time_display (a manager's
    // per-match override) or, absent that, whichever time slot is
    // flagged default. Falling back to time_slot itself is what was
    // showing "morning" instead of the real description.
    const { data: defaultSlot } = await supabase
      .from("time_slots")
      .select("description")
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();
    setDefaultTimeDisplay(defaultSlot?.description ?? "");
  }

  async function updateTimeout(matchId: string, hours: number) {
    // Optimistic local update -- avoids a full reload() racing with
    // the write, and keeps the UI snappy even if the request is slow.
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, auto_cancel_hours: hours } : m)));
    setTimeoutEdits((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
    const { error } = await supabase.from("matches").update({ auto_cancel_hours: hours }).eq("id", matchId);
    if (error) {
      alert(`Couldn't save auto-cancel hours: ${error.message}`);
      load(); // re-sync with the server since our optimistic update was wrong
    }
  }

  async function updateNudgeCount(matchId: string, count: number) {
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, nudge_count: count } : m)));
    setNudgeEdits((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
    const { error } = await supabase.from("matches").update({ nudge_count: count }).eq("id", matchId);
    if (error) {
      alert(`Couldn't save nudge count: ${error.message}`);
      load();
    }
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
                  <td className="p-2">{proposerDisplayName(m.proposer) ?? "Manager"}</td>
                  <td className="p-2 whitespace-nowrap leading-tight">
                    <div>{formatShortDateWithWeekday(m.match_date).split(" ")[0]}</div>
                    <div>{formatShortDate(m.match_date)}</div>
                  </td>
                  <td className="p-2">{m.time_display || defaultTimeDisplay || m.time_slot}</td>
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_STATUS_STYLES[m.status] ?? "bg-stone-200 text-stone-700"}`}>
                      {matchStatusLabel(m.status)}
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
                        value={timeoutEdits[m.id] ?? String(m.auto_cancel_hours ?? 24)}
                        onChange={(e) => setTimeoutEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          updateTimeout(m.id, Number.isFinite(parsed) && parsed > 0 ? parsed : m.auto_cancel_hours ?? 24);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
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
                        value={nudgeEdits[m.id] ?? String(m.nudge_count ?? 0)}
                        onChange={(e) => setNudgeEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        onBlur={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          updateNudgeCount(m.id, Number.isFinite(parsed) && parsed >= 0 ? parsed : m.nudge_count ?? 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
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
