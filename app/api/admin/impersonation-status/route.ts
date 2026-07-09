import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabaseServer";
import { IMPERSONATOR_COOKIE } from "../impersonate/route";

export async function GET() {
  const managerEmail = cookies().get(IMPERSONATOR_COOKIE)?.value;
  if (!managerEmail) {
    return NextResponse.json({ impersonating: false });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const currentEmail = userData.user?.email ?? null;

  return NextResponse.json({
    impersonating: true,
    managerEmail,
    currentlyViewingAs: currentEmail,
  });
}
