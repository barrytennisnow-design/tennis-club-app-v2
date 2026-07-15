import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { generateMatches } from "@/lib/matching";
import { hasPermission, numericPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const { startDate, endDate } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("players")
    .select("role, permissions")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (!hasPermission(me, "matrix_generate")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const resolvedStart = startDate || new Date().toISOString().slice(0, 10);
  let resolvedEnd = endDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Captains can be capped to "may generate up to N days ahead" --
  // managers are unlimited. Clamp server-side; never trust a date
  // range the client happened to send.
  const maxDaysAhead = numericPermission(me, "matrix_generate_days_ahead");
  if (maxDaysAhead !== Infinity) {
    const cap = new Date();
    cap.setDate(cap.getDate() + maxDaysAhead);
    const capStr = cap.toISOString().slice(0, 10);
    if (resolvedEnd > capStr) resolvedEnd = capStr;
  }

  const admin = createAdminClient();
  const results = await generateMatches({
    supabaseAdmin: admin,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });

  return NextResponse.json({ ok: true, results });
}
