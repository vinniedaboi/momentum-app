"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client, used by the sign-in and sign-up forms. It only
 * ever holds the publishable key; row level security is what makes that safe.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
