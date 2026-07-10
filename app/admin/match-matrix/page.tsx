"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function MatchMatrixPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<any[]>([]);
  const [defaults, setDefaults] = useState({ court: "", time: "" });

  async function load() {
    const { data: sData } = await supabase.from("app_settings").select("*");
    if (sData) {
      setDefaults({
        court: sData.find(s => s.setting_key === 'default_court')?.setting_value || "TBD",
        time: sData.find(s => s.setting_key === 'default_time')?.setting_value || "8:00am"
      });
    }

    const { data: mData } = await supabase
      .from("matches")
      .select("*, match_players(player_id, players(first_name, last_name))")
      .order("match_date", { ascending: true });
    setMatches(mData ?? []);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Match Matrix</h1>

      <div className="p-4 border rounded bg-stone-50">
        <button className="bg-court-green text-white px-4 py-2 rounded font-medium">
          Generate Match Matrix
        </button>
        <div className="text-xs text-stone-500 mt-2">
          Default Court: {defaults.court} | Default Time: {defaults.time}
        </div>
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
                    <span key={mp.player_id} className="bg-stone-100 p-1 rounded">
                      {mp.players.first_name}
                    </span>
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