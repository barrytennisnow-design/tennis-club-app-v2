"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const linkError = searchParams.get("linkError");
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "signing-in" | "error">("idle");
  const [passkeyError, setPasskeyError] = useState("");

  useEffect(() => {
    // Only show the passkey option on devices/browsers that actually
    // support WebAuthn -- most modern phones and computers do, but a
    // handful of older devices or in-app browsers don't.
    setPasskeySupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  async function handlePasskeySignIn() {
    setPasskeyStatus("signing-in");
    setPasskeyError("");
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) {
      setPasskeyStatus("error");
      setPasskeyError(error.message);
      return;
    }
    setPasskeyStatus("idle");
    router.push("/matches");
    router.refresh();
  }

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

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-md bg-green-50 p-6 text-green-800">
          Check <strong>{email}</strong> for your login link.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      {linkError && (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          {linkError} Try requesting a new link below.
        </div>
      )}
      {passkeySupported && (
        <div className="space-y-2 rounded-md border border-court-green/30 bg-court-green/5 p-4">
          <button
            type="button"
            onClick={handlePasskeySignIn}
            disabled={passkeyStatus === "signing-in"}
            className="w-full rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50"
          >
            🔒 {passkeyStatus === "signing-in" ? "Waiting for Face ID / fingerprint..." : "Sign in with Passkey"}
          </button>
          {passkeyStatus === "error" && (
            <p className="text-sm text-red-600">
              {passkeyError || "That didn't work"} -- use your email below instead, or set up a passkey from your Profile page after logging in.
            </p>
          )}
          <p className="text-center text-xs text-stone-500">or use your email below</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
    </div>
  );
}
