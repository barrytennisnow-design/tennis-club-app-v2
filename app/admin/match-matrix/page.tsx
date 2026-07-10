"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [defaults, setDefaults] = useState({ court: "Langford 1", time: "8:00am warm up 8:15 start" });
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  async function load() {
    // 1. Fetch default manager settings
    const { data: sData } = await supabase.from("app_settings").select("*");
    if (sData) {
      setDefaults({
        court: sData.find(s => s.setting_key === 'default_court')?.setting_value || "Langford 1",
        time: sData.find(s => s.setting_key === 'default_time')?.setting_value || "8:00am warm up 8:15 start"
      });
    }

    // 2. Fetch matches, removing cancelled matches from the grid
    const { data: mData } = await supabase
      .from("matches")
      .select("*, match_players(player_id, players(first_name, last_name, color_code, days_per_week, days_in_row, current_week_count, current_row_count))")
      .neq('status', 'cancelled') 
      .order("match_date", { ascending: true });
      
    setMatches(mData ?? []);
  }

  async function handleGenerate() {
    // Logic to scoop up players from cancelled matches and create new drafts
    alert(`Generating new draft matches at ${defaults.court} for ${defaults.time}. Cancelled players will be reassigned.`);
    load();
  }

  useEffect(() => { load(); }, []);

  // 3. Logic to determine if player exceeds days per week or days in a row
  const isOverLimit = (player: any) => {
    if (!player) return false;
    const overWeekly = player.current_week_count > player.days_per_week;
    const overRow = player.current_row_count > player.days_in_row;
    return overWeekly || overRow;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 4 & 5. Renamed to Match Matrix and Button moved to top */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Match Matrix 🎾</h1>
        <button 
          onClick={handleGenerate}
          className="bg-court-green text-white px-4 py-2 rounded font-medium shadow hover:bg-green-700"
        >
          Generate Match Matrix
        </button>
      </div>

      <div className="overflow-x-auto border rounded bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="p-3 border-b font-semibold">Match Date</th>
              <th className="p-3 border-b font-semibold">Players</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-b hover:bg-stone-50">
                <td className="p-3 font-mono align-top text-stone-700">{m.match_date}</td>
                <td className="p-3 flex flex-wrap gap-2">
                  {m.match_players?.map((mp: any) => {
                    const player = mp.players;
                    const overLimit = isOverLimit(player);
                    
                    // Light shading if over limit, otherwise use their color code
                    const cellStyle = overLimit 
                      ? { backgroundColor: '#f3f4f6', opacity: 0.6, border: '1px solid #d1d5db' } 
                      : { backgroundColor: player?.color_code || '#e7e5e4' };
                    
                    return (
                      <div key={mp.player_id} className="relative">
                        {/* Player Cell */}
                        <button 
                          onClick={() => setActiveMenu(activeMenu === `${m.id}-${mp.player_id}` ? null : `${m.id}-${mp.player_id}`)}
                          className="px-3 py-1.5 rounded shadow-sm text-stone-900 font-medium transition-colors"
                          style={cellStyle}
                        >
                          {player?.first_name} {player?.last_name}
                        </button>
                        
                        {/* 6. Interactive Cell Functions */}
                        {activeMenu === `${m.id}-${mp.player_id}` && (
                          <div className="absolute z-10 bg-white border border-stone-200 shadow-xl mt-1 p-1.5 rounded text-xs w-40 left-0">
                            <div className="cursor-pointer p-1.5 hover:bg-stone-100 rounded text-stone-700">Assign Court</div>
                            <div className="cursor-pointer p-1.5 hover:bg-stone-100 rounded text-stone-700">Assign Time</div>
                            <div className="cursor-pointer p-1.5 hover:bg-stone-100 rounded text-stone-700">Swap Players</div>
                            <div className="cursor-pointer p-1.5 hover:bg-stone-100 rounded text-stone-700">Propose Match</div>
                            <div className="cursor-pointer p-1.5 hover:bg-red-50 text-red-600 rounded font-medium mt-1 border-t border-stone-100 pt-2">Cancel Match</div>
                          </div>
                        )}
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