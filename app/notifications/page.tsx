"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { enablePush, disablePush, isPushEnabledOnThisDevice, listenForForegroundPush } from "@/lib/notificationsClient";

const TYPE_ICON: Record<string, string> = {
  match_proposed: "🎾",
  match_confirmed: "✅",
  match_cancelled: "❌",
  match_reminder: "⏰",
  match_invite_withdrawn: "🚫",
};

export default function NotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [player, setPlayer] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }
    const { data: p } = await supabase
      .from("players")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .single();
    setPlayer(p);

    if (p) {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("player_id", p.id)
        .order("created_at", { ascending: false });
      setNotifications(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    isPushEnabledOnThisDevice().then(setPushEnabled);
    const unsubscribe = listenForForegroundPush(() => load());
    return () => {
      unsubscribe.then((fn) => fn?.());
    };
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushMessage(null);
    if (pushEnabled) {
      await disablePush();
      setPushEnabled(false);
    } else {
      const result = await enablePush();
      if (result.ok) {
        setPushEnabled(true);
      } else {
        setPushMessage(
          result.reason === "permission_denied"
            ? "Notifications are blocked for this site in your browser settings -- enable them there, then try again."
            : result.reason === "unsupported"
            ? "Push notifications aren't supported on this browser/device."
            : "Couldn't enable push notifications -- please try again."
        );
      }
    }
    setPushBusy(false);
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  async function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }

  function open(n: any) {
    if (!n.read_at) markRead(n.id);
    if (n.match_id) router.push(`/matches#match-${n.match_id}`);
  }

  if (loading) return <p>Loading...</p>;
  if (!player) return <p>Please <a href="/login" className="underline">log in</a>.</p>;

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const visible = filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-court-green px-2 py-0.5 text-xs font-semibold text-white align-middle">
              {unreadCount} unread
            </span>
          )}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex rounded-md border border-stone-300 overflow-hidden">
            <button
              onClick={() => setFilter("all")}
              className={`px-2 py-1 ${filter === "all" ? "bg-court-green text-white" : "text-stone-600"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-2 py-1 ${filter === "unread" ? "bg-court-green text-white" : "text-stone-600"}`}
            >
              Unread
            </button>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-court-green underline">
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
        <span className="flex-1">
          {pushEnabled
            ? "Push notifications are on for this device."
            : "Get an alert on your phone the moment something happens -- turn on push notifications for this device."}
        </span>
        <button
          onClick={togglePush}
          disabled={pushBusy}
          className={`rounded-md px-3 py-1 text-sm disabled:opacity-50 ${
            pushEnabled ? "border border-stone-300 text-stone-700" : "bg-court-green text-white"
          }`}
        >
          {pushBusy ? "Working..." : pushEnabled ? "Turn off" : "Turn on push notifications"}
        </button>
      </div>
      {pushMessage && <p className="text-sm text-red-700">{pushMessage}</p>}

      {visible.length === 0 && (
        <p className="text-stone-500">
          {filter === "unread" ? "You're all caught up." : "No notifications yet."}
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((n) => (
          <li
            key={n.id}
            className={`rounded-md border p-3 ${n.read_at ? "border-stone-200 bg-white" : "border-court-green/40 bg-court-green/5"}`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => open(n)}
                className="flex flex-1 items-start gap-3 text-left"
              >
                <span className="text-lg leading-none">{TYPE_ICON[n.type] ?? "🔔"}</span>
                <span className="flex-1">
                  <span className={`block ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                  {n.body && <span className="block text-sm text-stone-500">{n.body}</span>}
                  <span className="mt-1 block text-xs text-stone-400">{new Date(n.created_at).toLocaleString()}</span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!n.read_at && <span className="h-2 w-2 rounded-full bg-court-green" title="Unread" />}
                <button
                  onClick={() => dismiss(n.id)}
                  className="text-xs text-stone-400 hover:text-red-700"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
