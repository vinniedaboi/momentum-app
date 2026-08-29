"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../icons";
import { apiMessage } from "../data/api";
import { studyApi } from "../data/endpoints";

export type PickableSubject = {
  key: string;
  name: string;
  qualification: string;
  syllabusCode: string | null;
  tone: string;
  source: "bundled" | "official" | "empty";
  topicCount: number;
  papers: number;
};

type Props = {
  subjects: PickableSubject[];
  defaultName: string;
  /** Resolved on the server: reading the clock during render is not allowed. */
  currentYear: number;
};

const QUALIFICATIONS = [
  "Cambridge International AS & A Level",
  "Cambridge IGCSE",
  "International A Level",
  "IB Diploma",
  "Other",
];

const MAX_SUBJECTS = 12;

export default function OnboardingFlow({ subjects, defaultName, currentYear }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(defaultName);
  const [qualification, setQualification] = useState(QUALIFICATIONS[0]);
  const [targetYear, setTargetYear] = useState(String(currentYear + 1));
  const [weeklyHours, setWeeklyHours] = useState("10");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const groups = useMemo(() => {
    const names: string[] = [];
    for (const subject of subjects) {
      if (!names.includes(subject.qualification)) names.push(subject.qualification);
    }
    return names;
  }, [subjects]);

  // Default the browsing tab to whatever the learner said they study.
  const [tab, setTab] = useState(() => groups.find((name) => name === qualification) ?? groups[0] ?? "");

  const byKey = useMemo(() => new Map(subjects.map((subject) => [subject.key, subject])), [subjects]);
  const chosen = selected.map((key) => byKey.get(key)).filter((subject) => subject !== undefined);
  const totalTopics = chosen.reduce((sum, subject) => sum + subject.topicCount, 0);
  const withSyllabus = chosen.filter((subject) => subject.topicCount > 0).length;

  // A search spans every qualification; otherwise the tab scopes the list.
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const pool = query ? subjects : subjects.filter((subject) => subject.qualification === tab);
    if (!query) return pool;
    return pool.filter((subject) =>
      subject.name.toLowerCase().includes(query) || (subject.syllabusCode ?? "").includes(query),
    );
  }, [subjects, tab, query]);

  function toggleSubject(key: string) {
    setError(null);
    setSelected((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key);
      if (current.length >= MAX_SUBJECTS) return current;
      return [...current, key];
    });
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

    try {
      await studyApi.onboarding.complete({
        fullName: fullName.trim(),
        qualification,
        targetYear: Number(targetYear),
        weeklyHoursTarget: Number(weeklyHours),
        subjectKeys: selected,
      });
    } catch (failure) {
      setError(apiMessage(failure, "Setup could not be completed."));
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
                onChange={(event) => {
                  setQualification(event.target.value);
                  if (groups.includes(event.target.value)) setTab(event.target.value);
                }}
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
            {subjects.length} subjects across {groups.length} qualifications. Ones
            with a syllabus arrive with every chapter and spec point loaded.
          </p>

          <div className="picker-controls">
            <div className="picker-tabs" role="tablist" aria-label="Qualification">
              {groups.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={!query && tab === name}
                  className={!query && tab === name ? "active" : ""}
                  onClick={() => { setTab(name); setSearch(""); }}
                >
                  {name}
                  <b>{subjects.filter((subject) => subject.qualification === name).length}</b>
                </button>
              ))}
            </div>

            <label className="picker-search">
              <Icon name="search" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search all subjects or a syllabus code"
                aria-label="Search subjects"
              />
            </label>
          </div>

          {chosen.length ? (
            <div className="picker-chips">
              {chosen.map((subject) => (
                <button
                  key={subject.key}
                  type="button"
                  className="picker-chip"
                  onClick={() => toggleSubject(subject.key)}
                  aria-label={`Remove ${subject.name}`}
                >
                  <i className={`subject-pin ${subject.tone}`} aria-hidden="true" />
                  {subject.name}
                  <Icon name="close" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="subject-picker">
            {visible.map((subject) => {
              const isSelected = selected.includes(subject.key);
              return (
                <button
                  key={subject.key}
                  type="button"
                  className="subject-option"
                  aria-pressed={isSelected}
                  disabled={!isSelected && selected.length >= MAX_SUBJECTS}
                  onClick={() => toggleSubject(subject.key)}
                >
                  <span className={`large-subject-pin ${subject.tone}`} aria-hidden="true" />
                  <span>
                    <strong>{subject.name}</strong>
                    <small>
                      {subject.syllabusCode ? `${subject.syllabusCode} · ` : ""}
                      {subject.papers ? `${subject.papers.toLocaleString("en-GB")} past papers` : "No papers yet"}
                    </small>
                    <em className={`syllabus-tag ${subject.source}`}>
                      {subject.topicCount
                        ? `${subject.topicCount.toLocaleString("en-GB")} syllabus rows`
                        : "Syllabus can be added later"}
                    </em>
                  </span>
                </button>
              );
            })}
            {!visible.length ? <p className="muted">No subjects match that search.</p> : null}
          </div>

          <p className="muted picker-count">
            {selected.length} of {MAX_SUBJECTS} selected
            {totalTopics ? ` · ${totalTopics.toLocaleString("en-GB")} syllabus rows will load` : ""}
          </p>
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
            <div>
              <span>Syllabus rows loading</span>
              <strong>
                {totalTopics.toLocaleString("en-GB")}
                {withSyllabus < chosen.length
                  ? ` · ${chosen.length - withSyllabus} subject${chosen.length - withSyllabus === 1 ? "" : "s"} without one yet`
                  : ""}
              </strong>
            </div>
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
