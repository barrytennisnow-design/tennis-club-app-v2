// Shared status badge styling for match status (draft / proposed /
// confirmed / cancelled) so the Match Matrix and Matches Tracking
// pages stay visually consistent.
export const MATCH_STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-200 text-stone-700",
  proposed: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export function matchStatusLabel(status: string | null | undefined): string {
  return (status ?? "").toUpperCase();
}
