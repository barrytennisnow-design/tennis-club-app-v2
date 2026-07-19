// Server-side FCM sending via firebase-admin. Requires the
// FIREBASE_SERVICE_ACCOUNT_JSON environment variable to be set (the
// full contents of the service account JSON file downloaded from
// Firebase console -> Project settings -> Service accounts ->
// Generate new private key), pasted as a single-line string. Set it
// in Vercel's project environment variables, never committed to the
// repo.
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let app: App | null | undefined; // undefined = not yet attempted, null = attempted and unavailable

function getFirebaseAdminApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    app = null;
    return app;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    console.error("push: FIREBASE_SERVICE_ACCOUNT_JSON is set but couldn't be parsed", error);
    app = null;
  }
  return app;
}

// Fans a single event out to every device token this player has
// registered. Deliberately tolerant of partial failure: a bad/expired
// token for one device shouldn't stop the send to the player's other
// devices, and never throws back to the caller -- see the same
// "never block the paired email/notification write" posture as
// lib/notifications.ts.
export async function sendPushToPlayer({
  admin,
  playerId,
  title,
  body,
  matchId,
}: {
  admin: any; // Supabase admin client
  playerId: string;
  title: string;
  body?: string | null;
  matchId?: string | null;
}) {
  const firebaseApp = getFirebaseAdminApp();
  if (!firebaseApp) return; // Push not configured yet -- notifications-table write already happened, that's fine on its own.

  const { data: tokenRows } = await admin.from("fcm_tokens").select("token").eq("player_id", playerId);
  const tokens = (tokenRows ?? []).map((r: any) => r.token as string);
  if (tokens.length === 0) return;

  const messaging = getMessaging(firebaseApp);
  const staleTokens: string[] = [];

  await Promise.all(
    tokens.map(async (token: string) => {
      try {
        await messaging.send({
          token,
          notification: { title, body: body ?? "" },
          data: { matchId: matchId ?? "" },
          webpush: { fcmOptions: { link: matchId ? `/matches#match-${matchId}` : "/notifications" } },
        });
      } catch (error: any) {
        // These two codes mean the token is permanently dead (app
        // uninstalled, browser data cleared, token rotated out) --
        // anything else (rate limit, transient network error) is
        // left alone and just gets retried on the next event.
        if (error?.code === "messaging/registration-token-not-registered" || error?.code === "messaging/invalid-registration-token") {
          staleTokens.push(token);
        } else {
          console.error("push: send failed", error?.code ?? error);
        }
      }
    })
  );

  if (staleTokens.length > 0) {
    await admin.from("fcm_tokens").delete().in("token", staleTokens);
  }
}
