"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDate } from "@/lib/formatDate";

const RANKING_OPTIONS = ["2.5","2.75","3.0","3.25","3.5","3.75","4.0","4.25","4.5"];
const STATUS_OPTIONS = ["pending", "active", "paused", "declined"];

// Every column available to show, in a sensible default order. Key
// must match a players table column (or a computed one, see render).
const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: "first_name", label: "First" },
  { key: "last_name", label: "Last" },
  { key: "status", label: "Status" },
  { key: "ranking", label: "Rating" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "days_per_week", label: "Days/wk" },
  { key: "days_in_a_row", label: "Days in a row" },
  { key: "days_usually_available", label: "Usually available" },
  { key: "role", label: "Role" },
  { key: "notes", label: "Notes" },
  { key: "created_at", label: "Signed up" },
  { key: "approved_at", label: "Approved" },
  { key: "actions", label: "Actions" },
];

const DEFAULT_ORDER = ALL_COLUMNS.map((c) => c.key);
const STORAGE_KEY = "roster_column_order_v1";

export default function RosterPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "pending" | "declined">("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_ORDER);
  const [showColumnEditor, setShowColumnEditor] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Guard against a stale saved order missing newly-added columns
        const merged = [...parsed.filter((k: string) => DEFAULT_ORDER.includes(k))];
        for (const k of DEFAULT_ORDER) if (!merged.includes(k)) merged.push(k);
        setColumnOrder(merged);
      } catch {}
    }
  }, []);

  function saveColumnOrder(order: string[]) {
    setColumnOrder(order);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }

  function moveColumn(key: string, direction: -1 | 1) {
    const idx = columnOrder.indexOf(key);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= columnOrder.length) return;
    const next = [...columnOrder];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    saveColumnOrder(next);
  }

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

  async function setRanking(id: string, ranking: string) {
    await supabase.from("players").update({ ranking: ranking ? Number(ranking) : null }).eq("id", id);
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

  const filtered = filter === "all" ? players : players.filter((p) => p.status === filter);

  function formatDate(v: string | null) {
    return formatShortDate(v);
  }

  function renderCell(p: any, key: string) {
    switch (key) {
      case "status":
        return (
          <select
            className="rounded border border-stone-300 px-1 py-0.5 text-xs"
            value={p.status}
            onChange={(e) => setStatus(p.id, e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case "ranking": {
        // p.ranking comes back from the DB as a number (e.g. 4, not
        // "4.0"), so comparing it directly against the option strings
        // below would never match "4.0" and the <select> would silently
        // fall back to the blank/self-rank placeholder even though the
        // value saved correctly. Match numerically instead.
        const selectedOption = RANKING_OPTIONS.find(
          (opt) => p.ranking != null && Number(opt) === Number(p.ranking)
        );
        return (
          <select
            className="rounded border border-stone-300 px-1 py-0.5 text-xs"
            value={selectedOption ?? ""}
            onChange={(e) => setRanking(p.id, e.target.value)}
          >
            <option value="">
              {p.self_reported_ranking ? `(self: ${p.self_reported_ranking})` : "—"}
            </option>
            {RANKING_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        );
      }
      case "days_per_week":
        return p.days_per_week ?? "—";
      case "days_in_a_row":
        return p.days_in_a_row ?? "—";
      case "days_usually_available":
        return p.days_usually_available ?? "—";
      case "created_at":
        return formatDate(p.created_at);
      case "approved_at":
        return formatDate(p.approved_at);
      case "notes":
        return <span className="italic text-stone-500">{p.notes ?? "—"}</span>;
      case "actions":
        return (
          <div className="flex gap-2 whitespace-nowrap">
            <button disabled={busyId === p.id} onClick={() => sendAccessLink(p.id)}
              className="text-blue-600 underline disabled:opacity-50">
              Send link
            </button>
            <a href={`/api/admin/impersonate/${p.id}`} className="text-purple-600 underline">
              Log in as
            </a>
          </div>
        );
      default:
        return p[key] ?? "—";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Roster</h1>
        <button
          onClick={() => setShowColumnEditor(!showColumnEditor)}
          className="rounded border border-stone-300 px-3 py-1 text-sm"
        >
          {showColumnEditor ? "Done arranging columns" : "Arrange columns"}
        </button>
      </div>

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

      {showColumnEditor && (
        <div className="rounded-md border bg-stone-50 p-3">
          <p className="mb-2 text-sm font-medium">Column order (use ↑↓ to rearrange):</p>
          <div className="flex flex-wrap gap-2">
            {columnOrder.map((key) => {
              const col = ALL_COLUMNS.find((c) => c.key === key)!;
              return (
                <div key={key} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs">
                  <span>{col.label}</span>
                  <button onClick={() => moveColumn(key, -1)} className="text-stone-400 hover:text-stone-700">↑</button>
                  <button onClick={() => moveColumn(key, 1)} className="text-stone-400 hover:text-stone-700">↓</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-stone-50 text-left text-stone-500">
              {columnOrder.map((key) => (
                <th key={key} className="whitespace-nowrap p-2">
                  {ALL_COLUMNS.find((c) => c.key === key)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b">
                {columnOrder.map((key) => (
                  <td key={key} className="whitespace-nowrap p-2">
                    {renderCell(p, key)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={columnOrder.length} className="p-4 text-center text-stone-400">No players match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
