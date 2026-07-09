// Legacy/imported players (loaded via import_roster.sql) start with
// auth_user_id = null -- they've never actually logged in for real.
// Normally, the FIRST real login (via /auth/callback, after clicking
// an actual email link) links their players row to their new auth
// account automatically.
//
// But shortcuts like "Log in as (test)" and the bookmarkable
// /access/<token> link create a valid session directly, bypassing
// /auth/callback -- so without this helper, that link never happens,
// and the player's own profile page can't find their data.
//
// Call this right after any successful generateLink+verifyOtp, for
// any of these shortcut login paths.
export async function ensurePlayerAuthLinked(admin: any, playerId: string, authUserId: string) {
  const { data: player } = await admin
    .from("players")
    .select("auth_user_id")
    .eq("id", playerId)
    .single();

  if (player && !player.auth_user_id) {
    await admin.from("players").update({ auth_user_id: authUserId }).eq("id", playerId);
  }
}
