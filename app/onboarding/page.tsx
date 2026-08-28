import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStudySession } from "../../lib/auth";
import { ensureProfile } from "../../lib/profile-db";
import { availableOnboardingSubjects } from "../../lib/onboarding-catalogue";
import OnboardingFlow from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Set up your tracker · Momentum",
};

export default async function OnboardingPage() {
  const session = await getStudySession();
  if (!session) redirect("/login");

  const profile = await ensureProfile(session.workspaceId, session.email);
  if (profile.onboardedAt) redirect("/");

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
      />
    </main>
  );
}
