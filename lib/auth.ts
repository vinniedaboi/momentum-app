import { createSupabaseServerClient } from "./supabase/server";

export type StudySession = {
  /** The Supabase user id, which is also the workspace id on every table. */
  workspaceId: string;
  email: string | null;
};

/** The signed-in user, or null. Never throws, so pages can branch on it. */
export async function getStudySession(): Promise<StudySession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { workspaceId: user.id, email: user.email ?? null };
}

/**
 * Runs a route handler with the caller's workspace id, answering 401 when there
 * is no session. Middleware already blocks anonymous requests; this is the
 * second gate that keeps a handler from ever running unscoped.
 */
export async function withWorkspace(
  handler: (workspaceId: string) => Promise<Response>,
): Promise<Response> {
  const session = await getStudySession();
  if (!session) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  return handler(session.workspaceId);
}
