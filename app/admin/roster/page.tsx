"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function RosterPage() {
  const supabase = createClient();
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "pending" | "declined">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("players").select("*").order("last_name");
    setPlayers(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: string) {
    await supabase.from("players").update({ status }).eq("id", id);
    load();
  }

  async function sendAccessLink(id: string) {
    setBusyId(id);
    setMessage(null);
    const res = await fetch("/api/admin/send-access-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: id }),
    });
    const json = await res.json();
    setBusyId(null);
    setMessage(json.ok ? `Access link sent (${json.emailStatus}). Link: ${json.accessUrl}` : `Error: ${json.error}`);
  }

  async function logInAs(id: string) {
    if (!confirm("This will switch YOUR browser session to this player, for testing. You'll need to log back in as manager afterward. Continue?")) return;
    setBusyId(id);
    setMessage(null);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: id }),
    });
    const json = await res.json();
    setBusyId(null);
    if (json.ok) {
      router.push("/profile");
    } else {
      setMessage(`Error: ${json.error}`);
    }
  }

  const filtered = filter === "all" ? players : players.filter((p) => p.status === filter);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Roster</h1>
      <div className="flex gap-2 text-sm">
        {(["all", "active", "paused", "pending", "declined"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${filter === f ? "bg-court-green text-white" : "bg-stone-100"}`}>
            {f}
          </button>
        ))}
      </div>
      {message && (
        <p className="break-all rounded-md bg-stone-100 p-2 text-xs text-stone-700">{message}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-stone-500">
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Ranking</th>
            <th>Status</th>
            <th>Days/wk</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.first_name} {p.last_name}</td>
              <td>{p.email}</td>
              <td>{p.ranking ?? p.self_reported_ranking ?? "—"}</td>
              <td>{p.status}</td>
              <td>{p.days_per_week ?? "—"}</td>
              <td className="space-x-2 whitespace-nowrap">
                {p.status !== "active" && (
                  <button onClick={() => setStatus(p.id, "active")} className="text-court-green underline">Activate</button>
                )}
                {p.status === "active" && (
                  <button onClick={() => setStatus(p.id, "paused")} className="text-stone-500 underline">Pause</button>
                )}
                <button disabled={busyId === p.id} onClick={() => sendAccessLink(p.id)}
                  className="text-blue-600 underline disabled:opacity-50">
                  Send access link
                </button>
                <button disabled={busyId === p.id} onClick={() => logInAs(p.id)}
                  className="text-purple-600 underline disabled:opacity-50">
                  Log in as (test)
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
