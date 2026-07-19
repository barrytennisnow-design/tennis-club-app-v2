import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Opts in to Supabase's experimental passkey (WebAuthn) API --
        // required for auth.signInWithPasskey() / auth.registerPasskey()
        // to exist on the client. See /login and /profile.
        experimental: { passkey: true },
      },
    }
  );
}
