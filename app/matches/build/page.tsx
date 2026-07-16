"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDateWithWeekday } from "@/lib/formatDate";

export default function BuildMatchPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [openPlayers, setOpenPlayers] = useState<any[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [courtId, setCourtId] = useState("");
  const [timeChoice, setTimeChoice] = useState("__default__");
  const [defaultTimeDisplay, setDefaultTimeDisplay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadDates() {
    setLoading(true);
    const res = await fetch("/api/self-serve/eligible-dates");
    const json = await res.json();
    setOptedIn(!!json.optedIn);
    setDates(json.dates ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadDates();
    (async () => {
      const { data: courtRows } = await supabase.from("courts").select("*").eq("is_active", true).order("sort_order").order("name");
      setCourts(courtRows ?? []);
      const { data: slotRows } = await supabase.from("time_slots").select("*").eq("is_active", true).order("sort_order").order("name");
      setTimeSlots(slotRows ?? []);
      const def = (slotRows ?? []).find((t: any) => t.is_default);
      setDefaultTimeDisplay(def?.description ?? "");
      const defCourt = (courtRows ?? []).find((c: any) => c.is_default);
      if (defCourt) setCourtId(defCourt.id);
    })();
  }, []);

  async function pickDate(date: string) {
    setSelectedDate(date);
    setSelectedPlayerIds([]);
    setError(null);
    setPlayersLoading(true);
    const res = await fetch(`/api/self-serve/open-players?date=${date}`);
    const json = await res.json();
    setPlayersLoading(false);
    if (!json.ok) {
      setError(json.error);
      setOpenPlayers([]);
      return;
    }
    setOpenPlayers(json.players ?? []);
  }

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev; // max group size is 6 (you + 5 others)
      return [...prev, id];
    });
  }

  async function submit() {
    if (!selectedDate || selectedPlayerIds.length < 1 || selectedPlayerIds.length > 5 || !courtId) return;
    setSubmitting(true);
    setError(null);
    const time_display = timeChoice === "__default__" ? null : timeChoice;
    const res = await fetch("/api/self-serve/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, court_id: courtId, time_display, player_ids: selectedPlayerIds }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.ok) {
      setError(json.error);
      return;
    }
    setSuccess(`Match M${json.matchNumber} proposed! You're already accepted — the other ${selectedPlayerIds.length} player(s) now need to accept — check My Matches.`);
    setSelectedDate(null);
    setSelectedPlayerIds([]);
    setOpenPlayers([]);
    loadDates();
  }

  if (loading) return <p>Loading...</p>;

  if (!optedIn) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Build Your Own Match</h1>
        <p className="text-stone-600">
          This isn't turned on for your account yet — ask a manager to opt you in to self-serve matches on the Roster page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Build Your Own Match</h1>
      <p className="text-sm text-stone-600">
        These are your available, unassigned days that are close enough now to build a match yourself.
        Pick a day, choose 1 to 5 other open players (2-6 people total including you), set a court
        and time, and propose — you're auto-accepted since you're the one proposing, but everyone
        else still needs to accept, same as any other match. If two people try to grab the same
        player or day at once, whoever submits first gets it — the other will be asked to pick again.
      </p>

      {success && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{success}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {!selectedDate && dates.length === 0 && (
        <p className="text-stone-500">No open days right now — check back closer to one of your available dates.</p>
      )}

      {!selectedDate && dates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => pickDate(d)}
              className="rounded-md border border-court-green px-3 py-1.5 text-sm text-court-green hover:bg-court-green/5"
            >
              {formatShortDateWithWeekday(d)}
            </button>
          ))}
        </div>
      )}

      {selectedDate && (
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{formatShortDateWithWeekday(selectedDate)}</h2>
            <button onClick={() => { setSelectedDate(null); setError(null); }} className="text-xs text-stone-500 underline">
              Choose a different day
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Pick 1 to 5 other players ({selectedPlayerIds.length} selected, {selectedPlayerIds.length + 1} total):
            </p>
            {playersLoading && <p className="text-sm text-stone-500">Loading...</p>}
            {!playersLoading && openPlayers.length === 0 && (
              <p className="text-sm text-stone-500">No one else is open that day right now.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {openPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    selectedPlayerIds.includes(p.id)
                      ? "border-court-green bg-court-green text-white"
                      : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {p.first_name} {p.last_name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Court
              <select className="input mt-1" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                <option value="">Select a court...</option>
                {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Time
              <select className="input mt-1" value={timeChoice} onChange={(e) => setTimeChoice(e.target.value)}>
                <option value="__default__">Default ({defaultTimeDisplay})</option>
                {timeSlots.map((t) => <option key={t.id} value={t.description}>{t.description}</option>)}
              </select>
            </label>
          </div>

          <button
            onClick={submit}
            disabled={submitting || selectedPlayerIds.length < 1 || !courtId}
            className="rounded-md bg-court-green px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {submitting ? "Proposing..." : `Propose This Match (${selectedPlayerIds.length + 1} players)`}
          </button>
        </div>
      )}
    </div>
  );
}
