import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Opt in to Supabase's (beta) native passkey support --
        // lets players register Face ID / fingerprint / device PIN
        // for instant login with no email needed afterward.
        experimental: { passkey: true },
      },
    }
  );
}
