"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type StarterSubject = {
  id: string;
  name: string;
  tone: string;
  syllabusCode: string | null;
  qualification: string | null;
  topicCount: number;
};

type Props = {
  starterSubjects: StarterSubject[];
  defaultName: string;
  /** Resolved on the server: reading the clock during render is not allowed. */
  currentYear: number;
};

const QUALIFICATIONS = [
  "Cambridge International AS & A Level",
  "Cambridge IGCSE",
  "Edexcel International A Level",
  "IB Diploma",
  "Other",
];

export default function OnboardingFlow({ starterSubjects, defaultName, currentYear }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(defaultName);
  const [qualification, setQualification] = useState(QUALIFICATIONS[0]);
  const [targetYear, setTargetYear] = useState(String(currentYear + 1));
  const [weeklyHours, setWeeklyHours] = useState("10");
  const [selected, setSelected] = useState<string[]>(["mathematics", "physics"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const chosen = starterSubjects.filter((subject) => selected.includes(subject.id));
  const totalTopics = chosen.reduce((sum, subject) => sum + subject.topicCount, 0);

  function toggleSubject(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function goNext() {
    setError(null);
    if (step === 0 && !fullName.trim()) {
      setError("Tell us what to call you.");
      return;
    }
    if (step === 1 && !selected.length) {
      setError("Pick at least one subject to track.");
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  async function finish() {
    setPending(true);
    setError(null);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        qualification,
        targetYear: Number(targetYear),
        weeklyHoursTarget: Number(weeklyHours),
        subjectIds: selected,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Setup could not be completed." }));
      setError(body.error ?? "Setup could not be completed.");
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="onboarding-card">
      <div className="onboarding-steps" aria-hidden="true">
        <span className={step >= 0 ? "done" : ""} />
        <span className={step >= 1 ? "done" : ""} />
        <span className={step >= 2 ? "done" : ""} />
      </div>

      {error ? <p className="auth-alert error">{error}</p> : null}

      {step === 0 ? (
        <>
          <h2>First, the basics</h2>
          <p className="muted">
            These set your defaults. You can change any of them later in settings.
          </p>

          <div className="onboarding-grid">
            <div className="auth-field">
              <label htmlFor="fullName">Your name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Alex Tan"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="qualification">Qualification</label>
              <select
                id="qualification"
                value={qualification}
                onChange={(event) => setQualification(event.target.value)}
              >
                {QUALIFICATIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="auth-field">
              <label htmlFor="targetYear">Exam year</label>
              <select
                id="targetYear"
                value={targetYear}
                onChange={(event) => setTargetYear(event.target.value)}
              >
                {[currentYear, currentYear + 1, currentYear + 2].map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
            </div>

            <div className="auth-field">
              <label htmlFor="weeklyHours">Study hours per week</label>
              <input
                id="weeklyHours"
                type="number"
                min={1}
                max={80}
                value={weeklyHours}
                onChange={(event) => setWeeklyHours(event.target.value)}
              />
              <small>Used to pace your syllabus goals.</small>
            </div>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h2>Which subjects are you tracking?</h2>
          <p className="muted">
            Each one arrives with its full syllabus tree — every chapter and spec
            point, ready to mark off.
          </p>

          <div className="subject-picker">
            {starterSubjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                className="subject-option"
                aria-pressed={selected.includes(subject.id)}
                onClick={() => toggleSubject(subject.id)}
              >
                <span className={`large-subject-pin ${subject.tone}`} aria-hidden="true" />
                <span>
                  <strong>{subject.name}</strong>
                  <small>
                    {subject.syllabusCode ? `${subject.syllabusCode} · ` : ""}
                    {subject.topicCount
                      ? `${subject.topicCount} syllabus rows`
                      : "Blank subject, add your own topics"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h2>Ready to go</h2>
          <p className="muted">We will set your workspace up with this.</p>

          <div className="onboarding-summary">
            <div><span>Name</span><strong>{fullName}</strong></div>
            <div><span>Qualification</span><strong>{qualification}</strong></div>
            <div><span>Exam year</span><strong>{targetYear}</strong></div>
            <div><span>Weekly hours</span><strong>{weeklyHours}</strong></div>
            <div>
              <span>Subjects</span>
              <strong>{chosen.map((subject) => subject.name).join(", ") || "None"}</strong>
            </div>
            <div><span>Syllabus rows loaded</span><strong>{totalTopics.toLocaleString("en-GB")}</strong></div>
          </div>
        </>
      ) : null}

      <div className="onboarding-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || pending}
        >
          Back
        </button>

        {step < 2 ? (
          <button type="button" className="auth-submit" onClick={goNext}>
            Continue
          </button>
        ) : (
          <button type="button" className="auth-submit" onClick={finish} disabled={pending}>
            {pending ? "Building your tracker…" : "Finish setup"}
          </button>
        )}
      </div>
    </div>
  );
}
