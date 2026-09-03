import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminSession } from "../../lib/admin";
import { getAdminAccounts, getAdminActivity } from "../../lib/admin-db";
import AdminConsole from "../admin-console";

/**
 * The operator console.
 *
 * Not part of the product: it has no entry in the app's navigation and nothing
 * links to it, because the only person who needs it already knows the address.
 * An account that is not on the `ADMIN_EMAILS` list gets the same 404 a
 * misspelled URL gets — a 403 would confirm the page exists, and there is no
 * reason to hand that out to anyone who guesses.
 *
 * Rendered per request. A cached admin page is one that either serves stale
 * activity or, far worse, serves one operator's render to whoever asks next.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Console · Momentum",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) notFound();

  // Sequentially, not with Promise.all: on Vercel the pool holds one connection
  // and concurrent queries on it after the first deadlock silently. See lib/db.
  const accounts = await getAdminAccounts();
  const initial = await getAdminActivity();

  return <AdminConsole accounts={accounts} initial={initial} operator={session.email} />;
}
