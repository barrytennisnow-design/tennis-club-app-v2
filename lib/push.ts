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

  // Push test mode: same idea as email's sandbox_mode -- while on,
  // reroute every push to one chosen player's devices instead of the
  // real recipient's, with the title prefixed so it's obvious in
  // testing who it was really for. See migration_push_test_mode.sql.
  const { data: clubSettings } = await admin
    .from("club_settings")
    .select("push_test_mode, push_test_player_id")
    .single();
  const testModeOn = clubSettings?.push_test_mode === true && !!clubSettings?.push_test_player_id;

  let actualPlayerId = playerId;
  let actualTitle = title;
  if (testModeOn && clubSettings.push_test_player_id !== playerId) {
    const { data: realPlayer } = await admin.from("players").select("first_name, last_name").eq("id", playerId).maybeSingle();
    const realName = realPlayer ? `${realPlayer.first_name} ${realPlayer.last_name}` : "a player";
    actualPlayerId = clubSettings.push_test_player_id;
    actualTitle = `[TEST → ${realName}] ${title}`;
  }

  const { data: tokenRows } = await admin.from("fcm_tokens").select("token").eq("player_id", actualPlayerId);
  const tokens = (tokenRows ?? []).map((r: any) => r.token as string);
  if (tokens.length === 0) return;

  const messaging = getMessaging(firebaseApp);
  const staleTokens: string[] = [];

  await Promise.all(
    tokens.map(async (token: string) => {
      try {
        await messaging.send({
          token,
          notification: { title: actualTitle, body: body ?? "" },
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
