"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [defaults, setDefaults] = useState({ court: "Langford 1", time: "8:00am warm up 8:15 start" });
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  async function load() {
    // Fetch settings for defaults
    const { data: sData } = await supabase.from("app_settings").select("*");
    if (sData) {
      setDefaults({
        court: sData.find(s => s.setting_key === 'default_court')?.setting_value || "Langford 1",
        time: sData.find(s => s.setting_key === 'default_time')?.setting_value || "8:00am warm up 8:15 start"
      });
    }

    // Fetch matches: exclude cancelled, order by date
    const { data: mData } = await supabase
      .from("matches")
      .select("*, match_players(player_id, players(*))")
      .neq('status', 'cancelled')
      .order("match_date", { ascending: true });
      
    setMatches(mData ?? []);
  }

  // Handle generation: re-assigns cancelled players to new draft matches
  async function handleGenerate() {
    alert(`Generating new drafts at ${defaults.court} for ${defaults.time}.`);
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Match Matrix</h1>
        <button 
          onClick={handleGenerate}
          className="bg-green-600 text-white px-4 py-2 rounded font-medium shadow"
        >
          Generate Match Matrix
        </button>
      </div>

      <div className="overflow-x-auto border rounded shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-100">
            <tr>
              <th className="p-3 text-left">Match Date</th>
              <th className="p-3 text-left">Players</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3 font-mono">{m.match_date}</td>
                <td className="p-3 flex gap-2">
                  {m.match_players?.map((mp: any) => {
                    const p = mp.players;
                    const isOverLimit = (p.current_week_count > p.days_per_week) || (p.current_row_count > p.days_in_row);
                    
                    return (
                      <div key={mp.player_id} className="relative">
                        <button 
                          onClick={() => setActiveMenu(activeMenu === `${m.id}-${p.id}` ? null : `${m.id}-${p.id}`)}
                          className={`px-3 py-1 rounded text-white ${isOverLimit ? 'opacity-50' : ''}`}
                          style={{ backgroundColor: p.color_code || '#6b7280' }}
                        >
                          {p.first_name}
                        </button>
                        
                        {activeMenu === `${m.id}-${p.id}` && (
                          <div className="absolute z-20 bg-white border shadow-lg mt-1 p-2 rounded text-xs w-32">
                            <div className="p-1 hover:bg-stone-100 cursor-pointer">Assign Court</div>
                            <div className="p-1 hover:bg-stone-100 cursor-pointer">Assign Time</div>
                            <div className="p-1 hover:bg-stone-100 cursor-pointer">Swap Players</div>
                            <div className="p-1 hover:bg-stone-100 cursor-pointer">Propose Match</div>
                            <div className="p-1 hover:bg-red-50 text-red-600 cursor-pointer">Cancel Match</div>
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