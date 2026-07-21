"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useMyAccess } from "@/lib/useMyAccess";
import { hasPermission } from "@/lib/permissions";

// ------------------------------------------------------------
// Small reusable "Actions" dropdown -- avoids pulling in a menu
// library just for a handful of per-row actions (edit / move /
// default / clone / delete).
// ------------------------------------------------------------
type MenuAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

function ActionsMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
      >
        Actions <span className="text-stone-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border bg-white shadow-lg">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 ${
                a.danger ? "text-red-600" : "text-stone-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const supabase = createClient();
  const access = useMyAccess();
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRetiredCourts, setShowRetiredCourts] = useState(false);
  const [showRetiredTimeSlots, setShowRetiredTimeSlots] = useState(false);

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
    const { data: courtRows } = await supabase.from("courts").select("*").order("sort_order").order("name");
    setCourts(courtRows ?? []);
    const { data: timeSlotRows } = await supabase.from("time_slots").select("*").order("sort_order").order("name");
    setTimeSlots(timeSlotRows ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("*").single();
    setSettings(settingsRow);
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("status", "active")
      .order("first_name");
    setPlayers(playerRows ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const activeCourts = courts.filter((c) => c.is_active);
  const retiredCourts = courts.filter((c) => !c.is_active);
  const activeTimeSlots = timeSlots.filter((t) => t.is_active);
  const retiredTimeSlots = timeSlots.filter((t) => !t.is_active);

  // --------------------------------------------------------
  // Club-wide settings (timeout / nudge only -- default court
  // and default time slot now live on the court/time-slot rows
  // themselves, see is_default handling below).
  // --------------------------------------------------------
  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const { error } = await supabase
      .from("club_settings")
      .update({
        default_timeout_hours: settings.default_timeout_hours || 24,
        nudge_frequency_hours: settings.nudge_frequency_hours || 12,
        self_serve_window_days: settings.self_serve_window_days ?? 3,
        self_serve_response_hours: settings.self_serve_response_hours ?? 1,
        sandbox_mode: settings.sandbox_mode ?? true,
        sandbox_email: settings.sandbox_email || "",
        allow_match_delete: settings.allow_match_delete ?? true,
        email_test_mode_send_to_first_only: settings.email_test_mode_send_to_first_only ?? false,
        push_test_mode: settings.push_test_mode ?? false,
        push_test_player_id: settings.push_test_player_id || null,
      })
      .eq("id", true);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setSaved(true);
    }
  }

  // --------------------------------------------------------
  // Courts
  // --------------------------------------------------------
  async function addCourt() {
    if (!courtName.trim()) return;
    const maxSort = courts.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    await supabase.from("courts").insert({
      name: courtName.trim(),
      address: courtAddress.trim() || null,
      sort_order: maxSort + 10,
      is_default: courts.length === 0, // first court ever added becomes default automatically
      is_active: true,
    });
    closeCourtModal();
    load();
  }

  async function updateCourt() {
    if (!editingCourt || !courtName.trim()) return;
    await supabase
      .from("courts")
      .update({ name: courtName.trim(), address: courtAddress.trim() || null })
      .eq("id", editingCourt.id);
    closeCourtModal();
    load();
  }

  async function cloneCourt(court: any) {
    const maxSort = courts.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    await supabase.from("courts").insert({
      name: `${court.name} (Copy)`,
      address: court.address ?? null,
      sort_order: maxSort + 10,
      is_default: false,
      is_active: true,
    });
    load();
  }

  async function deleteCourt(court: any) {
    if (
      !confirm(
        `Retire "${court.name}"? It will disappear from the match matrix and auto-scheduling, but stays attached to any past matches. You can restore it later from "Show retired courts".`
      )
    )
      return;
    await supabase.from("courts").update({ is_active: false, is_default: false }).eq("id", court.id);
    // If we just retired the default court, hand the default to
    // whichever active court now sorts first, so the match matrix
    // and generator never end up with no default at all.
    if (court.is_default) {
      const nextDefault = courts
        .filter((c) => c.is_active && c.id !== court.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
      if (nextDefault) await supabase.from("courts").update({ is_default: true }).eq("id", nextDefault.id);
    }
    load();
  }

  async function restoreCourt(court: any) {
    const hasDefault = courts.some((c) => c.is_active && c.is_default);
    await supabase
      .from("courts")
      .update({ is_active: true, is_default: !hasDefault })
      .eq("id", court.id);
    load();
  }

  async function setDefaultCourt(courtId: string) {
    await supabase.from("courts").update({ is_default: false }).neq("id", courtId);
    await supabase.from("courts").update({ is_default: true }).eq("id", courtId);
    load();
  }

  async function moveCourt(court: any, direction: -1 | 1) {
    const ordered = activeCourts.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = ordered.findIndex((c) => c.id === court.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const other = ordered[swapIdx];
    await supabase.from("courts").update({ sort_order: other.sort_order }).eq("id", court.id);
    await supabase.from("courts").update({ sort_order: court.sort_order }).eq("id", other.id);
    load();
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

  // --------------------------------------------------------
  // Time slots
  // --------------------------------------------------------
  async function addTimeSlot() {
    if (!timeSlotName.trim() || !timeSlotDesc.trim()) return;
    const maxSort = timeSlots.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
    await supabase.from("time_slots").insert({
      name: timeSlotName.trim(),
      description: timeSlotDesc.trim(),
      sort_order: maxSort + 10,
      is_default: timeSlots.length === 0,
      is_active: true,
    });
    closeTimeSlotModal();
    load();
  }

  async function updateTimeSlot() {
    if (!editingTimeSlot || !timeSlotName.trim() || !timeSlotDesc.trim()) return;
    await supabase
      .from("time_slots")
      .update({ name: timeSlotName.trim(), description: timeSlotDesc.trim() })
      .eq("id", editingTimeSlot.id);
    closeTimeSlotModal();
    load();
  }

  async function cloneTimeSlot(slot: any) {
    const maxSort = timeSlots.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
    await supabase.from("time_slots").insert({
      name: `${slot.name} (Copy)`,
      description: slot.description,
      sort_order: maxSort + 10,
      is_default: false,
      is_active: true,
    });
    load();
  }

  async function deleteTimeSlot(slot: any) {
    if (
      !confirm(
        `Retire "${slot.name}"? It will disappear from the match matrix and auto-scheduling, but stays attached to any past matches. You can restore it later from "Show retired time slots".`
      )
    )
      return;
    await supabase.from("time_slots").update({ is_active: false, is_default: false }).eq("id", slot.id);
    if (slot.is_default) {
      const nextDefault = timeSlots
        .filter((t) => t.is_active && t.id !== slot.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
      if (nextDefault) await supabase.from("time_slots").update({ is_default: true }).eq("id", nextDefault.id);
    }
    load();
  }

  async function restoreTimeSlot(slot: any) {
    const hasDefault = timeSlots.some((t) => t.is_active && t.is_default);
    await supabase
      .from("time_slots")
      .update({ is_active: true, is_default: !hasDefault })
      .eq("id", slot.id);
    load();
  }

  async function setDefaultTimeSlot(slotId: string) {
    await supabase.from("time_slots").update({ is_default: false }).neq("id", slotId);
    await supabase.from("time_slots").update({ is_default: true }).eq("id", slotId);
    load();
  }

  async function moveTimeSlot(slot: any, direction: -1 | 1) {
    const ordered = activeTimeSlots.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = ordered.findIndex((t) => t.id === slot.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const other = ordered[swapIdx];
    await supabase.from("time_slots").update({ sort_order: other.sort_order }).eq("id", slot.id);
    await supabase.from("time_slots").update({ sort_order: slot.sort_order }).eq("id", other.id);
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

  const sortedActiveCourts = activeCourts.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sortedActiveTimeSlots = activeTimeSlots.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-xl font-bold">Manager Settings</h1>

      {/* Court Management */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Court Locations</h2>
            <p className="text-xs text-stone-500">
              The default court is used automatically by the match matrix and auto-scheduler. Reorder with the
              Actions menu to control which court gets assigned first.
            </p>
          </div>
          <button
            onClick={() => openCourtModal()}
            disabled={!hasPermission(access, "settings_add_court")}
            className="shrink-0 rounded-md bg-court-green px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            + Add Court
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedActiveCourts.map((c, i) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 text-stone-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-stone-500">{c.address || "—"}</td>
                  <td className="px-4 py-2">
                    {c.is_default ? (
                      <span className="font-medium text-court-green">✓ Default</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <ActionsMenu
                      actions={[
                        { label: "Edit", onClick: () => openCourtModal(c), disabled: !hasPermission(access, "settings_edit_court") },
                        { label: "Move up", onClick: () => moveCourt(c, -1), disabled: i === 0 || !hasPermission(access, "settings_edit_court") },
                        { label: "Move down", onClick: () => moveCourt(c, 1), disabled: i === sortedActiveCourts.length - 1 || !hasPermission(access, "settings_edit_court") },
                        { label: c.is_default ? "Default ✓" : "Set as default", onClick: () => setDefaultCourt(c.id), disabled: c.is_default || !hasPermission(access, "settings_change_default_court") },
                        { label: "Clone", onClick: () => cloneCourt(c), disabled: !hasPermission(access, "settings_add_court") },
                        { label: "Delete", onClick: () => deleteCourt(c), danger: true, disabled: !hasPermission(access, "settings_delete_court") },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {sortedActiveCourts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-stone-400">
                    No courts added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {retiredCourts.length > 0 && (
          <div className="text-sm">
            <button
              className="text-stone-500 underline"
              onClick={() => setShowRetiredCourts((v) => !v)}
            >
              {showRetiredCourts ? "Hide" : "Show"} retired courts ({retiredCourts.length})
            </button>
            {showRetiredCourts && (
              <div className="mt-2 overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {retiredCourts.map((c) => (
                      <tr key={c.id} className="border-t text-stone-400">
                        <td className="px-4 py-2">{c.name}</td>
                        <td className="px-4 py-2">{c.address || "—"}</td>
                        <td className="px-4 py-2">
                          <button onClick={() => restoreCourt(c)} className="text-court-green underline">
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Time Slot Management */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Match Times</h2>
            <p className="text-xs text-stone-500">
              The default time is shown automatically for any match the manager hasn't overridden. Reorder with the
              Actions menu to control display order in dropdowns.
            </p>
          </div>
          <button
            onClick={() => openTimeSlotModal()}
            disabled={!hasPermission(access, "settings_add_time")}
            className="shrink-0 rounded-md bg-court-green px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            + Add Time Slot
          </button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Default</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedActiveTimeSlots.map((ts, i) => (
                <tr key={ts.id} className="border-t">
                  <td className="px-4 py-2 text-stone-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{ts.name}</td>
                  <td className="px-4 py-2 text-stone-500">{ts.description}</td>
                  <td className="px-4 py-2">
                    {ts.is_default ? (
                      <span className="font-medium text-court-green">✓ Default</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <ActionsMenu
                      actions={[
                        { label: "Edit", onClick: () => openTimeSlotModal(ts), disabled: !hasPermission(access, "settings_edit_time") },
                        { label: "Move up", onClick: () => moveTimeSlot(ts, -1), disabled: i === 0 || !hasPermission(access, "settings_edit_time") },
                        { label: "Move down", onClick: () => moveTimeSlot(ts, 1), disabled: i === sortedActiveTimeSlots.length - 1 || !hasPermission(access, "settings_edit_time") },
                        { label: ts.is_default ? "Default ✓" : "Set as default", onClick: () => setDefaultTimeSlot(ts.id), disabled: ts.is_default || !hasPermission(access, "settings_change_default_time") },
                        { label: "Clone", onClick: () => cloneTimeSlot(ts), disabled: !hasPermission(access, "settings_add_time") },
                        { label: "Delete", onClick: () => deleteTimeSlot(ts), danger: true, disabled: !hasPermission(access, "settings_delete_time") },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {sortedActiveTimeSlots.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-stone-400">
                    No time slots added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {retiredTimeSlots.length > 0 && (
          <div className="text-sm">
            <button
              className="text-stone-500 underline"
              onClick={() => setShowRetiredTimeSlots((v) => !v)}
            >
              {showRetiredTimeSlots ? "Hide" : "Show"} retired time slots ({retiredTimeSlots.length})
            </button>
            {showRetiredTimeSlots && (
              <div className="mt-2 overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {retiredTimeSlots.map((ts) => (
                      <tr key={ts.id} className="border-t text-stone-400">
                        <td className="px-4 py-2">{ts.name}</td>
                        <td className="px-4 py-2">{ts.description}</td>
                        <td className="px-4 py-2">
                          <button onClick={() => restoreTimeSlot(ts)} className="text-court-green underline">
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Match Timeout */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Match Timeout</h2>
        <label className="block text-sm font-medium">
          Default timeout for proposed matches (hours)
          <input
            type="number"
            disabled={access.role !== "manager"}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.default_timeout_hours ?? 24}
            onChange={(e) => setSettings({ ...settings, default_timeout_hours: parseInt(e.target.value) || 24 })}
            min="1"
          />
        </label>
      </div>

      {/* Self-Serve Matches */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Self-Serve Matches</h2>
        <p className="text-xs text-stone-500">
          How close to a date opted-in players can build and propose their own match for a day they're
          available but not yet assigned. Players are opted in individually on the Roster page.
        </p>
        <label className="block text-sm font-medium">
          Open self-serve this many days before the match date
          <input
            type="number"
            disabled={!hasPermission(access, "settings_change_self_serve_window")}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.self_serve_window_days ?? 3}
            onChange={(e) => setSettings({ ...settings, self_serve_window_days: parseInt(e.target.value) || 0 })}
            min="0"
          />
        </label>
        <label className="block text-sm font-medium">
          Hours to wait for available players before inviting everyone else
          <input
            type="number"
            disabled={!hasPermission(access, "settings_change_self_serve_window")}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.self_serve_response_hours ?? 1}
            onChange={(e) => setSettings({ ...settings, self_serve_response_hours: parseInt(e.target.value) || 1 })}
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
            disabled={access.role !== "manager"}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.nudge_frequency_hours ?? 12}
            onChange={(e) => setSettings({ ...settings, nudge_frequency_hours: parseInt(e.target.value) || 12 })}
            min="1"
          />
        </label>
      </div>

      {/* Email Test Mode */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Email Test Mode</h2>
        <p className="text-xs text-stone-500">
          While on, every email the system sends (match proposals, nudges, cancellations, access
          links) gets rerouted to the single address below instead of the real player -- so you can
          test the whole system without emailing real members. Manager-only, on purpose: this is
          the one setting where forgetting to flip it back is the most likely to cause real harm.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={access.role !== "manager"}
            checked={settings.sandbox_mode ?? true}
            onChange={(e) => setSettings({ ...settings, sandbox_mode: e.target.checked })}
          />
          System is in test mode (reroute all email)
        </label>
        <label className="block text-sm font-medium">
          Send all test-mode email to
          <input
            type="email"
            disabled={access.role !== "manager"}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.sandbox_email ?? ""}
            onChange={(e) => setSettings({ ...settings, sandbox_email: e.target.value })}
            placeholder="you@example.com"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={access.role !== "manager"}
            checked={settings.email_test_mode_send_to_first_only ?? false}
            onChange={(e) => setSettings({ ...settings, email_test_mode_send_to_first_only: e.target.checked })}
          />
          Send only to first person in match (no others)
        </label>
        <p className="text-xs text-stone-500">
          When checked, only the first person in a match receives the email. All other players in the match do not get emails.
        </p>
      </div>

      {/* Push Test Mode */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Push Test Mode</h2>
        <p className="text-xs text-stone-500">
          While on, every push notification (match proposals, nudges, cancellations, confirmations)
          gets rerouted to the one player's devices picked below, instead of the real player's --
          so you can test the phone alerts end to end without spamming everyone else's devices. The
          notification title is prefixed to show who it was really for. Manager-only.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={access.role !== "manager"}
            checked={settings.push_test_mode ?? false}
            onChange={(e) => setSettings({ ...settings, push_test_mode: e.target.checked })}
          />
          Send all push notifications to one player for testing
        </label>
        <label className="block text-sm font-medium">
          Send all test-mode push notifications to
          <select
            disabled={access.role !== "manager"}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 disabled:bg-stone-100 disabled:text-stone-400"
            value={settings.push_test_player_id ?? ""}
            onChange={(e) => setSettings({ ...settings, push_test_player_id: e.target.value || null })}
          >
            <option value="">Select a player...</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
        {(settings.push_test_mode ?? false) && !settings.push_test_player_id && (
          <p className="text-xs text-red-700">
            Pick a player above -- push test mode is on, but with no player selected no test pushes
            will actually go out.
          </p>
        )}
        <p className="text-xs text-stone-500">
          That player needs to have turned on push notifications for their own device (on the
          Notifications page) to actually receive the test alerts.
        </p>
      </div>

      {/* Matches Page Delete Button */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Matches Page Delete Button</h2>
        <p className="text-xs text-stone-500">
          Controls whether the permanent "Delete" button (for clearing out test/junk matches) shows
          up on the Matches page at all. Turning this off doesn't undo anything already deleted --
          it just hides the button so it can't be clicked by accident during normal day-to-day use.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            disabled={access.role !== "manager"}
            checked={settings.allow_match_delete ?? true}
            onChange={(e) => setSettings({ ...settings, allow_match_delete: e.target.checked })}
          />
          Show the Delete button on the Matches page
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
      {saveError && <p className="text-sm text-red-700">Couldn't save: {saveError}</p>}

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
