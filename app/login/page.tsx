"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [code, setCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "verifying" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/matches`,
      },
    });
    setErrorMsg(error?.message ?? "");
    setStatus(error ? "error" : "sent");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeStatus("verifying");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      setCodeStatus("error");
      return;
    }
    // Same first-login player-linking that clicking the email link
    // triggers via /auth/callback -- this path needs to do it too,
    // since it never goes through that route.
    await fetch("/api/auth/complete-code-login", { method: "POST" });
    window.location.href = "/matches";
  }

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-md bg-green-50 p-6 text-green-800">
          Check <strong>{email}</strong> for your login link.
        </div>
        <div className="space-y-2 rounded-md border border-stone-200 p-4">
          <p className="text-sm text-stone-600">
            Opening the email on a <strong>different device</strong> than the one you requested it
            on? The link won't work there -- instead, enter the 6-digit code from that same email:
          </p>
          <form onSubmit={handleVerifyCode} className="flex gap-2">
            <input
              required
              inputMode="numeric"
              placeholder="123456"
              className="w-full rounded-md border border-stone-300 px-3 py-2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              disabled={codeStatus === "verifying"}
              className="whitespace-nowrap rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50"
            >
              {codeStatus === "verifying" ? "Checking..." : "Log in"}
            </button>
          </form>
          {codeStatus === "error" && (
            <p className="text-sm text-red-600">That code didn't work -- check it and try again, or request a new email.</p>
          )}
        </div>
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
        <p className="text-red-600">{errorMsg || "Something went wrong — try again."}</p>
      )}
    </form>
  );
}
