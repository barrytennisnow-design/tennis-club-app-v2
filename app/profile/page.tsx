"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatPhone } from "@/lib/formatPhone";

const RANKING_OPTIONS = ["2.5","2.75","3.0","3.25","3.5","3.75","4.0","4.25","4.5"];

export default function ProfilePage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "registering" | "error">("idle");
  const [passkeyError, setPasskeyError] = useState("");

  async function loadPasskeys() {
    const { data } = await supabase.auth.passkey.list();
    setPasskeys(data ?? []);
  }

  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  async function handleRegisterPasskey() {
    setPasskeyStatus("registering");
    setPasskeyError("");
    const { error } = await supabase.auth.registerPasskey();
    if (error) {
      setPasskeyStatus("error");
      setPasskeyError(error.message);
      return;
    }
    setPasskeyStatus("idle");
    loadPasskeys();
  }

  async function handleDeletePasskey(passkeyId: string) {
    await supabase.auth.passkey.delete({ passkeyId });
    loadPasskeys();
  }

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
      loadPasskeys();
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    // Only these fields are ever player-editable. First/last name and
    // the manager's own rating are never touched here -- the manager's
    // rating is only ever set on the Roster page, and is intentionally
    // never shown back to the player.
    const { error } = await supabase
      .from("players")
      .update({
        email: player.email,
        phone: player.phone,
        address: player.address,
        city: player.city,
        state: player.state,
        zip: player.zip,
        days_per_week: player.days_per_week,
        days_in_a_row: player.days_in_a_row,
        self_reported_ranking: player.self_reported_ranking,
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
      <p className="text-xs text-stone-400">
        Name changes aren't self-service -- contact the manager if this needs fixing.
      </p>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          Street address
          <input className="input mt-1 w-full" value={player.address ?? ""}
            onChange={(e) => setPlayer({ ...player, address: e.target.value })} />
        </label>
        <label className="block text-sm font-medium">
          City
          <input className="input mt-1 w-full" value={player.city ?? ""}
            onChange={(e) => setPlayer({ ...player, city: e.target.value })} />
        </label>
        <label className="block text-sm font-medium">
          State
          <input className="input mt-1 w-full" value={player.state ?? ""}
            onChange={(e) => setPlayer({ ...player, state: e.target.value })} />
        </label>
        <label className="block text-sm font-medium">
          Zip
          <input className="input mt-1 w-full" value={player.zip ?? ""}
            onChange={(e) => setPlayer({ ...player, zip: e.target.value })} />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Email
        <input type="email" className="input mt-1 w-full" value={player.email ?? ""}
          onChange={(e) => setPlayer({ ...player, email: e.target.value })} />
      </label>

      <label className="block text-sm font-medium">
        Phone
        <input className="input mt-1 w-full" value={player.phone ?? ""}
          onChange={(e) => setPlayer({ ...player, phone: e.target.value })} />
        {player.phone && <p className="text-xs text-stone-500 mt-1">Formatted: {formatPhone(player.phone)}</p>}
      </label>

      <label className="block text-sm font-medium">
        Your self-rated ranking (a manager sets your official rating separately)
        <select className="input mt-1 w-full" value={player.self_reported_ranking ?? ""}
          onChange={(e) => setPlayer({ ...player, self_reported_ranking: e.target.value })}>
          <option value="">Not set</option>
          {RANKING_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <label className="block text-sm font-medium">
        Comments
        <textarea placeholder="Anything else you want to say?" className="input mt-1 w-full" rows={3}
          value={player.notes ?? ""} onChange={(e) => setPlayer({ ...player, notes: e.target.value })} />
      </label>

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

      {passkeySupported && (
        <div className="space-y-3 rounded-md border border-court-green/30 bg-court-green/5 p-4">
          <div>
            <p className="font-medium">🔒 Faster login</p>
            <p className="text-sm text-stone-600">
              Set up a passkey so you can log in on this device with Face ID, fingerprint, or your
              device PIN instead of waiting on an email link every time. Passkeys are per-device --
              you'll need to set one up separately on each phone or computer you use.
            </p>
          </div>

          {passkeys.length > 0 && (
            <ul className="space-y-1 text-sm">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between rounded border border-stone-200 bg-white px-3 py-2">
                  <span>{pk.friendly_name || "Passkey"}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={handleRegisterPasskey}
            disabled={passkeyStatus === "registering"}
            className="rounded-md bg-court-green px-4 py-2 text-sm text-white hover:bg-court-green/90 disabled:opacity-50"
          >
            {passkeyStatus === "registering" ? "Follow your device's prompt..." : "Set up Passkey on this device"}
          </button>
          {passkeyStatus === "error" && (
            <p className="text-sm text-red-600">{passkeyError || "Couldn't set that up -- try again."}</p>
          )}
        </div>
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
