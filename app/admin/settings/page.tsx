"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const supabase = createClient();
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);
    const { data: timeSlotRows } = await supabase.from("time_slots").select("*").order("name");
    setTimeSlots(timeSlotRows ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("*").single();
    setSettings(settingsRow);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateGlobalSetting(key: string, value: any) {
    const finalValue = value === "" ? null : value;
    const updated = { ...settings, [key]: finalValue };
    setSettings(updated);
    await supabase.from("club_settings").update({ [key]: finalValue }).eq("id", settings.id);
  }

  async function deleteItem(table: string, id: string) {
    if (confirm("Are you sure?")) {
      await supabase.from(table).delete().eq("id", id);
      load();
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className="max-w-4xl space-y-10 p-6">
      <h1 className="text-2xl font-bold">Manager Settings</h1>

      {/* Defaults Section */}
      <section className="rounded-lg border bg-stone-50 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Default Preferences</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Default Court
            <select 
              className="mt-1 w-full rounded border px-2 py-1"
              value={settings.default_court_id || ""}
              onChange={(e) => updateGlobalSetting("default_court_id", e.target.value)}
            >
              <option value="">Select a court...</option>
              {courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Default Time Display
            <select 
              className="mt-1 w-full rounded border px-2 py-1"
              value={settings.default_time_display || ""}
              onChange={(e) => updateGlobalSetting("default_time_display", e.target.value)}
            >
              <option value="">Select a time...</option>
              {timeSlots.map(ts => <option key={ts.id} value={ts.description}>{ts.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* Quick Maintenance List */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="font-semibold">Manage Courts</h2>
          <ul className="space-y-2">
            {courts.map(c => (
              <li key={c.id} className="flex justify-between items-center bg-white p-2 border rounded">
                <span>{c.name} <small className="text-stone-400">({c.address})</small></span>
                <button onClick={() => deleteItem("courts", c.id)} className="text-red-500 text-xs">Delete</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold">Manage Time Slots</h2>
          <ul className="space-y-2">
            {timeSlots.map(ts => (
              <li key={ts.id} className="flex justify-between items-center bg-white p-2 border rounded">
                <span>{ts.name} <small className="text-stone-400">{ts.description}</small></span>
                <button onClick={() => deleteItem("time_slots", ts.id)} className="text-red-500 text-xs">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}