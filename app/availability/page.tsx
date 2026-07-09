"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function next30Days() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  const supabase = createClient();
  const [player, setPlayer] = useState<any>(null);
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const days = next30Days();

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

        const { data: lockedRows } = await supabase
          .from("locked_availability")
          .select("date, time_slot")
          .eq("player_id", p.id);
        setLocked(new Set((lockedRows ?? []).map((a: any) => `${a.date}_${a.time_slot}`)));
      }
      setLoading(false);
    })();
  }, []);

  async function toggleDay(date: Date) {
    const key = `${toISODate(date)}_morning`;
    if (locked.has(key)) return; // can't edit — tied to a proposed/confirmed match

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
        locked because you're in a proposed or confirmed match that day.
        {saving && <span className="ml-2 text-court-green">Saving...</span>}
      </p>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
        {days.map((d) => {
          const key = `${toISODate(d)}_morning`;
          const isAvail = available.has(key);
          const isLocked = locked.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={isLocked}
              onClick={() => toggleDay(d)}
              className={`rounded-md border p-2 text-xs ${
                isLocked
                  ? "cursor-not-allowed bg-stone-100 text-stone-400"
                  : isAvail
                  ? "bg-court-green text-white"
                  : "bg-white hover:bg-stone-50"
              }`}
            >
              <div className="font-semibold">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              {isLocked && <div className="mt-1">in match</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
