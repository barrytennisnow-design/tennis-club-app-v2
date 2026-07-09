import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { sendEmail, accessLinkEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { player_id } = await request.json();

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
  const { data: player } = await admin
    .from("players")
    .select("id, first_name, email, access_token")
    .eq("id", player_id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const accessUrl = `${siteUrl}/access/${player.access_token}`;

  const { subject, html } = accessLinkEmail({ firstName: player.first_name, accessUrl });
  const result = await sendEmail({ supabaseAdmin: admin, to: player.email, subject, html });

  return NextResponse.json({ ok: true, accessUrl, emailStatus: result.status });
}
