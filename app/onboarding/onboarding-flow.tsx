"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "../icons";
import { CORE_LOOP, STATUS_GUIDE } from "../guide-content";
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

/** A subject, and every board that teaches it. */
type SubjectGroup = { name: string; options: PickableSubject[] };

const MAX_SUBJECTS = 12;
const LAST_STEP = 3;

export default function OnboardingFlow({ subjects, defaultName, currentYear }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(defaultName);
  const [boards, setBoards] = useState<string[]>([]);
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

  const byKey = useMemo(() => new Map(subjects.map((subject) => [subject.key, subject])), [subjects]);
  const chosen = selected.map((key) => byKey.get(key)).filter((subject) => subject !== undefined);
  const chosenBoards = [...new Set(chosen.map((subject) => subject.qualification))];
  const totalTopics = chosen.reduce((sum, subject) => sum + subject.topicCount, 0);
  const withSyllabus = chosen.filter((subject) => subject.topicCount > 0).length;

  /**
   * One card per subject, listing the boards that teach it.
   *
   * A subject and its board are two answers, and asking for them as one is what
   * left a learner with three OCR subjects when only two of theirs are OCR. So
   * the card is the subject — English Literature — and the buttons on it are the
   * boards that offer it, narrowed to the ones the learner named. A search
   * ignores that narrowing, because looking something up is not the same as
   * saying you study it.
   */
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const pool = subjects.filter((subject) =>
      (query || !boards.length || boards.includes(subject.qualification))
      && (!query
        || subject.name.toLowerCase().includes(query)
        || (subject.syllabusCode ?? "").toLowerCase().includes(query)));

    const byName = new Map<string, SubjectGroup>();
    for (const subject of pool) {
      const group = byName.get(subject.name) ?? { name: subject.name, options: [] };
      group.options.push(subject);
      byName.set(subject.name, group);
    }
    return [...byName.values()];
  }, [subjects, boards, query]);

  /**
   * Picks a board for a subject, or unpicks it. One board at a time: two boards'
   * versions of English Literature are one subject as far as the tracker is
   * concerned, and only the first would survive being created.
   */
  function chooseBoard(group: SubjectGroup, key: string) {
    setError(null);
    setSelected((current) => {
      const others = current.filter((value) => !group.options.some((option) => option.key === value));
      if (current.includes(key)) return others;
      if (others.length >= MAX_SUBJECTS) return current;
      return [...others, key];
    });
  }

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
    setStep((current) => Math.min(LAST_STEP, current + 1));
  }

  async function finish() {
    setPending(true);
    setError(null);

    try {
      await studyApi.onboarding.complete({
        fullName: fullName.trim(),
        qualification: chosenBoards.join(", ").slice(0, 80),
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
        {Array.from({ length: LAST_STEP + 1 }, (_, index) => (
          <span key={index} className={step >= index ? "done" : ""} />
        ))}
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
            {subjects.length} subjects across {groups.length} qualifications. Pick the
            board each one is yours on — that is the syllabus it arrives with.
          </p>

          <fieldset className="board-filter">
            <legend>Which boards do you study? <small>Pick as many as you need — subjects can come from any of them</small></legend>
            <div className="board-chips">
              {groups.map((name) => {
                const picked = boards.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked}
                    className={picked ? "picked" : ""}
                    onClick={() => {
                      setBoards((current) => picked
                        ? current.filter((board) => board !== name)
                        : [...current, name]);
                      setSearch("");
                    }}
                  >
                    {picked ? <Icon name="check" /> : null}
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="picker-controls">
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
                  <small>{subject.qualification}</small>
                  <Icon name="close" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="subject-picker">
            {visible.map((group) => {
              const picked = group.options.find((option) => selected.includes(option.key));
              const shown = picked ?? group.options[0];
              const full = !picked && selected.length >= MAX_SUBJECTS;
              return (
                <div key={group.name} className={`subject-option ${picked ? "picked" : ""} ${full ? "full" : ""}`}>
                  <span className={`large-subject-pin ${shown.tone}`} aria-hidden="true" />
                  <span>
                    <strong>{group.name}</strong>
                    <em className={`syllabus-tag ${shown.source}`}>
                      {shown.topicCount
                        ? `${shown.topicCount.toLocaleString("en-GB")} syllabus rows`
                        : "Syllabus can be added later"}
                    </em>
                    {/* One button per board that teaches it, because the board
                        decides the syllabus this subject arrives with. */}
                    <span className="subject-boards">
                      {group.options.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          aria-pressed={selected.includes(option.key)}
                          aria-label={`${group.name}, ${option.qualification}`}
                          className={selected.includes(option.key) ? "picked" : ""}
                          disabled={full}
                          onClick={() => chooseBoard(group, option.key)}
                        >
                          {selected.includes(option.key) ? <Icon name="check" /> : null}
                          {option.qualification}
                          {option.syllabusCode ? <small>{option.syllabusCode}</small> : null}
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
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
          <h2>How Momentum works</h2>
          <p className="muted">
            Five moves, and the tracker runs itself. It is all in the guide too, under
            Guide in the sidebar, so nothing here is worth memorising.
          </p>

          <div className="onboarding-loop">
            <ol className="guide-loop-steps">
              {CORE_LOOP.map((move, index) => (
                <li key={move.title}>
                  <span className="guide-loop-mark" aria-hidden="true"><Icon name={move.icon} /></span>
                  <div>
                    <p className="guide-loop-index">Step {index + 1} · {move.where}</p>
                    <strong>{move.title}</strong>
                    <p>{move.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="onboarding-statuses">
              <p>
                The only thing to learn: a syllabus point&apos;s status decides when it comes
                back to you.
              </p>
              <div className="onboarding-status-row">
                {STATUS_GUIDE.filter((row) => row.days > 0).map((row) => (
                  <span key={row.status}>
                    <b>{row.status}</b>
                    <small>back in {row.days} days</small>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {step === LAST_STEP ? (
        <>
          <h2>Ready to go</h2>
          <p className="muted">
            We will set your workspace up with this. Start with a syllabus goal — it fills
            the review board with dated work — and the guide in the sidebar has the rest.
          </p>

          <div className="onboarding-summary">
            <div><span>Name</span><strong>{fullName}</strong></div>
            <div><span>Exam boards</span><strong>{chosenBoards.join(", ") || "None"}</strong></div>
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

        {step < LAST_STEP ? (
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
