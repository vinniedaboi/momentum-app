import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { requestOrigin } from "../../../lib/request-origin";

export const runtime = "nodejs";

/** POST-only: a GET would let any embedded image sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${requestOrigin(request)}/login`, { status: 303 });
}
