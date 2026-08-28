import { redirect } from "next/navigation";
import { getStudySession } from "../lib/auth";
import { ensureProfile } from "../lib/profile-db";
import StudyTrackerApp from "./study-tracker-app";

/**
 * The onboarding gate. Middleware handles "is there a session"; this handles
 * "has the account been set up", which needs a profile lookup and so is kept
 * out of the middleware path.
 */
export default async function Home() {
  const session = await getStudySession();
  if (!session) redirect("/login");

  const profile = await ensureProfile(session.workspaceId, session.email);
  if (!profile.onboardedAt) redirect("/onboarding");

  return <StudyTrackerApp />;
}
