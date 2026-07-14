"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Monday = 0 ... Sunday = 6 (JS's Date.getDay() is Sunday-first, so shift it)
function mondayBasedWeekday(d: Date) {
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

// Builds full calendar weeks (Mon-Sun) covering the next `numDays`
// days starting today, padding the front of the first week and the
// tail of the last week with nulls so every row lines up under the
// Monday..Sunday headers.
function buildCalendarWeeks(numDays: number): (Date | null)[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leadingBlanks = mondayBasedWeekday(today);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let i = 0; i < numDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    cells.push(d);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function AvailabilityPage() {
  const supabase = createClient();
  const router = useRouter();
  const [player, setPlayer] = useState<any>(null);
  const [available, setAvailable] = useState<Set<string>>(new Set());
  // Keyed by date ('YYYY-MM-DD') -> the active match tying that day up.
  const [matchByDate, setMatchByDate] = useState<Record<string, { id: string; match_number: number; status: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const weeks = buildCalendarWeeks(30);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data: p } = await supabase
        .from("players")
        .select("*")
        .eq("auth_user_id", userData.user.id)
        .single();
      setPlayer(p);

      if (p) {
        const { data: avail } = await supabase
          .from("availability")
          .select("date, time_slot")
          .eq("player_id", p.id);
        setAvailable(new Set((avail ?? []).map((a) => `${a.date}_${a.time_slot}`)));

        // Pull the player's own proposed/confirmed matches directly
        // (RLS already scopes this to "matches they're in") so each
        // locked day knows its match id, number, and status -- the
        // old locked_availability view only gave a yes/no flag.
        const { data: matchRows } = await supabase
          .from("match_players")
          .select("matches!inner(id, match_number, match_date, status)")
          .eq("player_id", p.id)
          .in("matches.status", ["proposed", "confirmed"]);

        const byDate: Record<string, { id: string; match_number: number; status: string }> = {};
        for (const row of matchRows ?? []) {
          const m = (row as any).matches;
          if (m) byDate[m.match_date] = { id: m.id, match_number: m.match_number, status: m.status };
        }
        setMatchByDate(byDate);
      }
      setLoading(false);
    })();
  }, []);

  async function toggleDay(date: Date) {
    const key = `${toISODate(date)}_morning`;
    if (matchByDate[toISODate(date)]) return; // can't edit — tied to a proposed/confirmed match

    const isAvailable = available.has(key);
    setSaving(true);

    if (isAvailable) {
      await supabase
        .from("availability")
        .delete()
        .eq("player_id", player.id)
        .eq("date", toISODate(date))
        .eq("time_slot", "morning");
      setAvailable((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      await supabase.from("availability").insert({
        player_id: player.id,
        date: toISODate(date),
        time_slot: "morning",
      });
      setAvailable((prev) => new Set(prev).add(key));
    }
    setSaving(false);
  }

  if (loading) return <p>Loading...</p>;
  if (!player) return <p>Please <a href="/login" className="underline">log in</a> first.</p>;
  if (player.status !== "active")
    return <p>Your account isn't approved yet — availability opens up once a manager approves you.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Your availability — next 30 days</h1>
      <p className="text-sm text-stone-600">
        Tap a day to mark yourself available (mornings). Greyed-out days are
        locked because you're in a proposed or confirmed match that day —
        tap one to jump to it on My Matches.
        {saving && <span className="ml-2 text-court-green">Saving...</span>}
      </p>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAY_HEADERS.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {wd}
          </div>
        ))}

        {weeks.map((week, wi) =>
          week.map((d, di) => {
            if (!d) return <div key={`blank-${wi}-${di}`} />;

            const dateKey = toISODate(d);
            const key = `${dateKey}_morning`;
            const isAvail = available.has(key);
            const match = matchByDate[dateKey];
            const isLocked = !!match;

            return (
              <button
                key={key}
                type="button"
                onClick={() => (isLocked ? router.push(`/matches#match-${match.id}`) : toggleDay(d))}
                className={`rounded-md border p-1 text-[11px] sm:p-2 sm:text-xs ${
                  isLocked
                    ? "cursor-pointer bg-stone-200 text-stone-500 hover:bg-stone-300"
                    : isAvail
                    ? "bg-court-green text-white"
                    : "bg-white hover:bg-stone-50"
                }`}
              >
                <div>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                {isLocked && (
                  <div className="mt-1 text-[8px] font-bold leading-tight sm:text-[10px]">
                    {match.status === "confirmed" ? "CONFIRMED MATCH" : "PROPOSED MATCH"}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
