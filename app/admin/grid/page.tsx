"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function isoDaysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextNDays(n: number) {
  const days = [];
  for (let i = 0; i < n; i++) days.push(isoDaysFromNow(i));
  return days;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-stone-200 text-stone-700",
  proposed: "bg-yellow-200 text-yellow-900",
  confirmed: "bg-green-200 text-green-900",
};

export default function MatchGridPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<any[]>([]);
  const [cellData, setCellData] = useState<Record<string, { label: string; status: string }>>({});
  const [loading, setLoading] = useState(true);
  const days = nextNDays(30);

  async function load() {
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("status", "active")
      .order("last_name");
    setPlayers(playerRows ?? []);

    const { data: matches } = await supabase
      .from("matches")
      .select("id, match_date, time_slot, status, court:courts(name), match_players(player_id)")
      .gte("match_date", days[0])
      .lte("match_date", days[days.length - 1])
      .neq("status", "cancelled");

    const cells: Record<string, { label: string; status: string }> = {};
    for (const m of matches ?? []) {
      const courtName = (m.court as any)?.name ?? "TBD";
      const label = `${courtName.split(" ")[0]} ${m.id.slice(0, 3)}`;
      for (const mp of m.match_players) {
        cells[`${mp.player_id}_${m.match_date}`] = { label, status: m.status };
      }
    }
    setCellData(cells);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Match Grid</h1>
      <p className="text-sm text-stone-600">
        Each cell shows the match a player is in that day (court + match code), color-coded by status.
        <span className="ml-2 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs">draft</span>
        <span className="ml-1 inline-block rounded bg-yellow-200 px-2 py-0.5 text-xs">proposed</span>
        <span className="ml-1 inline-block rounded bg-green-200 px-2 py-0.5 text-xs">confirmed</span>
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="text-xs">
          <thead className="bg-stone-100">
            <tr>
              <th className="sticky left-0 z-10 bg-stone-100 p-2 text-left">Player</th>
              {days.map((d) => (
                <th key={d} className="whitespace-nowrap p-2 text-center font-normal">
                  {new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2 font-medium">
                  {p.first_name} {p.last_name}
                </td>
                {days.map((d) => {
                  const cell = cellData[`${p.id}_${d}`];
                  return (
                    <td key={d} className="p-1 text-center">
                      {cell ? (
                        <span className={`inline-block rounded px-1.5 py-0.5 ${STATUS_COLORS[cell.status]}`}>
                          {cell.label}
                        </span>
                      ) : (
                        <span className="text-stone-300">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
