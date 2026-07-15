"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function NavBar() {
  const supabase = createClient();
  const pathname = usePathname();
  const [isManager, setIsManager] = useState(false);
  const [isCaptain, setIsCaptain] = useState(false);
  const [selfServeOptIn, setSelfServeOptIn] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setLoggedIn(true);
      const { data: me } = await supabase
        .from("players")
        .select("role, self_serve_opt_in")
        .eq("auth_user_id", userData.user.id)
        .maybeSingle();
      if (me?.role === "manager") setIsManager(true);
      if (me?.role === "captain") setIsCaptain(true);
      if (me?.self_serve_opt_in) setSelfServeOptIn(true);
    })();
  }, []);

  function isActive(href: string) {
    if (href === "/admin") return pathname === href || pathname?.startsWith("/admin/");
    return pathname === href;
  }

  const linkClass = (href: string) =>
    `whitespace-nowrap ${isActive(href) ? "font-semibold text-court-green" : "text-stone-700"}`;

  // Captains keep everything a player has, plus the manager sub-nav
  // below (so they can reach whichever sections they've been granted
  // permissions for) -- but never the top-level "Manager" label/home
  // page or the Permissions page itself, which stay manager-only.
  const showManagerSubNav = isManager || isCaptain;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="whitespace-nowrap text-lg font-semibold text-court-green">
          🎾 Club Tennis
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/matches" className={linkClass("/matches")}>My Matches</Link>
          {selfServeOptIn && <Link href="/matches/build" className={linkClass("/matches/build")}>Build a Match</Link>}
          <Link href="/availability" className={linkClass("/availability")}>Availability</Link>
          <Link href="/profile" className={linkClass("/profile")}>Profile</Link>
          {!loggedIn && <Link href="/login" className={linkClass("/login")}>Log in</Link>}
          {isManager && <Link href="/admin" className={linkClass("/admin")}>Manager</Link>}
        </nav>
      </div>

      {/* Persistent manager sub-nav -- shown on every page once you're a
          manager or captain, not just on /admin itself, so you can jump
          straight from e.g. My Matches into Roster without detouring
          home first. A captain's actual buttons on each page are still
          limited to whatever they've been granted on the Permissions
          page -- this just controls navigation, not access. */}
      {showManagerSubNav && (
        <div className="border-t border-stone-100 bg-stone-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs">
            <Link href="/admin/grid" className={linkClass("/admin/grid")}>Match Matrix</Link>
            <Link href="/admin/matches" className={linkClass("/admin/matches")}>Matches</Link>
            <Link href="/admin/roster" className={linkClass("/admin/roster")}>Roster</Link>
            <Link href="/admin/settings" className={linkClass("/admin/settings")}>Settings</Link>
            {isManager && <Link href="/admin/permissions" className={linkClass("/admin/permissions")}>Permissions</Link>}
          </div>
        </div>
      )}
    </header>
  );
}
