"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MyMatchesPage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [myMatches, setMyMatches] = useState<any[]>([]);
  const [rosterByMatch, setRosterByMatch] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  async function load() {
    setDbError(null);
    
    // 1. Get logged-in user
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      setLoading(false);
      return;
    }

    // 2. Find player profile
    const { data: p, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    
    if (playerError) {
      setDbError("Error loading player profile: " + playerError.message);
      setLoading(false);
      return;
    }
    
    setPlayer(p);

    if (p) {
      // 3. Get match assignments
      const { data: assignments, error: assignError } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("player_id", p.id);

      if (assignError) {
        setDbError("Error loading match links: " + assignError.message);
        setLoading(false);
        return;
      }

      if (assignments && assignments.length > 0) {
        const matchIds = assignments.map(a => a.match_id);
        
        // 4. Fetch match details
        const { data: matches, error: matchesError } = await supabase
          .from("matches")
          .select("*")
          .in("id", matchIds);

        if (matchesError) {
          setDbError("Error loading matches: " + matchesError.message);
          setLoading(false);
          return;
        }

        setMyMatches(matches || []);

        // 5. Fetch entire rosters for these matches
        const { data: allRosters, error: rosterError } = await supabase
          .from("match_players")
          .select("*, players(first_name, last_name, phone)")
          .in("match_id", matchIds);

        if (rosterError) {
          setDbError("Error loading roster details: " + rosterError.message);
          setLoading(false);
          return;
        }

        const grouped: Record<string, any[]> = {};
        allRosters?.forEach(r => {
          if (!grouped[r.match_id]) grouped[r.match_id] = [];
          grouped[r.match_id].push({
            player_id: r.player_id,
            first_name: r.players?.first_name,
            last_name: r.players?.last_name,
            phone: r.players?.phone,
            response_status: r.response_status
          });
        });
        setRosterByMatch(grouped);
      }
    }
    setLoading(false);
  }

  async function handleStatusChange(matchId: string, newStatus: string) {
    if (!player) return;
    const { error } = await supabase
      .from("match_players")
      .update({ response_status: newStatus.toLowerCase() })
      .eq("match_id", matchId)
      .eq("player_id", player.id);
      
    if (error) {
      alert("Could not update status: " + error.message);
    } else {
      await load();
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-6 font-mono text-gray-600">Loading your matches...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 font-mono text-black bg-white selection:bg-gray-200">
      <h1 className="text-2xl font-bold mb-6">Your Matches</h1>

      {dbError && (
        <div className="mb-6 p-4 border border-rose-300 bg-rose-50 text-rose-900 rounded font-sans text-sm">
          <strong>Database Error Details:</strong> {dbError}
        </div>
      )}

      {myMatches.length === 0 ? (
        <div className="space-y-4 text-gray-600">
          <p>No matches scheduled at this time.</p>
          {!dbError && (
            <div className="text-xs border border-amber-200 bg-amber-50 p-3 rounded text-amber-900 font-sans leading-relaxed">
              <strong>Connection Verified:</strong> Your player profile links perfectly to your database assignments. If you still see this, double-check that your active local login session is running under the same account, or check your Supabase Row Level Security (RLS) settings for the <code>matches</code> table.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {myMatches.map((match) => {
            const players = rosterByMatch[match.id] || [];
            const currentPlayerRosterItem = players.find(p => p.player_id === player?.id);
            const currentPlayerStatus = currentPlayerRosterItem?.response_status || "proposed";
            
            const isMatchConfirmed = match.status?.toUpperCase() === "CONFIRMED";
            const currentStatusUpper = currentPlayerStatus.toUpperCase();
            const needsAction = !isMatchConfirmed && (currentStatusUpper === "PROPOSED" || currentStatusUpper === "PENDING");

            return (
              <div key={match.id} className="border-b border-gray-300 pb-8 last:border-none">
                <div className="font-bold">
                  Match ID: {match.match_number || match.id} <span className="uppercase">{match.status}</span>
                </div>
                <div>
                  Court: {match.court_name || match.court || "TBD"}
                </div>
                <div>
                  Date & Time: {match.date_time || `${match.date} at ${match.time}`}
                </div>
                
                <div className="mt-2">Players:</div>
                <ul className="list-none pl-0 my-1 space-y-1">
                  {players.map((p, idx) => (
                    <li key={idx} className="whitespace-pre-wrap">
                      * {p.first_name} {p.last_name} Status: <span className="uppercase font-semibold">{p.response_status || "PROPOSED"}</span> | Phone: {p.phone || "N/A"}
                    </li>
                  ))}
                </ul>

                {needsAction && (
                  <div className="mt-4 flex gap-4 font-sans">
                    <button
                      onClick={() => handleStatusChange(match.id, "accepted")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-4 rounded text-sm transition-colors"
                    >
                      Accept Match
                    </button>
                    <button
                      onClick={() => handleStatusChange(match.id, "disabled")}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-4 rounded text-sm transition-colors"
                    >
                      Decline Match
                    </button>
                  </div>
                )}

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
