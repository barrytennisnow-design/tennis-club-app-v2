"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "trying" | "error">("idle");
  const [passkeyError, setPasskeyError] = useState("");

  useEffect(() => {
    // Passkeys need a secure context + browser WebAuthn support.
    setPasskeySupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

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

  async function handlePasskeyLogin() {
    setPasskeyStatus("trying");
    setPasskeyError("");
    try {
      // @ts-ignore -- experimental API, may not be in installed type defs yet
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (data?.session) {
        window.location.href = "/profile";
      }
    } catch (err: any) {
      setPasskeyStatus("error");
      setPasskeyError(err?.message || "Passkey sign-in didn't work. Try email instead.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-md bg-green-50 p-6 text-green-800">
        Check <strong>{email}</strong> for your login link.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-xl font-bold">Log in</h1>

      {passkeySupported && (
        <div className="space-y-2">
          <button
            onClick={handlePasskeyLogin}
            disabled={passkeyStatus === "trying"}
            className="w-full rounded-md border-2 border-court-green px-4 py-2 font-medium text-court-green hover:bg-court-green/5 disabled:opacity-50"
          >
            {passkeyStatus === "trying" ? "Waiting for Face ID / fingerprint..." : "🔒 Sign in with Passkey"}
          </button>
          {passkeyStatus === "error" && <p className="text-sm text-red-600">{passkeyError}</p>}
          <p className="text-center text-xs text-stone-400">— or use email —</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
    </div>
  );
}
