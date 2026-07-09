import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabaseServer";
import { IMPERSONATOR_COOKIE } from "../impersonate/route";

export async function POST() {
  const managerEmail = cookies().get(IMPERSONATOR_COOKIE)?.value;
  if (!managerEmail) {
    return NextResponse.json({ error: "Not currently impersonating anyone" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: managerEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: linkError?.message || "Could not generate session" }, { status: 500 });
  }

  const supabase = createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  cookies().delete(IMPERSONATOR_COOKIE);

  return NextResponse.json({ ok: true });
}
