"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const supabase = createClient();
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [newCourtAddress, setNewCourtAddress] = useState("");
  const [newTimeSlotName, setNewTimeSlotName] = useState("");
  const [newTimeSlotDesc, setNewTimeSlotDesc] = useState("");

  async function load() {
    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);
    const { data: timeSlotRows } = await supabase.from("time_slots").select("*").order("name");
    setTimeSlots(timeSlotRows ?? []);
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
        default_timeout_hours: settings.default_timeout_hours || 24,
        nudge_frequency_hours: settings.nudge_frequency_hours || 12,
      })
      .eq("id", true);
    setSaving(false);
    setSaved(true);
  }

  async function addCourt() {
    if (!newCourtName.trim()) return;
    await supabase.from("courts").insert({ name: newCourtName.trim(), address: newCourtAddress.trim() || null });
    setNewCourtName("");
    setNewCourtAddress("");
    load();
  }

  async function deleteCourt(courtId: string) {
    await supabase.from("courts").delete().eq("id", courtId);
    load();
  }

  async function setDefaultCourt(courtId: string) {
    setSettings({ ...settings, default_court_id: courtId });
  }

  async function addTimeSlot() {
    if (!newTimeSlotName.trim() || !newTimeSlotDesc.trim()) return;
    await supabase.from("time_slots").insert({ name: newTimeSlotName.trim(), description: newTimeSlotDesc.trim(), is_default: false });
    setNewTimeSlotName("");
    setNewTimeSlotDesc("");
    load();
  }

  async function deleteTimeSlot(slotId: string) {
    await supabase.from("time_slots").delete().eq("id", slotId);
    load();
  }

  async function setDefaultTimeSlot(slotId: string) {
    // First, unset all defaults
    await supabase.from("time_slots").update({ is_default: false }).neq("id", slotId);
    // Then set the new default
    await supabase.from("time_slots").update({ is_default: true }).eq("id", slotId);
    setSettings({ ...settings, default_time_slot_id: slotId });
    load();
  }

  if (!settings) return <p>Loading...</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold">Manager Settings</h1>

      {/* Court Management */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Court Locations</h2>
        <div className="space-y-2">
          {courts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{c.name}</p>
                {c.address && <p className="text-sm text-stone-500">{c.address}</p>}
                {settings.default_court_id === c.id && <span className="text-xs text-court-green">Default</span>}
              </div>
              <div className="flex gap-2">
                {settings.default_court_id !== c.id && (
                  <button onClick={() => setDefaultCourt(c.id)} className="text-sm text-court-green underline">
                    Set Default
                  </button>
                )}
                <button onClick={() => deleteCourt(c.id)} className="text-sm text-red-600 underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-stone-300 px-2 py-1"
            placeholder="Court name"
            value={newCourtName}
            onChange={(e) => setNewCourtName(e.target.value)}
          />
          <input
            className="flex-1 rounded border border-stone-300 px-2 py-1"
            placeholder="Address (optional)"
            value={newCourtAddress}
            onChange={(e) => setNewCourtAddress(e.target.value)}
          />
          <button onClick={addCourt} className="rounded-md bg-court-green px-3 py-1 text-sm text-white">
            Add
          </button>
        </div>
      </div>

      {/* Time Slot Management */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Time Slots</h2>
        <div className="space-y-2">
          {timeSlots.map((ts) => (
            <div key={ts.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{ts.name}</p>
                <p className="text-sm text-stone-500">{ts.description}</p>
                {ts.is_default && <span className="text-xs text-court-green">Default</span>}
              </div>
              <div className="flex gap-2">
                {!ts.is_default && (
                  <button onClick={() => setDefaultTimeSlot(ts.id)} className="text-sm text-court-green underline">
                    Set Default
                  </button>
                )}
                <button onClick={() => deleteTimeSlot(ts.id)} className="text-sm text-red-600 underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-stone-300 px-2 py-1"
            placeholder="Slot name (e.g., morning)"
            value={newTimeSlotName}
            onChange={(e) => setNewTimeSlotName(e.target.value)}
          />
          <input
            className="flex-1 rounded border border-stone-300 px-2 py-1"
            placeholder="Description (e.g., 8:00am warmup, 8:15am start play)"
            value={newTimeSlotDesc}
            onChange={(e) => setNewTimeSlotDesc(e.target.value)}
          />
          <button onClick={addTimeSlot} className="rounded-md bg-court-green px-3 py-1 text-sm text-white">
            Add
          </button>
        </div>
      </div>

      {/* Match Timeout */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Match Timeout</h2>
        <label className="block text-sm font-medium">
          Default timeout for proposed matches (hours)
          <input
            type="number"
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
            value={settings.default_timeout_hours ?? 24}
            onChange={(e) => setSettings({ ...settings, default_timeout_hours: parseInt(e.target.value) || 24 })}
            min="1"
          />
        </label>
      </div>

      {/* Nudge Frequency */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Nudge Frequency</h2>
        <label className="block text-sm font-medium">
          Send reminder nudge every X hours (after proposal)
          <input
            type="number"
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
            value={settings.nudge_frequency_hours ?? 12}
            onChange={(e) => setSettings({ ...settings, nudge_frequency_hours: parseInt(e.target.value) || 12 })}
            min="1"
          />
        </label>
      </div>

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
