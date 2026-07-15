"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { PERMISSION_GROUPS, NUMERIC_PERMISSIONS } from "@/lib/permissions";

export default function PermissionsPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("players")
      .select("id, first_name, last_name, email, role, permissions, status")
      .eq("status", "active")
      .neq("role", "manager")
      .order("first_name")
      .order("last_name");
    setPlayers(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const selected = players.find((p) => p.id === selectedId) ?? null;

  async function setRole(id: string, role: string) {
    const patch: any = { role };
    if (role === "player") patch.permissions = {}; // clear grants when demoting
    await supabase.from("players").update(patch).eq("id", id);
    load();
  }

  async function togglePermission(key: string, value: boolean) {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    const nextPermissions = { ...(selected.permissions ?? {}), [key]: value };
    await supabase.from("players").update({ permissions: nextPermissions }).eq("id", selected.id);
    await load();
    setSaving(false);
    setSaved(true);
  }

  async function setNumericPermission(key: string, value: number) {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    const nextPermissions = { ...(selected.permissions ?? {}), [key]: value };
    await supabase.from("players").update({ permissions: nextPermissions }).eq("id", selected.id);
    await load();
    setSaving(false);
    setSaved(true);
  }

  const captains = players.filter((p) => p.role === "captain");
  const eligiblePlayers = players.filter((p) => p.role === "player");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Captain Permissions</h1>
        <p className="text-sm text-stone-500">
          Captains sit between player and manager -- they keep everything a player can already do,
          plus whatever specific actions below you grant them. Impersonation ("log in as") is never
          grantable here; it stays manager-only regardless of any other permission.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[240px_1fr]">
        {/* Left: pick or promote a captain */}
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-600">Captains</h2>
            {captains.length === 0 && <p className="text-xs text-stone-400">No captains yet.</p>}
            <div className="space-y-1">
              {captains.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedId === p.id ? "border-court-green bg-court-green/5 font-medium" : "border-stone-200"
                  }`}
                >
                  {p.first_name} {p.last_name}
                  <button
                    onClick={(e) => { e.stopPropagation(); setRole(p.id, "player"); if (selectedId === p.id) setSelectedId(null); }}
                    className="ml-2 text-xs text-red-500 underline"
                  >
                    demote
                  </button>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-stone-600">Promote a player to captain</h2>
            <select
              className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
              value=""
              onChange={(e) => { if (e.target.value) { setRole(e.target.value, "captain"); setSelectedId(e.target.value); } }}
            >
              <option value="">Select a player...</option>
              {eligiblePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: permission grid for the selected captain */}
        <div>
          {!selected && <p className="text-stone-400">Select a captain to edit their permissions.</p>}
          {selected && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{selected.first_name} {selected.last_name}</h2>
                {saving && <span className="text-xs text-stone-400">Saving...</span>}
                {!saving && saved && <span className="text-xs text-court-green">Saved</span>}
              </div>

              {PERMISSION_GROUPS.map((g) => (
                <div key={g.group} className="space-y-2">
                  <h3 className="text-sm font-semibold text-stone-600">{g.group}</h3>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {g.permissions.map((perm) => (
                      <label key={perm.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.permissions?.[perm.key] === true}
                          onChange={(e) => togglePermission(perm.key, e.target.checked)}
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                  {g.group === "Match Matrix" && (
                    <div className="mt-2 space-y-2 rounded-md bg-stone-50 p-3">
                      {NUMERIC_PERMISSIONS.map((np) => (
                        <label key={np.key} className="flex items-center justify-between gap-2 text-sm">
                          {np.label}
                          <input
                            type="number"
                            min="0"
                            className="w-20 rounded border border-stone-300 px-2 py-1 text-right"
                            value={typeof selected.permissions?.[np.key] === "number" ? selected.permissions[np.key] : 0}
                            onChange={(e) => setNumericPermission(np.key, parseInt(e.target.value) || 0)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
