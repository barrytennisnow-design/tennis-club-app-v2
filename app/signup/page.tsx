"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SignupPage() {
  const supabase = createClient();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "FL",
    zip: "",
    self_reported_ranking: "3.0",
    days_per_week: "2",
    days_in_a_row: "1",
    notes: "",
  });
  const [days, setDays] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleDay(day: string) {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    // 1. Send magic link. This creates the auth.users row (if new)
    // and, on click, logs the player straight into their account.
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: form.email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/profile`,
        data: {
          // stashed so /auth/callback can create the players row
          // on first login if it doesn't exist yet
          pending_signup: JSON.stringify({ ...form, days_usually_available: days }),
        },
      },
    });

    if (authError) {
      setStatus("error");
      setErrorMsg(authError.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-md bg-green-50 p-6 text-green-800">
        <h2 className="text-lg font-semibold">Check your email!</h2>
        <p>
          We sent a login link to <strong>{form.email}</strong>. Click it to
          finish creating your profile. A manager will review and approve
          your account before you can be matched into games.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-bold">New Player Signup</h1>

      <div className="grid grid-cols-2 gap-4">
        <input required placeholder="First name" className="input"
          value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
        <input required placeholder="Last name" className="input"
          value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
      </div>

      <input required type="email" placeholder="Email address" className="input w-full"
        value={form.email} onChange={(e) => update("email", e.target.value)} />
      <input required placeholder="Cell phone number" className="input w-full"
        value={form.phone} onChange={(e) => update("phone", e.target.value)} />

      <input placeholder="Address" className="input w-full"
        value={form.address} onChange={(e) => update("address", e.target.value)} />
      <div className="grid grid-cols-3 gap-4">
        <input placeholder="City" className="input"
          value={form.city} onChange={(e) => update("city", e.target.value)} />
        <input placeholder="State" className="input"
          value={form.state} onChange={(e) => update("state", e.target.value)} />
        <input placeholder="Zip" className="input"
          value={form.zip} onChange={(e) => update("zip", e.target.value)} />
      </div>

      <label className="block text-sm font-medium">
        Self-rated ranking (a manager may adjust this on approval)
        <select className="input mt-1 w-full" value={form.self_reported_ranking}
          onChange={(e) => update("self_reported_ranking", e.target.value)}>
          {["2.5","2.75","3.0","3.25","3.5","3.75","4.0","4.25","4.5"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Days per week you'd like to play
          <select className="input mt-1 w-full" value={form.days_per_week}
            onChange={(e) => update("days_per_week", e.target.value)}>
            {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Days in a row you're OK with
          <select className="input mt-1 w-full" value={form.days_in_a_row}
            onChange={(e) => update("days_in_a_row", e.target.value)}>
            {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Days you're usually available</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button type="button" key={d} onClick={() => toggleDay(d)}
              className={`rounded-full border px-3 py-1 text-sm ${
                days.includes(d) ? "bg-court-green text-white" : "bg-white text-stone-700"
              }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <textarea placeholder="Anything else you want to say?" className="input w-full" rows={3}
        value={form.notes} onChange={(e) => update("notes", e.target.value)} />

      {status === "error" && <p className="text-red-600">{errorMsg}</p>}

      <button disabled={status === "sending"}
        className="w-full rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50">
        {status === "sending" ? "Sending..." : "Sign up with email"}
      </button>

      <style jsx global>{`
        .input {
          border: 1px solid #d6d3d1;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
        }
      `}</style>
    </form>
  );
}
