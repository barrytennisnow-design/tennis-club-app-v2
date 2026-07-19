// Writes rows into the `notifications` table (see
// supabase/migration_notifications.sql) so every email-worthy event
// also lands in a player's in-app inbox. Called right alongside the
// existing sendEmail() at each event site, reusing the same
// subject/summary text so the inbox and the email always agree.
//
// Deliberately fire-and-forget-tolerant: a notification write failing
// should never block or fail the email send it's paired with, so
// every call site wraps this in the same "don't let this throw"
// posture -- errors are swallowed here rather than bubbled up.
export type NotificationType = "match_proposed" | "match_confirmed" | "match_cancelled" | "match_reminder";

export async function notifyPlayer({
  admin,
  playerId,
  type,
  title,
  body,
  matchId,
}: {
  admin: any;
  playerId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  matchId?: string | null;
}) {
  try {
    await admin.from("notifications").insert({
      player_id: playerId,
      type,
      title,
      body: body ?? null,
      match_id: matchId ?? null,
    });
  } catch {
    // Swallow -- see file header. The email already sent (or is about
    // to); a missing inbox row isn't worth failing the request over.
  }
}

// Same event, many recipients -- the common case at every call site.
export async function notifyPlayers({
  admin,
  playerIds,
  type,
  title,
  body,
  matchId,
}: {
  admin: any;
  playerIds: string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  matchId?: string | null;
}) {
  if (playerIds.length === 0) return;
  try {
    await admin.from("notifications").insert(
      playerIds.map((playerId) => ({
        player_id: playerId,
        type,
        title,
        body: body ?? null,
        match_id: matchId ?? null,
      }))
    );
  } catch {
    // Swallow -- see file header.
  }
}
