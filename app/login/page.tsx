"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/profile`,
      },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-md bg-green-50 p-6 text-green-800">
        Check <strong>{email}</strong> for your login link.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Log in</h1>
      <p className="text-sm text-stone-600">
        Enter your email and we'll send you a link — no password needed.
      </p>
      <input
        required
        type="email"
        placeholder="Email address"
        className="w-full rounded-md border border-stone-300 px-3 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        disabled={status === "sending"}
        className="w-full rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send login link"}
      </button>
      {status === "error" && (
        <p className="text-red-600">Something went wrong — try again.</p>
      )}
    </form>
  );
}
