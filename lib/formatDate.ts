// Consistent date display across the whole app: "6-17-26" style
// (M-D-YY, no leading zeros) instead of ISO "2026-6-17" or any
// locale-dependent format.
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `${m}-${day}-${yy}`;
}

export function formatShortDateWithWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${formatShortDate(dateStr)}`;
}

export function formatLongDateWithWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday}, ${formatShortDate(dateStr)}`;
}
