import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStudySession } from "../../lib/auth";
import { ensureProfile } from "../../lib/profile-db";
import { STARTER_SUBJECTS } from "../../lib/subjects-db";
import { templateTopicCount } from "../../lib/topics-db";
import OnboardingFlow from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Set up your tracker · Momentum",
};

export default async function OnboardingPage() {
  const session = await getStudySession();
  if (!session) redirect("/login");

  const profile = await ensureProfile(session.workspaceId, session.email);
  if (profile.onboardedAt) redirect("/");

  const starterSubjects = STARTER_SUBJECTS.map((subject) => ({
    id: subject.id,
    name: subject.name,
    tone: subject.tone,
    syllabusCode: subject.syllabusCode,
    qualification: subject.qualification,
    topicCount: templateTopicCount(subject.id),
  }));

  return (
    <main className="onboarding-shell">
      <OnboardingFlow
        starterSubjects={starterSubjects}
        defaultName={profile.fullName ?? ""}
        currentYear={new Date().getFullYear()}
      />
    </main>
  );
}
