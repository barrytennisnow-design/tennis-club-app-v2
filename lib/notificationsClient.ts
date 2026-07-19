"use client";

import { getToken, onMessage, deleteToken } from "firebase/messaging";
import { getFirebaseMessaging } from "./firebaseClient";
import { createClient } from "./supabaseClient";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "permission_denied" | "no_token" | "not_logged_in" | "error"; error?: unknown };

// Call from a button click (not on page load) -- browsers require a
// user gesture before they'll show the native "Allow notifications?"
// permission prompt at all.
export async function enablePush(): Promise<PushEnableResult> {
  const messaging = await getFirebaseMessaging();
  if (!messaging || !VAPID_KEY) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission_denied" };

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: "no_token" };

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { ok: false, reason: "not_logged_in" };
    const { data: me } = await supabase.from("players").select("id").eq("auth_user_id", userData.user.id).single();
    if (!me) return { ok: false, reason: "not_logged_in" };

    // upsert-by-hand: token has a unique constraint, so re-enabling on
    // the same device is a harmless no-op rather than a duplicate row.
    await supabase.from("fcm_tokens").upsert({ player_id: me.id, token }, { onConflict: "token" });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "error", error };
  }
}

export async function disablePush(): Promise<void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging || !VAPID_KEY) return;
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      const supabase = createClient();
      await supabase.from("fcm_tokens").delete().eq("token", token);
      await deleteToken(messaging);
    }
  } catch {
    // Best-effort -- if this fails the token just goes stale and
    // lib/push.ts cleans it up server-side the next time a send to
    // it fails.
  }
}

export async function isPushEnabledOnThisDevice(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

// Foreground messages (app open and focused) don't need an OS-level
// notification -- the person's already looking at the app, so this
// just re-fetches whatever's already listening for unread-count
// changes rather than popping a redundant system alert on top of the
// page they're already on.
export async function listenForForegroundPush(onMessageReceived: () => void) {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, () => onMessageReceived());
}
