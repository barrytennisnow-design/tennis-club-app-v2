import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // If this is the player's first login, either link this auth
      // account to an existing (e.g. imported legacy) row by email,
      // or create a brand-new row from signup data. Uses the admin
      // client because RLS rightly blocks a user from touching a
      // players row they don't yet own.
      const admin = createAdminClient();

      const { data: existingByAuth } = await admin
        .from("players")
        .select("id")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (!existingByAuth) {
        const { data: existingByEmail } = await admin
          .from("players")
          .select("id, auth_user_id")
          .eq("email", data.user.email)
          .maybeSingle();

        if (existingByEmail && !existingByEmail.auth_user_id) {
          // Legacy/imported player logging in for the first time —
          // link their new auth account instead of creating a duplicate.
          await admin
            .from("players")
            .update({ auth_user_id: data.user.id })
            .eq("id", existingByEmail.id);
        } else if (!existingByEmail) {
          const pendingRaw = data.user.user_metadata?.pending_signup;
          const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

          await admin.from("players").insert({
            auth_user_id: data.user.id,
            email: data.user.email,
            first_name: pending?.first_name ?? "",
            last_name: pending?.last_name ?? "",
            phone: pending?.phone ?? null,
            address: pending?.address ?? null,
            city: pending?.city ?? null,
            state: pending?.state ?? null,
            zip: pending?.zip ?? null,
            self_reported_ranking: pending?.self_reported_ranking ?? null,
            days_per_week: pending?.days_per_week ?? null,
            days_in_a_row: pending?.days_in_a_row ?? null,
            notes: pending?.notes ?? null,
            status: "pending",
          });
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
