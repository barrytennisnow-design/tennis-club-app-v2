"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [defaults, setDefaults] = useState({ court: "Langford 1", time: "8:00am" });
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  async function load() {
    const { data: sData } = await supabase.from("app_settings").select("*");
    if (sData) {
      setDefaults({
        court: sData.find(s => s.setting_key === 'default_court')?.setting_value || "Langford 1",
        time: sData.find(s => s.setting_key === 'default_time')?.setting_value || "8:00am"
      });
    }

    const { data: mData } = await supabase
      .from("matches")
      .select("*, match_players(player_id, players(first_name, last_name))")
      .neq('status', 'cancelled') // Requirement: Remove cancelled
      .order("match_date", { ascending: true });
    setMatches(mData ?? []);
  }

  // Requirement: Logic for Generate Match Matrix
  async function handleGenerate() {
    // Logic to create draft match with defaults.court and defaults.time
    alert(`Generating match at ${defaults.court} for ${defaults.time}`);
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Match Matrix</h1>
        <button 
          onClick={handleGenerate}
          className="bg-court-green text-white px-4 py-2 rounded font-medium"
        >
          Generate Match Matrix
        </button>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="p-2">Match Date</th>
              <th className="p-2">Players</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2 font-mono">{m.match_date}</td>
                <td className="p-2 flex gap-2">
                  {m.match_players.map((mp: any) => (
                    <div key={mp.player_id} className="relative">
                      <button 
                        onClick={() => setActiveMenu(activeMenu === `${m.id}-${mp.player_id}` ? null : `${m.id}-${mp.player_id}`)}
                        className="bg-stone-100 p-1 rounded hover:bg-stone-200"
                      >
                        {mp.players.first_name}
                      </button>
                      {activeMenu === `${m.id}-${mp.player_id}` && (
                        <div className="absolute z-10 bg-white border shadow-lg mt-1 p-2 rounded text-xs w-32">
                          <div className="cursor-pointer hover:text-blue-600">Assign Court</div>
                          <div className="cursor-pointer hover:text-blue-600">Assign Time</div>
                          <div className="cursor-pointer hover:text-blue-600">Swap Players</div>
                          <div className="cursor-pointer hover:text-blue-600">Propose Match</div>
                          <div className="cursor-pointer hover:text-red-600">Cancel Match</div>
                        </div>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}