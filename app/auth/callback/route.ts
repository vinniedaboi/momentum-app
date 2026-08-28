import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { requestOrigin } from "../../../lib/request-origin";

export const runtime = "nodejs";

/**
 * Lands the email confirmation link. Supabase appends a one-time `code`, which
 * is exchanged here for the session cookies the rest of the app reads.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
