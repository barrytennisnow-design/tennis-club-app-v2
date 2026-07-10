"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const supabase = createClient();
  const [courts, setCourts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("*").single();
    setSettings(settingsRow);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("club_settings")
      .update({
        default_court_id: settings.default_court_id || null,
        default_time_display: settings.default_time_display,
      })
      .eq("id", true);
    setSaving(false);
    setSaved(true);
  }

  if (!settings) return <p>Loading...</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-bold">Manager Settings</h1>

      <label className="block text-sm font-medium">
        Default court for new draft matches
        <select
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
          value={settings.default_court_id ?? ""}
          onChange={(e) => setSettings({ ...settings, default_court_id: e.target.value })}
        >
          <option value="">No default (rotate through all courts)</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Default time display (shown to players)
        <input
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
          value={settings.default_time_display}
          onChange={(e) => setSettings({ ...settings, default_time_display: e.target.value })}
          placeholder="8:00am warmup, 8:15am start play"
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-court-green px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
      {saved && <p className="text-sm text-green-700">Saved!</p>}
    </div>
  );
}
