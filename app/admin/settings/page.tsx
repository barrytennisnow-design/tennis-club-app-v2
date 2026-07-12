"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Item = { id: string; sort_order: number; name?: string; label?: string };

export default function SettingsPage() {
  const supabase = createClient();
  const [courts, setCourts] = useState<Item[]>([]);
  const [timePresets, setTimePresets] = useState<Item[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [newCourtName, setNewCourtName] = useState("");
  const [newTimeLabel, setNewTimeLabel] = useState("");
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1500);
  }

  async function load() {
    const { data: courtRows } = await supabase.from("courts").select("*").order("sort_order");
    setCourts(courtRows ?? []);
    const { data: timeRows } = await supabase.from("time_presets").select("*").order("sort_order");
    setTimePresets(timeRows ?? []);
    const { data: settingsRow } = await supabase.from("club_settings").select("*").single();
    setSettings(settingsRow);
  }

  useEffect(() => {
    load();
  }, []);

  // --- Courts ---
  async function addCourt() {
    if (!newCourtName.trim()) return;
    const maxOrder = courts.reduce((max, c) => Math.max(max, c.sort_order), 0);
    await supabase.from("courts").insert({ name: newCourtName.trim(), sort_order: maxOrder + 1 });
    setNewCourtName("");
    flash("Court added");
    load();
  }
  async function renameCourt(id: string, name: string) {
    await supabase.from("courts").update({ name }).eq("id", id);
    flash("Saved");
    load();
  }
  async function deleteCourt(id: string, name?: string) {
    if (!confirm(`Delete "${name}"? Any draft matches using it will show "Court TBD".`)) return;
    await supabase.from("courts").delete().eq("id", id);
    if (settings?.default_court_id === id) {
      await supabase.from("club_settings").update({ default_court_id: null }).eq("id", true);
    }
    flash("Deleted");
    load();
  }
  async function moveCourt(id: string, direction: -1 | 1) {
    const idx = courts.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= courts.length) return;
    const a = courts[idx], b = courts[swapIdx];
    await supabase.from("courts").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("courts").update({ sort_order: a.sort_order }).eq("id", b.id);
    load();
  }
  async function setDefaultCourt(id: string) {
    await supabase.from("club_settings").update({ default_court_id: id }).eq("id", true);
    flash("Default court updated");
    load();
  }

  // --- Time presets ---
  async function addTimePreset() {
    if (!newTimeLabel.trim()) return;
    const maxOrder = timePresets.reduce((max, t) => Math.max(max, t.sort_order), 0);
    await supabase.from("time_presets").insert({ label: newTimeLabel.trim(), sort_order: maxOrder + 1 });
    setNewTimeLabel("");
    flash("Time option added");
    load();
  }
  async function renameTimePreset(id: string, label: string) {
    await supabase.from("time_presets").update({ label }).eq("id", id);
    flash("Saved");
    load();
  }
  async function deleteTimePreset(id: string, label?: string) {
    if (!confirm(`Delete "${label}"?`)) return;
    await supabase.from("time_presets").delete().eq("id", id);
    if (settings?.default_time_display === label) {
      await supabase.from("club_settings").update({ default_time_display: "" }).eq("id", true);
    }
    flash("Deleted");
    load();
  }
  async function moveTimePreset(id: string, direction: -1 | 1) {
    const idx = timePresets.findIndex((t) => t.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= timePresets.length) return;
    const a = timePresets[idx], b = timePresets[swapIdx];
    await supabase.from("time_presets").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("time_presets").update({ sort_order: a.sort_order }).eq("id", b.id);
    load();
  }
  async function setDefaultTime(label: string) {
    await supabase.from("club_settings").update({ default_time_display: label }).eq("id", true);
    flash("Default time updated");
    load();
  }

  if (!settings) return <p className="text-stone-400">Loading settings...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Manager Settings</h1>
        {savedFlash && (
          <span className="animate-pulse rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            ✓ {savedFlash}
          </span>
        )}
      </div>

      <SettingsCard
        title="Courts"
        description="These are the courts available for matches. Drag order with the arrows, pick which one is the default for new draft matches, rename or remove any of them."
      >
        {courts.length === 0 && <EmptyRow text="No courts yet — add your first one below." />}
        {courts.map((c, i) => (
          <ManagedRow
            key={c.id}
            value={c.name ?? ""}
            isDefault={settings.default_court_id === c.id}
            isFirst={i === 0}
            isLast={i === courts.length - 1}
            onMoveUp={() => moveCourt(c.id, -1)}
            onMoveDown={() => moveCourt(c.id, 1)}
            onRename={(v) => renameCourt(c.id, v)}
            onSetDefault={() => setDefaultCourt(c.id)}
            onDelete={() => deleteCourt(c.id, c.name)}
          />
        ))}
        <AddRow
          placeholder="New court name, e.g. Langford 3"
          value={newCourtName}
          onChange={setNewCourtName}
          onAdd={addCourt}
          buttonLabel="Add court"
        />
      </SettingsCard>

      <SettingsCard
        title="Match Times"
        description="These are the time options managers can pick when scheduling a match. Set one as the club's default."
      >
        {timePresets.length === 0 && <EmptyRow text="No time options yet — add your first one below." />}
        {timePresets.map((t, i) => (
          <ManagedRow
            key={t.id}
            value={t.label ?? ""}
            isDefault={settings.default_time_display === t.label}
            isFirst={i === 0}
            isLast={i === timePresets.length - 1}
            onMoveUp={() => moveTimePreset(t.id, -1)}
            onMoveDown={() => moveTimePreset(t.id, 1)}
            onRename={(v) => renameTimePreset(t.id, v)}
            onSetDefault={() => setDefaultTime(t.label!)}
            onDelete={() => deleteTimePreset(t.id, t.label)}
          />
        ))}
        <AddRow
          placeholder="e.g. 6:00am warmup, 6:15am start play"
          value={newTimeLabel}
          onChange={setNewTimeLabel}
          onAdd={addTimePreset}
          buttonLabel="Add time"
        />
      </SettingsCard>
    </div>
  );
}

// ---------- Reusable pieces ----------

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
      <p className="mt-0.5 mb-4 text-sm text-stone-500">{description}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-lg bg-stone-50 px-3 py-4 text-center text-sm text-stone-400">{text}</p>;
}

function ManagedRow({
  value, isDefault, isFirst, isLast, onMoveUp, onMoveDown, onRename, onSetDefault, onDelete,
}: {
  value: string;
  isDefault: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (v: string) => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${isDefault ? "border-court-green bg-court-green/5" : "border-stone-200 bg-white"}`}>
      <div className="flex flex-col">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex h-4 w-5 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-20"
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="flex h-4 w-5 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-20"
          aria-label="Move down"
        >
          ▼
        </button>
      </div>

      <input
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-stone-800 hover:border-stone-200 focus:border-stone-300 focus:bg-white focus:outline-none"
        defaultValue={value}
        onBlur={(e) => e.target.value.trim() && e.target.value !== value && onRename(e.target.value.trim())}
      />

      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-stone-500">
        <input
          type="radio"
          checked={isDefault}
          onChange={onSetDefault}
          className="h-3.5 w-3.5 accent-court-green"
        />
        Default
      </label>

      <button
        onClick={onDelete}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600"
        aria-label="Delete"
      >
        Remove
      </button>
    </div>
  );
}

function AddRow({
  placeholder, value, onChange, onAdd, buttonLabel,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  buttonLabel: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <input
        className="flex-1 rounded-md border border-dashed border-stone-300 px-3 py-2 text-sm placeholder:text-stone-400 focus:border-solid focus:border-court-green focus:outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
      />
      <button
        onClick={onAdd}
        className="shrink-0 rounded-md bg-court-green px-4 py-2 text-sm font-medium text-white hover:bg-court-green/90"
      >
        + {buttonLabel}
      </button>
    </div>
  );
}
