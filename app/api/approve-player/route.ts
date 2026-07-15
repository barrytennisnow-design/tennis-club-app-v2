import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { hasPermission } from "@/lib/permissions";

export async function POST(request: Request) {
  const body = await request.json();
  const { player_id, ranking, decline } = body;

  // Verify the caller is authorized before doing anything.
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("players")
    .select("id, role, permissions")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (!me || !hasPermission(me, "roster_add_player")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  if (decline) {
    const { error } = await admin
      .from("players")
      .update({ status: "declined" })
      .eq("id", player_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin
    .from("players")
    .update({
      status: "active",
      ranking: ranking,
      approved_at: new Date().toISOString(),
      approved_by: me.id,
    })
    .eq("id", player_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
