import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStudySession } from "../../lib/auth";
import { ensureProfile } from "../../lib/profile-db";
import { availableOnboardingSubjects } from "../../lib/onboarding-catalogue";
import OnboardingFlow from "./onboarding-flow";
import SiteFooter from "../site-footer";

export const metadata: Metadata = {
  title: "Set up your tracker · Momentum",
};

/**
 * Setup, and a way to walk back through it after it is done.
 *
 * An account that finished setup is bounced to the app, because running the
 * real flow again would create a second copy of every subject. `?preview=1`
 * opens the same screens with the last step disarmed instead: it is the one
 * explanation of the loop a learner sees before they have anything to look at,
 * and there was no way back to it. The guide links here.
 *
 * The preview writes nothing at all, which is what makes it safe to offer to
 * everyone rather than to a list of accounts — there is no state for it to
 * damage, so there is nothing to gate.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const session = await getStudySession();
  if (!session) redirect("/login");

  const profile = await ensureProfile(session.workspaceId, session.email);
  const preview = (await searchParams).preview === "1";
  if (profile.onboardedAt && !preview) redirect("/");

  // Trimmed to what the picker renders; the server re-resolves the full record
  // from the key when the form is submitted.
  const subjects = (await availableOnboardingSubjects()).map((subject) => ({
    key: subject.key,
    name: subject.name,
    qualification: subject.qualification,
    syllabusCode: subject.syllabusCode,
    tone: subject.tone,
    source: subject.source,
    topicCount: subject.topicCount,
    papers: subject.papers,
  }));

  return (
    <main className="onboarding-shell">
      <OnboardingFlow
        subjects={subjects}
        defaultName={profile.fullName ?? ""}
        currentYear={new Date().getFullYear()}
        preview={preview && Boolean(profile.onboardedAt)}
      />
      <SiteFooter />
    </main>
  );
}
