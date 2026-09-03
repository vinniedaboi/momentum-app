import { getStudySession, type StudySession } from "./auth";
import { isAdminEmail } from "./admin-emails";

/**
 * The gate in front of the operator console.
 *
 * Who counts as an operator is decided by lib/admin-emails.ts; this is only the
 * plumbing that asks it about the current request.
 */

export { adminEmails, isAdminEmail } from "./admin-emails";

/** The signed-in operator, or null for everyone else. Never throws. */
export async function getAdminSession(): Promise<StudySession | null> {
  const session = await getStudySession();
  return session && isAdminEmail(session.email) ? session : null;
}

/**
 * Runs a handler only for an operator.
 *
 * Answers 404 rather than 403, and says nothing about why: a 403 confirms the
 * console exists to anyone who guesses the path, and there is no reason to hand
 * that out. A signed-out request never reaches here — the proxy has already
 * turned it into a 401 — so the only case this covers is a real account that is
 * not on the list.
 */
export async function withAdmin(
  handler: (session: StudySession) => Promise<Response>,
): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return handler(session);
}
