import { NextResponse } from "next/server";
<<<<<<< HEAD
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { match_id, time_display } = await request.json();

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: me } = await supabase.from("players").select("role").eq("auth_user_id", userData.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const admin = createAdminClient();
  const { data: match } = await admin.from("matches").select("id, status").eq("id", match_id).single();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "draft") {
    return NextResponse.json({ error: "Can only change time on a draft match" }, { status: 400 });
  }

  const { error } = await admin
    .from("matches")
    .update({ time_display: time_display || null })
    .eq("id", match_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
=======
import { createClient } from "@/lib/supabaseServer"; // Adjust this import path if needed to match your project

export async function POST(req: Request) {
  try {
    const { match_id, time_display } = await req.json();

    if (!match_id) {
      return NextResponse.json({ ok: false, error: "Match ID is required" }, { status: 400 });
    }

    const finalTimeValue = time_display === "" ? null : time_display;
    const supabase = createClient(); 

    const { error } = await supabase
      .from("matches")
      .update({ time_display: finalTimeValue })
      .eq("id", match_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
>>>>>>> 26503340298a3c9481470710dae500ba14fdd7d3
