// TEMPORARY TESTING FEATURE -- this setting, and every place that
// checks it, is meant to be removed before the system goes live for
// real. It exists purely to make manual testing convenient (fewer
// emails to click through) while nothing here is being used for
// real club data yet.

export type EmailTestModeSettings = {
  sendToFirstOnly: boolean;
};

export async function getEmailTestModeSettings(admin: any): Promise<EmailTestModeSettings> {
  const { data } = await admin
    .from("club_settings")
    .select("email_test_mode_send_to_first_only")
    .single();
  return {
    sendToFirstOnly: data?.email_test_mode_send_to_first_only === true,
  };
}

// Given a list of match_players-style rows already ordered by
// created_at (oldest/first-inserted first), returns either the full
// list or just the first entry, depending on the setting. "First"
// means whoever was actually listed first when the match was
// created (by insertion order), not alphabetical or any other sort.
export function applyFirstOnlyFilter<T>(rows: T[], testMode: EmailTestModeSettings): T[] {
  if (!testMode.sendToFirstOnly) return rows;
  return rows.slice(0, 1);
}
