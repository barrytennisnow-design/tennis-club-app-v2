"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Fetch matches: exclude cancelled
    const { data, error } = await supabase
      .from("matches")
      .select("*, match_players(player_id, players(*))")
      .neq('status', 'cancelled')
      .order("match_date", { ascending: true });
      
    if (error) console.error("Error loading matches:", error);
    setMatches(data || []);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Match Matrix</h1>
        <button 
          onClick={() => alert("Generate logic triggered")}
          className="bg-green-600 text-white px-4 py-2 rounded shadow"
        >
          Generate Match Matrix
        </button>
      </div>
      <div className="border rounded shadow-sm overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b">
            <tr>
              <th className="p-3 text-left">Match Date</th>
              <th className="p-3 text-left">Players</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-3 font-mono">{m.match_date}</td>
                <td className="p-3 flex gap-2">
                  {m.match_players?.map((mp: any) => {
                    const p = mp.players || {};
                    const isOverLimit = (p.current_week_count > p.days_per_week) || (p.current_row_count > p.days_in_row);
                    
                    return (
                      <div key={mp.player_id} className="relative">
                        <button 
                          onClick={() => setActiveMenu(activeMenu === `${m.id}-${p.id}` ? null : `${m.id}-${p.id}`)}
                          className={`px-3 py-1 rounded text-white ${isOverLimit ? 'ring-2 ring-stone-400' : ''}`}
                          style={{ backgroundColor: p.color_code || '#6b7280', opacity: isOverLimit ? 0.6 : 1 }}
                        >
                          {p.first_name || "Unknown"}
                        </button>
                      </div>
                    );
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}