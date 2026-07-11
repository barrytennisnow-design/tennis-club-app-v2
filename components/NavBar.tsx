"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function NavBar() {
  const supabase = createClient();
  const [isManager, setIsManager] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setLoggedIn(true);
      const { data: me } = await supabase
        .from("players")
        .select("role")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (me?.role === "manager") setIsManager(true);
    })();
  }, []);

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-court-green">
          🎾 Club Tennis
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/matches">My Matches</Link>
          <Link href="/availability">Availability</Link>
          <Link href="/profile">Profile</Link>
          {!loggedIn && <Link href="/login">Log in</Link>}
          {isManager && <Link href="/admin">Manager</Link>}
        </nav>
      </div>
    </header>
  );
}
