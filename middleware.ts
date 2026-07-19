// Refreshes the Supabase session cookies on every request. Reading
// auth.getUser() through a request-scoped client is what triggers a
// token refresh (and re-sets the cookies via the `set` callback below)
// when the access token has expired -- without this, sessions would
// silently stop working once the short-lived access token expires,
// even though the longer-lived refresh token is still good.
//
// (This file previously also contained a temporary testing feature
// that auto-logged visitors in as the manager when email sending was
// turned off. That's been removed -- passkeys now cover the "don't
// want to wait on an email every time" need for real, without an
// authentication bypass. See /login and /profile.)

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Runs on every page/API route except static assets and the cron
  // endpoint (which authenticates via CRON_SECRET, not a user
  // session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
