import { redirect } from "next/navigation";
import { getStudySession } from "../lib/auth";
import { ensureProfile } from "../lib/profile-db";
import { landingStats } from "../lib/landing-stats";
import Landing from "./landing";
import StudyTrackerApp from "./study-tracker-app";

/**
 * The front door, and the onboarding gate behind it.
 *
 * Signed out, this is the marketing page — the one address a visitor is given
 * and the only one a search engine can index, so it cannot be a redirect to a
 * sign-in form. Signed in, it is the app, which is why the two live at the same
 * URL rather than the product hiding behind /app.
 *
 * Middleware handles "is there a session" for every private route; this handles
 * "has the account been set up", which needs a profile lookup and so is kept
 * out of the middleware path.
 */
export default async function Home() {
  const session = await getStudySession();
  if (!session) return <Landing stats={await landingStats()} />;

  const profile = await ensureProfile(session.workspaceId, session.email);
  if (!profile.onboardedAt) redirect("/onboarding");

  return <StudyTrackerApp />;
}
