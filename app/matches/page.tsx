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
      // Fetch matches linked to this player
      const { data: assignments } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("player_id", p.id);

      if (assignments && assignments.length > 0) {
        const matchIds = assignments.map(a => a.match_id);
        const { data: matches } = await supabase
          .from("matches")
          .select("*")
          .in("id", matchIds)
          .order("date", { ascending: true });

        setMyMatches(matches || []);

        // Fetch all players for these matches to compile the rosters
        const { data: allRosters } = await supabase
          .from("match_players")
          .select("*, players(first_name, last_name, phone)")
          .in("match_id", matchIds);

        const grouped: Record<string, any[]> = {};
        allRosters?.forEach(r => {
          if (!grouped[r.match_id]) grouped[r.match_id] = [];
          grouped[r.match_id].push({
            player_id: r.player_id,
            first_name: r.players?.first_name,
            last_name: r.players?.last_name,
            phone: r.players?.phone,
            status: r.status
          });
        });
        setRosterByMatch(grouped);
      }
    }
    setLoading(false);
  }

  async function handleStatusChange(matchId: string, newStatus: string) {
    if (!player) return;
    setBusyId(matchId);
    await supabase
      .from("match_players")
      .update({ status: newStatus })
      .eq("match_id", matchId)
      .eq("player_id", player.id);
    await load();
    setBusyId(null);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-6 font-mono text-gray-600">Loading your matches...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 font-mono text-black bg-white selection:bg-gray-200">
      {/* Exact title format from prior system */}
      <h1 className="text-2xl font-bold mb-6">Your Matches</h1>

      {myMatches.length === 0 ? (
        <p className="text-gray-600">No matches scheduled at this time.</p>
      ) : (
        <div className="space-y-10">
          {myMatches.map((match) => {
            const players = rosterByMatch[match.id] || [];
            
            // Find current logged-in player's status in this specific match
            const currentPlayerStatus = players.find(p => p.player_id === player?.id)?.status || "PENDING";
            const isMatchConfirmed = match.status?.toUpperCase() === "CONFIRMED";

            return (
              <div key={match.id} className="border-b border-gray-300 pb-8 last:border-none">
                {/* Header Information matching your classic structure */}
                <div className="font-bold">
                  Match ID: {match.match_number || match.id} <span className="uppercase">{match.status}</span>
                </div>
                <div>
                  Court: {match.court_name || match.court || "TBD"}
                </div>
                <div>
                  Date & Time: {match.date_time || `${match.date} at ${match.time}`}
                </div>
                
                {/* Roster Layout matching your clean asterisk/bullet configuration */}
                <div className="mt-2">Players:</div>
                <ul className="list-none pl-0 my-1 space-y-1">
                  {players.map((p, idx) => (
                    <li key={idx} className="whitespace-pre-wrap">
                      * {p.first_name} {p.last_name} Status: <span className="uppercase font-semibold">{p.status}</span> | Phone: {p.phone || "N/A"}
                    </li>
                  ))}
                </ul>

                {/* Retaining web functionality: Action Buttons show up if a response is needed */}
                {!isMatchConfirmed && currentPlayerStatus.toUpperCase() === "PENDING" && (
                  <div className="mt-4 flex gap-4 font-sans">
                    <button
                      disabled={!!busyId}
                      onClick={() => handleStatusChange(match.id, "ACCEPTED")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-4 rounded text-sm disabled:opacity-50 transition-colors"
                    >
                      {busyId === match.id ? "Processing..." : "Accept Match"}
                    </button>
                    <button
                      disabled={!!busyId}
                      onClick={() => handleStatusChange(match.id, "DECLINED")}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-4 rounded text-sm disabled:opacity-50 transition-colors"
                    >
                      Decline Match
                    </button>
                  </div>
                )}

                {/* Footer cancellation warning injected precisely when confirmed */}
                {isMatchConfirmed && (
                  <div className="mt-4 text-sm font-sans text-gray-800 leading-relaxed bg-gray-50 border-l-4 border-amber-500 p-3 italic">
                    If you can not make it to a confirmed match please contact the other players in the match to cancel the match or arrange a sub player.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
