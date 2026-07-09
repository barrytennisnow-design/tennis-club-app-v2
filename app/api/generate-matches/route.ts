import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { generateMatches } from "@/lib/matching";

export async function POST(request: Request) {
  const { startDate, endDate } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("players")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results = await generateMatches({
    supabaseAdmin: admin,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    endDate: endDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });

  return NextResponse.json({ ok: true, results });
}
