import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { linkOrCreatePlayerForNewLogin } from "@/lib/linkPlayerAuth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/matches";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Uses the admin client because RLS rightly blocks a user from
      // touching a players row they don't yet own.
      const admin = createAdminClient();
      await linkOrCreatePlayerForNewLogin(admin, data.user);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
