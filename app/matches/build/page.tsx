"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { formatShortDateWithWeekday } from "@/lib/formatDate";

const GROUP_SIZES = [2, 4] as const;

export default function BuildMatchPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  // Whether the organizer is (or will be) one of the players in this
  // match. For a regular player this is always true and can't be
  // changed -- they're forced in as the first player, shown locked in
  // the player list below. For a manager/captain it starts true and
  // toggles off/on by clicking their own name in that same list, same
  // as toggling any other candidate -- see the self-chip rendering
  // further down.
  const [includeSelf, setIncludeSelf] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [staffDate, setStaffDate] = useState("");
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
    const res = await fetch(`/api/self-serve/eligible-dates`);
    const json = await res.json();
    setOptedIn(!!json.optedIn);
    setIsStaff(!!json.isStaff);
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
    const players = json.players ?? [];
    setOpenPlayers(players);
    // A regular player is always included. A manager/captain defaults
    // to included, but only if they're actually offered as a
    // selectable player for this date (i.e. not already tied up in a
    // proposed/confirmed match that day) -- otherwise force it off,
    // since there's no valid way to include them.
    const selfIsSelectable = players.some((p: any) => p.is_self);
    setIncludeSelf(!isStaff ? true : selfIsSelectable);
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
  const minNeeded = includeSelf ? targetSize - 1 : targetSize;
  const enoughInvited = invitedCount >= minNeeded;
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
        include_self: includeSelf,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.ok) {
      setError(json.error);
      return;
    }
    const waveNote = json.waitingOnWave2 > 0
      ? ` ${json.waitingOnWave2} more player(s) who haven't marked that day available will only be invited if this match is still short once the response window passes.`
      : "";
    const acceptedNote = includeSelf ? "You're already accepted — " : "";
    setSuccess(
      `Match M${json.matchNumber} proposed! ${acceptedNote}${json.invited} player(s) were just invited, first to accept gets the remaining spot(s) — check the Match Matrix or Manager Matches tab for live status.${waveNote}`
    );
    setSelectedDate(null);
    setStaffDate("");
    setAvailableIds([]);
    setOtherIds([]);
    setOpenPlayers([]);
    loadDates();
  }

  if (loading) return <p>Loading...</p>;

  if (!isStaff && !optedIn) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Build Your Own Match</h1>
        <p className="text-stone-600">
          This isn't turned on for your account yet — ask a manager to opt you in to self-serve matches on the Roster page.
        </p>
      </div>
    );
  }

  const selfPlayer = openPlayers.find((p) => p.is_self) ?? null;
  const candidatePlayers = openPlayers.filter((p) => !p.is_self);
  const availablePlayers = candidatePlayers.filter((p) => p.available);
  const otherPlayers = candidatePlayers.filter((p) => !p.available);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Build Your Own Match</h1>
      <p className="text-sm text-stone-600">
        Pick a day, say how many players the match needs (2 or 4 total), then invite as many candidates
        as you like — you can invite more than you need. Whoever accepts first fills the spots.
        {isStaff
          ? " As a manager/captain, you can organize a match for any upcoming date. Once you pick a day, your own name shows up in the player list below — select it if you want to play, leave it unselected to just organize."
          : " You're automatically included as one of the players, since you're proposing."}
        {" "}If two people try to grab the same player or day at once, whoever submits first gets it —
        the other will be asked to pick again.
      </p>

      {success && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{success}</p>}
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {!selectedDate && isStaff && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Match date
            <input
              type="date"
              className="input mt-1"
              min={new Date().toISOString().slice(0, 10)}
              value={staffDate}
              onChange={(e) => setStaffDate(e.target.value)}
            />
          </label>
          <button
            disabled={!staffDate || !dates.includes(staffDate)}
            onClick={() => pickDate(staffDate)}
            className="rounded-md bg-court-green px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Continue
          </button>
          {staffDate && !dates.includes(staffDate) && (
            <p className="text-sm text-amber-700">That date isn't available.</p>
          )}
        </div>
      )}

      {!selectedDate && !isStaff && dates.length === 0 && (
        <p className="text-stone-500">No open days right now — check back closer to one of your available dates.</p>
      )}

      {!selectedDate && !isStaff && dates.length > 0 && (
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
            <p className="mb-1 text-sm font-medium">You</p>
            {!isStaff && (
              <p className="mb-2 text-xs text-stone-500">You're proposing this match, so you're always one of the players.</p>
            )}
            {isStaff && (
              <p className="mb-2 text-xs text-stone-500">
                {selfPlayer
                  ? "Select your name if you want to play in this match too. Leave it unselected to just organize."
                  : "You're already in a match that day, so you can't be added as a player — this match will be for other players only."}
              </p>
            )}
            {selfPlayer && (
              <div className="flex flex-wrap gap-2">
                {isStaff ? (
                  <button
                    onClick={() => setIncludeSelf((v) => !v)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      includeSelf
                        ? "border-court-green bg-court-green text-white"
                        : "border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {selfPlayer.first_name} {selfPlayer.last_name} (you)
                  </button>
                ) : (
                  <span
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-md border border-court-green bg-court-green px-3 py-1.5 text-sm text-white"
                  >
                    ✓ {selfPlayer.first_name} {selfPlayer.last_name} (you)
                  </span>
                )}
              </div>
            )}
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

          <div>
            <p className="mb-1 text-sm font-medium">Everyone else on the active roster ({otherIds.length} selected)</p>
            <p className="mb-2 text-xs text-stone-500">
              Haven't marked that day available. Only contacted if the match still needs players once the
              available group has had the response window to reply (or has all responded already).
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

          {!enoughInvited && invitedCount > 0 && (
            <p className="text-sm text-amber-700">
              You've invited {invitedCount}, but this match needs at least {minNeeded} candidates invited.
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
