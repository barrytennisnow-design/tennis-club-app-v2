// Single source of truth for what a captain can be granted. Mirrors
// has_permission() in migration_captains.sql -- if you add a key
// here, add the matching enforcement in that migration too (either
// a route-level check using hasPermission() below, or a DB
// trigger/policy for anything editable via a direct client call).

export type PermissionKey =
  | "roster_add_player"
  | "roster_change_ranking"
  | "roster_change_status"
  | "roster_send_link"
  | "roster_view_email_log"
  | "roster_change_self_serve_optin"
  | "matrix_generate"
  | "matrix_swap_players"
  | "matrix_change_time"
  | "matrix_change_court"
  | "matrix_propose_match"
  | "matrix_cancel_match"
  | "settings_add_court"
  | "settings_delete_court"
  | "settings_change_default_court"
  | "settings_edit_court"
  | "settings_add_time"
  | "settings_delete_time"
  | "settings_change_default_time"
  | "settings_edit_time"
  | "settings_change_self_serve_window"
  | "matches_change_timeout"
  | "matches_change_nudge_count";

// The two "how many days" caps aren't yes/no -- they're numbers
// stored in the same permissions JSON, keyed separately so the
// Permissions page can render them as number inputs instead of
// toggles.
export type NumericPermissionKey = "matrix_generate_days_ahead" | "matrix_display_days_ahead";

export const PERMISSION_GROUPS: { group: string; permissions: { key: PermissionKey; label: string }[] }[] = [
  {
    group: "Roster",
    permissions: [
      { key: "roster_add_player", label: "Add / approve players" },
      { key: "roster_change_ranking", label: "Change player ranking" },
      { key: "roster_change_status", label: "Change player status" },
      { key: "roster_send_link", label: "Send access link" },
      { key: "roster_view_email_log", label: "View email log" },
      { key: "roster_change_self_serve_optin", label: "Change self-serve opt-in" },
    ],
  },
  {
    group: "Match Matrix",
    permissions: [
      { key: "matrix_generate", label: "Generate match matrix" },
      { key: "matrix_swap_players", label: "Swap two players" },
      { key: "matrix_change_time", label: "Change match time" },
      { key: "matrix_change_court", label: "Change match court" },
      { key: "matrix_propose_match", label: "Propose match" },
      { key: "matrix_cancel_match", label: "Cancel match" },
    ],
  },
  {
    group: "Settings",
    permissions: [
      { key: "settings_add_court", label: "Add / clone court" },
      { key: "settings_delete_court", label: "Delete court" },
      { key: "settings_change_default_court", label: "Change default court" },
      { key: "settings_edit_court", label: "Edit court (name / address / order)" },
      { key: "settings_add_time", label: "Add / clone time slot" },
      { key: "settings_delete_time", label: "Delete time slot" },
      { key: "settings_change_default_time", label: "Change default time slot" },
      { key: "settings_edit_time", label: "Edit time slot (name / description / order)" },
      { key: "settings_change_self_serve_window", label: "Change self-serve window" },
    ],
  },
  {
    group: "Matches Page",
    permissions: [
      { key: "matches_change_timeout", label: "Change match auto-cancel timeout" },
      { key: "matches_change_nudge_count", label: "Change match nudge count" },
    ],
  },
];

export const NUMERIC_PERMISSIONS: { key: NumericPermissionKey; label: string; group: string }[] = [
  { key: "matrix_generate_days_ahead", label: "May generate up to this many days ahead", group: "Match Matrix" },
  { key: "matrix_display_days_ahead", label: "May view up to this many days ahead", group: "Match Matrix" },
];

type PermissionsRecord = Record<string, boolean | number | undefined>;
export interface PermissionCheckable {
  role: string;
  permissions?: PermissionsRecord | null;
}

export function hasPermission(me: PermissionCheckable | null | undefined, key: PermissionKey): boolean {
  if (!me) return false;
  if (me.role === "manager") return true;
  if (me.role === "captain") return me.permissions?.[key] === true;
  return false;
}

// For the two numeric caps -- managers are unlimited (Infinity);
// a captain without the key granted gets 0 (i.e. can't use the
// feature at all until a manager sets a cap).
export function numericPermission(me: PermissionCheckable | null | undefined, key: NumericPermissionKey): number {
  if (!me) return 0;
  if (me.role === "manager") return Infinity;
  if (me.role === "captain") {
    const v = me.permissions?.[key];
    return typeof v === "number" ? v : 0;
  }
  return 0;
}
