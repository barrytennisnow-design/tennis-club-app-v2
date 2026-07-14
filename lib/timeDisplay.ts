// A match's `time_slot` column is a legacy internal label ("morning",
// "evening", etc.) -- never the right thing to show a player. The
// actual human-readable time ("8:00am warmup, 8:15am start play")
// lives on `time_display` when the manager overrode it for a specific
// match, otherwise it falls back to whatever time slot is currently
// flagged as default on the Manager Settings page. Emails, the .ics
// file, and every player-facing screen should all resolve time the
// same way -- this is the one place that logic lives.

export async function getDefaultTimeDisplay(supabaseAdmin: any): Promise<string> {
  const { data } = await supabaseAdmin
    .from("time_slots")
    .select("description")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  return data?.description ?? "";
}

export function resolveTimeDisplay(
  match: { time_display?: string | null },
  defaultDisplay: string
): string {
  return match.time_display || defaultDisplay || "Time TBD";
}
