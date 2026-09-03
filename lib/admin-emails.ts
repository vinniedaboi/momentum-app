/**
 * Who is allowed to open the operator console.
 *
 * An allowlist of email addresses in the environment rather than a flag on
 * `profiles`, for two reasons. Being an admin is a property of whoever runs the
 * service, not of an account inside it — nobody signs up and becomes one. And a
 * column is one UPDATE away from being granted by anything that can write to
 * the profiles table, whereas the environment is only reachable by someone who
 * can already deploy.
 *
 * Unset means nobody, never everybody. A console that opens itself because a
 * variable was forgotten in a new environment is worse than one that never
 * opens at all, and the failure lands in exactly the right place: the operator
 * notices immediately, and nobody else ever sees it.
 *
 * Kept apart from the session helpers in lib/admin.ts so the rule itself can be
 * tested as what it is — a pure decision about a string — without dragging in
 * Supabase and Next's request context to ask it.
 */

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Case and stray whitespace are the operator's typing, not a different person. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails();
  return allowed.length > 0 && allowed.includes(email.trim().toLowerCase());
}
