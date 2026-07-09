import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { IMPERSONATOR_COOKIE } from "@/lib/impersonation";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const managerEmail = cookies().get(IMPERSONATOR_COOKIE)?.value;

  if (!managerEmail) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: managerEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.redirect(`${origin}/login?error=switch_back_failed`);
  }

  const supabase = createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.redirect(`${origin}/login?error=switch_back_failed`);
  }

  cookies().delete(IMPERSONATOR_COOKIE);

  return NextResponse.redirect(`${origin}/admin`);
}
