"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function AdminHome() {
  const supabase = createClient();
  const [isManager, setIsManager] = useState<boolean | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [ratings, setRatings] = useState<Record<string, string>>({});

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setIsManager(false);
      return;
    }
    const { data: me } = await supabase
      .from("players")
      .select("role")
      .eq("auth_user_id", userData.user.id)
      .single();

    if (me?.role !== "manager") {
      setIsManager(false);
      return;
    }
    setIsManager(true);

    const { data: pendingPlayers } = await supabase
      .from("players")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending(pendingPlayers ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(playerId: string) {
    const ranking = ratings[playerId];
    await fetch("/api/approve-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, ranking: ranking ? Number(ranking) : null }),
    });
    load();
  }

  async function decline(playerId: string) {
    await fetch("/api/approve-player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, decline: true }),
    });
    load();
  }

  if (isManager === null) return <p>Loading...</p>;
  if (isManager === false) return <p>This area is for managers only.</p>;

  return (
    <div className="space-y-8">
      <div className="flex gap-4 text-sm">
        <Link href="/admin/roster" className="underline text-court-green">Full Roster</Link>
        <Link href="/admin/matches" className="underline text-court-green">Matches</Link>
      </div>

      <div>
        <h1 className="mb-4 text-xl font-bold">Pending Player Approvals ({pending.length})</h1>
        {pending.length === 0 && <p className="text-stone-500">No one waiting on approval.</p>}
        <div className="space-y-3">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{p.first_name} {p.last_name}</p>
                <p className="text-sm text-stone-500">{p.email} · {p.phone}</p>
                <p className="text-sm text-stone-500">
                  Self-rated: {p.self_reported_ranking ?? "—"} · Wants {p.days_per_week} days/week
                </p>
                {p.notes && <p className="text-sm italic text-stone-500">"{p.notes}"</p>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border border-stone-300 px-2 py-1 text-sm"
                  value={ratings[p.id] ?? p.self_reported_ranking ?? ""}
                  onChange={(e) => setRatings({ ...ratings, [p.id]: e.target.value })}
                >
                  <option value="">Set rating...</option>
                  {["2.5","2.75","3.0","3.25","3.5","3.75","4.0","4.25","4.5"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button onClick={() => approve(p.id)}
                  className="rounded-md bg-court-green px-3 py-1 text-sm text-white">
                  Approve
                </button>
                <button onClick={() => decline(p.id)}
                  className="rounded-md border border-stone-300 px-3 py-1 text-sm">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
