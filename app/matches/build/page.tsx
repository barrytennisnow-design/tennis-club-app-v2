"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDateWithWeekday } from "@/lib/formatDate";

const GROUP_SIZES = [2, 4] as const;

export default function BuildMatchPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [canInviteAnyRoster, setCanInviteAnyRoster] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState<2 | 4>(4);
  const [openPlayers, setOpenPlayers] = useState<any[]>([]);
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [otherIds, setOtherIds] = useState<string[]>([]);
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
    setCanInviteAnyRoster(!!json.canInviteAnyRoster);
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

  async function fetchPlayers(date: string) {
    setAvailableIds([]);
    setOtherIds([]);
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
    setCanInviteAnyRoster(!!json.canInviteAnyRoster);
  }

  async function pickDate(date: string) {
    setSelectedDate(date);
    await fetchPlayers(date);
  }

  function toggleAvailable(id: string) {
    setAvailableIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleOther(id: string) {
    setOtherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const invitedCount = availableIds.length + otherIds.length;
  const enoughInvited = invitedCount >= targetSize - 1;
  const canSubmit = !!selectedDate && !!courtId && enoughInvited;

  async function submit() {
    if (!canSubmit || !selectedDate) return;
    setSubmitting(true);
    setError(null);
    const time_display = timeChoice === "__default__" ? null : timeChoice;
    const res = await fetch("/api/self-serve/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        court_id: courtId,
        time_display,
        target_size: targetSize,
        available_player_ids: availableIds,
        other_player_ids: otherIds,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.ok) {
      setError(json.error);
      return;
    }
    const waveNote = json.waitingOnWave2 > 0
      ? ` ${json.waitingOnWave2} more player(s) who haven't marked that day available will only be invited if this match is still short 8 hours from now.`
      : "";
    setSuccess(
      `Match M${json.matchNumber} proposed! You're already accepted — ${json.invited} player(s) were just invited, first to accept gets the remaining spot(s) — check My Matches.${waveNote}`
    );
    setSelectedDate(null);
    setAvailableIds([]);
    setOtherIds([]);
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

  const availablePlayers = openPlayers.filter((p) => p.available);
  const otherPlayers = openPlayers.filter((p) => !p.available);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Build Your Own Match</h1>
      <p className="text-sm text-stone-600">
        These are your available, unassigned days that are close enough now to build a match yourself.
        Pick a day, say how many players the match needs (2 or 4 total, including you), then invite as
        many candidates as you like — you can invite more than you need. Whoever accepts first fills the
        spots; you're auto-accepted since you're proposing.
        {canInviteAnyRoster
          ? " As a manager/captain, you can also invite players who haven't marked that day available yet — they're only actually contacted if the match is still short 8 hours after the available players were invited (or once everyone available has responded, if that's sooner)."
          : " You can only invite players who've marked that day available."}
        {" "}If two people try to grab the same player or day at once, whoever submits first gets it —
        the other will be asked to pick again.
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
            <p className="mb-2 text-sm font-medium">How many players does this match need?</p>
            <div className="flex gap-2">
              {GROUP_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setTargetSize(size)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    targetSize === size
                      ? "border-court-green bg-court-green text-white"
                      : "border-stone-300 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {size} total
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Available players ({availableIds.length} selected)</p>
            <p className="mb-2 text-xs text-stone-500">Marked available that day — invited right away. Pick from here first.</p>
            {playersLoading && <p className="text-sm text-stone-500">Loading...</p>}
            {!playersLoading && availablePlayers.length === 0 && (
              <p className="text-sm text-stone-500">No one else marked available that day right now.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {availablePlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleAvailable(p.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    availableIds.includes(p.id)
                      ? "border-court-green bg-court-green text-white"
                      : "border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {p.first_name} {p.last_name}
                </button>
              ))}
            </div>
          </div>

          {canInviteAnyRoster && (
            <div>
              <p className="mb-1 text-sm font-medium">Everyone else on the active roster ({otherIds.length} selected)</p>
              <p className="mb-2 text-xs text-stone-500">
                Haven't marked that day available. Only contacted if the match still needs players once the
                available group has had 8 hours to respond (or has all responded already).
              </p>
              {!playersLoading && otherPlayers.length === 0 && (
                <p className="text-sm text-stone-500">No one else is open that day right now.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {otherPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleOther(p.id)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      otherIds.includes(p.id)
                        ? "border-court-green bg-court-green text-white"
                        : "border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {p.first_name} {p.last_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!enoughInvited && invitedCount > 0 && (
            <p className="text-sm text-amber-700">
              You've invited {invitedCount}, but a {targetSize}-player match needs at least {targetSize - 1} candidates invited.
            </p>
          )}

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
            disabled={submitting || !canSubmit}
            className="rounded-md bg-court-green px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {submitting ? "Proposing..." : `Propose This Match (need ${targetSize}, inviting ${invitedCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
