"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const supabase = createClient();
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
<<<<<<< HEAD
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Modal states
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [showTimeSlotModal, setShowTimeSlotModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<any>(null);
  const [editingTimeSlot, setEditingTimeSlot] = useState<any>(null);
  
  // Form states
  const [courtName, setCourtName] = useState("");
  const [courtAddress, setCourtAddress] = useState("");
  const [timeSlotName, setTimeSlotName] = useState("");
  const [timeSlotDesc, setTimeSlotDesc] = useState("");

  async function load() {
=======
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
>>>>>>> 26503340298a3c9481470710dae500ba14fdd7d3
    const { data: courtRows } = await supabase.from("courts").select("*").order("name");
    setCourts(courtRows ?? []);
    const { data: timeSlotRows } = await supabase.from("time_slots").select("*").order("name");
    setTimeSlots(timeSlotRows ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("*").single();
    setSettings(settingsRow);
<<<<<<< HEAD
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
    if (!courtName.trim()) return;
    await supabase.from("courts").insert({ name: courtName.trim(), address: courtAddress.trim() || null });
    setCourtName("");
    setCourtAddress("");
    setShowCourtModal(false);
    load();
  }

  async function updateCourt() {
    if (!editingCourt || !courtName.trim()) return;
    await supabase.from("courts").update({ name: courtName.trim(), address: courtAddress.trim() || null }).eq("id", editingCourt.id);
    setCourtName("");
    setCourtAddress("");
    setEditingCourt(null);
    setShowCourtModal(false);
    load();
  }

  async function deleteCourt(courtId: string) {
    if (confirm("Are you sure you want to delete this court?")) {
      await supabase.from("courts").delete().eq("id", courtId);
=======
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
>>>>>>> 26503340298a3c9481470710dae500ba14fdd7d3
      load();
    }
  }

<<<<<<< HEAD
  async function setDefaultCourt(courtId: string) {
    setSettings({ ...settings, default_court_id: courtId });
    await save();
  }

  function openCourtModal(court?: any) {
    if (court) {
      setEditingCourt(court);
      setCourtName(court.name);
      setCourtAddress(court.address || "");
    } else {
      setEditingCourt(null);
      setCourtName("");
      setCourtAddress("");
    }
    setShowCourtModal(true);
  }

  function closeCourtModal() {
    setShowCourtModal(false);
    setEditingCourt(null);
    setCourtName("");
    setCourtAddress("");
  }

  async function addTimeSlot() {
    if (!timeSlotName.trim() || !timeSlotDesc.trim()) return;
    await supabase.from("time_slots").insert({ name: timeSlotName.trim(), description: timeSlotDesc.trim(), is_default: false });
    setTimeSlotName("");
    setTimeSlotDesc("");
    setShowTimeSlotModal(false);
    load();
  }

  async function updateTimeSlot() {
    if (!editingTimeSlot || !timeSlotName.trim() || !timeSlotDesc.trim()) return;
    await supabase.from("time_slots").update({ name: timeSlotName.trim(), description: timeSlotDesc.trim() }).eq("id", editingTimeSlot.id);
    setTimeSlotName("");
    setTimeSlotDesc("");
    setEditingTimeSlot(null);
    setShowTimeSlotModal(false);
    load();
  }

  async function deleteTimeSlot(slotId: string) {
    if (confirm("Are you sure you want to delete this time slot?")) {
      await supabase.from("time_slots").delete().eq("id", slotId);
      load();
    }
  }

  async function setDefaultTimeSlot(slotId: string) {
    // First, unset all defaults
    await supabase.from("time_slots").update({ is_default: false }).neq("id", slotId);
    // Then set the new default
    await supabase.from("time_slots").update({ is_default: true }).eq("id", slotId);
    setSettings({ ...settings, default_time_slot_id: slotId });
    load();
  }

  function openTimeSlotModal(slot?: any) {
    if (slot) {
      setEditingTimeSlot(slot);
      setTimeSlotName(slot.name);
      setTimeSlotDesc(slot.description);
    } else {
      setEditingTimeSlot(null);
      setTimeSlotName("");
      setTimeSlotDesc("");
    }
    setShowTimeSlotModal(true);
  }

  function closeTimeSlotModal() {
    setShowTimeSlotModal(false);
    setEditingTimeSlot(null);
    setTimeSlotName("");
    setTimeSlotDesc("");
  }

  if (!settings) return <p>Loading...</p>;

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-xl font-bold">Manager Settings</h1>

      {/* Court Management */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Court Locations</h2>
          <button onClick={() => openCourtModal()} className="rounded-md bg-court-green px-3 py-1 text-sm text-white">
            + Add Court
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courts.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-stone-500">{c.address || "—"}</td>
                  <td className="px-4 py-2">
                    {settings.default_court_id === c.id ? (
                      <span className="text-court-green font-medium">✓ Default</span>
                    ) : (
                      <button onClick={() => setDefaultCourt(c.id)} className="text-court-green underline">
                        Set Default
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openCourtModal(c)} className="text-blue-600 underline">
                        Edit
                      </button>
                      <button onClick={() => deleteCourt(c.id)} className="text-red-600 underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {courts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-stone-400">No courts added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time Slot Management */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Time Slots</h2>
          <button onClick={() => openTimeSlotModal()} className="rounded-md bg-court-green px-3 py-1 text-sm text-white">
            + Add Time Slot
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((ts) => (
                <tr key={ts.id} className="border-t">
                  <td className="px-4 py-2">{ts.name}</td>
                  <td className="px-4 py-2 text-stone-500">{ts.description}</td>
                  <td className="px-4 py-2">
                    {ts.is_default ? (
                      <span className="text-court-green font-medium">✓ Default</span>
                    ) : (
                      <button onClick={() => setDefaultTimeSlot(ts.id)} className="text-court-green underline">
                        Set Default
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openTimeSlotModal(ts)} className="text-blue-600 underline">
                        Edit
                      </button>
                      <button onClick={() => deleteTimeSlot(ts.id)} className="text-red-600 underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {timeSlots.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-stone-400">No time slots added yet.</td></tr>
              )}
            </tbody>
          </table>
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

      {/* Court Modal */}
      {showCourtModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">{editingCourt ? "Edit Court" : "Add Court"}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Court Name</label>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                  value={courtName}
                  onChange={(e) => setCourtName(e.target.value)}
                  placeholder="e.g., Eagle Marsh 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Address (optional)</label>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                  value={courtAddress}
                  onChange={(e) => setCourtAddress(e.target.value)}
                  placeholder="e.g., 123 Main St"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={closeCourtModal} className="rounded-md border border-stone-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={editingCourt ? updateCourt : addCourt}
                className="rounded-md bg-court-green px-4 py-2 text-sm text-white"
              >
                {editingCourt ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Slot Modal */}
      {showTimeSlotModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold">{editingTimeSlot ? "Edit Time Slot" : "Add Time Slot"}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Slot Name</label>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                  value={timeSlotName}
                  onChange={(e) => setTimeSlotName(e.target.value)}
                  placeholder="e.g., morning"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Description</label>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                  value={timeSlotDesc}
                  onChange={(e) => setTimeSlotDesc(e.target.value)}
                  placeholder="e.g., 8:00am warmup, 8:15am start play"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={closeTimeSlotModal} className="rounded-md border border-stone-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={editingTimeSlot ? updateTimeSlot : addTimeSlot}
                className="rounded-md bg-court-green px-4 py-2 text-sm text-white"
              >
                {editingTimeSlot ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
=======
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
>>>>>>> 26503340298a3c9481470710dae500ba14fdd7d3
