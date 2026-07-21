"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { useZoom, ZOOM_LEVELS } from "@/lib/zoomContext";

export default function NavBar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const { zoom, setZoom } = useZoom();
  const [isManager, setIsManager] = useState(false);
  const [isCaptain, setIsCaptain] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [selfServeOptIn, setSelfServeOptIn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unreadInterval: ReturnType<typeof setInterval> | null = null;

    async function loadProfile(userId: string) {
      const { data: me } = await supabase
        .from("players")
        .select("id, role, self_serve_opt_in")
        .eq("auth_user_id", userId)
        .maybeSingle();
      setIsManager(me?.role === "manager");
      setIsCaptain(me?.role === "captain");
      setSelfServeOptIn(!!me?.self_serve_opt_in);

      if (unreadInterval) {
        clearInterval(unreadInterval);
        unreadInterval = null;
      }
      if (me?.id) {
        const refreshUnread = async () => {
          const { count } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("player_id", me.id)
            .is("read_at", null);
          setUnreadCount(count ?? 0);
        };
        refreshUnread();
        // Lightweight polling rather than a realtime subscription --
        // good enough for a badge count, and avoids holding a socket
        // open on every page for something this low-stakes.
        unreadInterval = setInterval(refreshUnread, 60000);
      }
    }

    function reset() {
      setLoggedIn(false);
      setIsManager(false);
      setIsCaptain(false);
      setSelfServeOptIn(false);
      setUnreadCount(0);
      if (unreadInterval) {
        clearInterval(unreadInterval);
        unreadInterval = null;
      }
    }

    // Covers a hard page load (or refresh) where a session already
    // exists in cookies -- e.g. arriving via the magic-link callback's
    // server-side redirect.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setLoggedIn(true);
        loadProfile(data.user.id);
      }
    });

    // Covers a sign-in/sign-out that happens without a full page
    // reload -- e.g. passkey sign-in, which completes entirely in the
    // browser and navigates with router.push() rather than a hard
    // redirect. NavBar only mounts once per layout (not once per
    // route), so without this listener it never finds out a login
    // just happened and keeps showing its earlier "logged out" menu.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setLoggedIn(true);
        loadProfile(session.user.id);
      } else {
        reset();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      if (unreadInterval) clearInterval(unreadInterval);
    };
  }, []);

  async function handleLogoff() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="whitespace-nowrap text-lg font-semibold text-court-green">
          🎾 Club Tennis
        </Link>
        <label className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
          Zoom
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="rounded border border-stone-300 px-1 py-0.5"
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>{z}%</option>
            ))}
          </select>
        </label>
      </div>

      {/* Player menu -- shown on every page, always on one line (scrolls
          horizontally on narrow phone screens rather than wrapping).
          LOGOFF lives at the end of this row for plain players; for
          managers/captains it moves to the end of the manager row below
          instead, so there's only ever one LOGOFF button on screen. */}
      {loggedIn ? (
        <div className="border-t border-stone-100">
          <nav className="mx-auto flex max-w-6xl flex-nowrap items-center gap-x-4 overflow-x-auto whitespace-nowrap px-4 py-2 text-sm">
            <Link href="/matches" className={linkClass("/matches")}>My Matches</Link>
            <Link href="/notifications" className={linkClass("/notifications")}>
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-court-green px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
            {selfServeOptIn && <Link href="/matches/build" className={linkClass("/matches/build")}>Build a Match</Link>}
            <Link href="/availability" className={linkClass("/availability")}>Availability</Link>
            <Link href="/profile" className={linkClass("/profile")}>Profile</Link>
            {!showManagerSubNav && (
              <button onClick={handleLogoff} className="whitespace-nowrap text-stone-700 hover:text-red-700">
                LOGOFF
              </button>
            )}
          </nav>
        </div>
      ) : (
        <div className="border-t border-stone-100">
          <nav className="mx-auto flex max-w-6xl items-center gap-x-4 px-4 py-2 text-sm">
            <Link href="/login" className={linkClass("/login")}>Log in</Link>
          </nav>
        </div>
      )}

      {/* Persistent manager sub-nav -- shown on every page once you're a
          manager or captain, not just on /admin itself, so you can jump
          straight from e.g. My Matches into Roster without detouring
          home first. A captain's actual buttons on each page are still
          limited to whatever they've been granted on the Permissions
          page -- this just controls navigation, not access. Also on
          one line, scrolling horizontally rather than wrapping. */}
      {showManagerSubNav && (
        <div className="border-t border-stone-100 bg-stone-50">
          <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-x-4 overflow-x-auto whitespace-nowrap px-4 py-1.5 text-xs">
            <Link href="/admin/grid" className={linkClass("/admin/grid")}>Match Matrix</Link>
            <Link href="/admin/matches" className={linkClass("/admin/matches")}>Matches</Link>
            <Link href="/admin/roster" className={linkClass("/admin/roster")}>Roster</Link>
            <Link href="/admin/settings" className={linkClass("/admin/settings")}>Settings</Link>
            {isManager && <Link href="/admin/permissions" className={linkClass("/admin/permissions")}>Permissions</Link>}
            <button onClick={handleLogoff} className="whitespace-nowrap text-stone-700 hover:text-red-700">
              LOGOFF
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
