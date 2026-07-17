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

// The FIRST real login for a brand new auth user (regardless of
// whether they got there by clicking the email link or typing the
// 6-digit code) needs to either link them to an existing legacy/
// imported players row by email, or create a new "pending" row from
// their signup data. Shared by /auth/callback (link-click path) and
// /api/auth/complete-code-login (type-the-code path) so both do
// exactly the same thing.
export async function linkOrCreatePlayerForNewLogin(admin: any, user: { id: string; email?: string; user_metadata?: any }) {
  const { data: existingByAuth } = await admin
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existingByAuth) return;

  const { data: existingByEmail } = await admin
    .from("players")
    .select("id, auth_user_id")
    .eq("email", user.email)
    .maybeSingle();

  if (existingByEmail && !existingByEmail.auth_user_id) {
    // Legacy/imported player logging in for the first time -- link
    // their new auth account instead of creating a duplicate.
    await admin.from("players").update({ auth_user_id: user.id }).eq("id", existingByEmail.id);
  } else if (!existingByEmail) {
    const pendingRaw = user.user_metadata?.pending_signup;
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

    await admin.from("players").insert({
      auth_user_id: user.id,
      email: user.email,
      first_name: pending?.first_name ?? "",
      last_name: pending?.last_name ?? "",
      phone: pending?.phone ?? null,
      address: pending?.address ?? null,
      city: pending?.city ?? null,
      state: pending?.state ?? null,
      zip: pending?.zip ?? null,
      self_reported_ranking: pending?.self_reported_ranking ?? null,
      days_per_week: pending?.days_per_week ?? null,
      days_in_a_row: pending?.days_in_a_row ?? null,
      notes: pending?.notes ?? null,
      status: "pending",
    });
  }
}
