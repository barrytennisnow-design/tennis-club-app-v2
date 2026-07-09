"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function ProfilePage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("auth_user_id", userData.user.id)
        .single();
      setPlayer(data);
      setLoading(false);
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("players")
      .update({
        phone: player.phone,
        address: player.address,
        city: player.city,
        state: player.state,
        zip: player.zip,
        days_per_week: player.days_per_week,
        days_in_a_row: player.days_in_a_row,
        notes: player.notes,
      })
      .eq("id", player.id);
    setSaving(false);
    if (!error) setSaved(true);
  }

  if (loading) return <p>Loading...</p>;
  if (!player)
    return (
      <p>
        You're not logged in yet. <a href="/login" className="underline">Log in</a> or{" "}
        <a href="/signup" className="underline">sign up</a>.
      </p>
    );

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold">
        {player.first_name} {player.last_name}
      </h1>

      <p
        className={`inline-block rounded-full px-3 py-1 text-sm ${
          player.status === "active"
            ? "bg-green-100 text-green-800"
            : player.status === "pending"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-stone-200 text-stone-700"
        }`}
      >
        Status: {player.status}
      </p>

      {player.status === "pending" && (
        <p className="text-sm text-stone-600">
          Your profile is awaiting manager approval. You'll be able to enter
          availability once you're approved.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <p><strong>Email:</strong> {player.email}</p>
        <p><strong>Ranking:</strong> {player.ranking ?? player.self_reported_ranking ?? "—"} {!player.ranking && "(self-reported, pending manager review)"}</p>
      </div>

      <label className="block text-sm font-medium">
        Phone
        <input className="input mt-1 w-full" value={player.phone ?? ""}
          onChange={(e) => setPlayer({ ...player, phone: e.target.value })} />
      </label>

      <label className="block text-sm font-medium">
        Address
        <input className="input mt-1 w-full" value={player.address ?? ""}
          onChange={(e) => setPlayer({ ...player, address: e.target.value })} />
      </label>

      <div className="grid grid-cols-3 gap-4">
        <input placeholder="City" className="input" value={player.city ?? ""}
          onChange={(e) => setPlayer({ ...player, city: e.target.value })} />
        <input placeholder="State" className="input" value={player.state ?? ""}
          onChange={(e) => setPlayer({ ...player, state: e.target.value })} />
        <input placeholder="Zip" className="input" value={player.zip ?? ""}
          onChange={(e) => setPlayer({ ...player, zip: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Days per week
          <select className="input mt-1 w-full" value={player.days_per_week ?? ""}
            onChange={(e) => setPlayer({ ...player, days_per_week: Number(e.target.value) })}>
            {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Days in a row
          <select className="input mt-1 w-full" value={player.days_in_a_row ?? ""}
            onChange={(e) => setPlayer({ ...player, days_in_a_row: Number(e.target.value) })}>
            {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <textarea placeholder="Anything else you want to say?" className="input w-full" rows={3}
        value={player.notes ?? ""} onChange={(e) => setPlayer({ ...player, notes: e.target.value })} />

      <button disabled={saving}
        className="rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50">
        {saving ? "Saving..." : "Save changes"}
      </button>
      {saved && <p className="text-green-700">Saved!</p>}

      {player.status === "active" && (
        <p className="text-sm">
          <a href="/availability" className="underline text-court-green">
            Go to your 30-day availability →
          </a>
        </p>
      )}

      <style jsx global>{`
        .input {
          border: 1px solid #d6d3d1;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
        }
      `}</style>
    </form>
  );
}
