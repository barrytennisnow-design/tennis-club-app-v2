"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// This page is what the email's login link points to (once the
// Supabase email template is set up to link here -- see
// GETTING_STARTED.md / the dashboard email template setting). It
// deliberately does NOT redeem the login token just from being
// loaded -- some email providers automatically visit links in
// incoming mail to scan them for phishing/malware, and if loading
// this page alone logged you in, that automatic visit would burn
// the single-use token before you ever clicked it yourself.
//
// Only the explicit button click below calls the server route that
// actually verifies the token and starts your session.
export default function ConfirmLoginPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmLoginContent />
    </Suspense>
  );
}

function ConfirmLoginContent() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "magiclink";
  const next = searchParams.get("next") ?? "/matches";
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleConfirm() {
    setStatus("verifying");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/confirm-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "That login link didn't work.");
        return;
      }
      window.location.href = next;
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong -- try again.");
    }
  }

  if (!tokenHash) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          This link is missing some information. Go back to{" "}
          <a href="/login" className="underline">
            the login page
          </a>{" "}
          and request a new one.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-xl font-bold">Finish logging in</h1>
      <p className="text-sm text-stone-600">
        For your security, click below to complete login -- this confirms
        it's really you, not just an automatic link preview.
      </p>
      <button
        onClick={handleConfirm}
        disabled={status === "verifying"}
        className="w-full rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90 disabled:opacity-50"
      >
        {status === "verifying" ? "Logging you in..." : "Finish logging in"}
      </button>
      {status === "error" && (
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          {errorMsg} Go back to{" "}
          <a href="/login" className="underline">
            the login page
          </a>{" "}
          to request a new link.
        </div>
      )}
    </div>
  );
}
