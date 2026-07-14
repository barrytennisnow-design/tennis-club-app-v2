"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function NavBar() {
  const supabase = createClient();
  const pathname = usePathname();
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

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname?.startsWith(href));
  }

  const linkClass = (href: string) =>
    `whitespace-nowrap ${isActive(href) ? "font-semibold text-court-green" : "text-stone-700"}`;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="whitespace-nowrap text-lg font-semibold text-court-green">
          🎾 Club Tennis
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/matches" className={linkClass("/matches")}>My Matches</Link>
          <Link href="/availability" className={linkClass("/availability")}>Availability</Link>
          <Link href="/profile" className={linkClass("/profile")}>Profile</Link>
          {!loggedIn && <Link href="/login" className={linkClass("/login")}>Log in</Link>}
          {isManager && <Link href="/admin" className={linkClass("/admin")}>Manager</Link>}
        </nav>
      </div>

      {/* Persistent manager sub-nav -- shown on every page once you're a
          manager, not just on /admin itself, so you can jump straight
          from e.g. My Matches into Roster without detouring home first. */}
      {isManager && (
        <div className="border-t border-stone-100 bg-stone-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs">
            <Link href="/admin/grid" className={linkClass("/admin/grid")}>Match Matrix</Link>
            <Link href="/admin/matches" className={linkClass("/admin/matches")}>Matches</Link>
            <Link href="/admin/roster" className={linkClass("/admin/roster")}>Roster</Link>
            <Link href="/admin/settings" className={linkClass("/admin/settings")}>Settings</Link>
          </div>
        </div>
      )}
    </header>
  );
}
