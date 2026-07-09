"use client";

import { useEffect, useState } from "react";

export default function ImpersonationBanner() {
  const [status, setStatus] = useState<{ impersonating: boolean; currentlyViewingAs?: string | null } | null>(null);

  async function check() {
    const res = await fetch("/api/admin/impersonation-status");
    const json = await res.json();
    setStatus(json);
  }

  useEffect(() => {
    check();
  }, []);

  if (!status?.impersonating) return null;

  return (
    <div className="bg-purple-600 px-4 py-2 text-center text-sm text-white">
      Viewing as <strong>{status.currentlyViewingAs}</strong> (test mode) —{" "}
      <a
        href="/api/admin/stop-impersonating-link"
        className="ml-2 inline-block rounded bg-white px-3 py-0.5 text-purple-700"
      >
        Back to Manager
      </a>
    </div>
  );
}
