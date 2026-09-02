"use client";

import { useEffect, useMemo, useState } from "react";
import type { Topic } from "./study-tracker-app";
import { formatStudyTime, type StudySession } from "./study-hours";
import { pointMinutes, roundMinutes, timeBudget, type TimeBudget } from "./study-time";
import { subjectName, type Subject } from "./subjects";
import type { StudyStatus } from "./topics";
import { getTopicStage, subjectHasStages, type SyllabusStage } from "./syllabus-stage";
import { api, apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";

type PaceMode = "steady" | "front-loaded" | "finish-line";

type ExamTopic = { topicId: string; reviseOn: string | null };

/** Exported for the shell, which reads the revision dates onto the board. */
export type PlannedExam = Exam;

type Exam = {
  id: number;
  subjectId: string;
  title: string;
  stage: SyllabusStage | null;
  examDate: string;
  startDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  notes: string | null;
  topics: ExamTopic[];
};

const PACE_OPTIONS: Array<{ value: PaceMode; label: string; detail: string }> = [
  { value: "steady", label: "Steady", detail: "Even spacing to the exam" },
  { value: "front-loaded", label: "Front-loaded", detail: "Heavier early, lighter near the exam" },
  { value: "finish-line", label: "Finish-line push", detail: "Lighter start, intense final week" },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00Z`));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

/**
 * Whether the run-up is being kept to, on the same reading the goal planner
 * uses: how much of the exam should be behind you by today if the work were
 * spread evenly across the window you gave it, against how much actually is.
 *
 * An exam differs from a goal in what it means to arrive. A syllabus goal can
 * run past its date and still be worth finishing; an exam cannot, so a plan
 * with nothing left says so outright rather than reporting a pace of zero.
 */
function examReadiness(exam: Exam, done: number, today: string) {
  const total = exam.topics.length;
  const totalDays = Math.max(1, daysBetween(exam.startDate, exam.examDate));
  const elapsed = Math.max(0, Math.min(totalDays, daysBetween(exam.startDate, today)));
  const daysLeft = Math.max(0, daysBetween(today, exam.examDate));
  const expected = Math.min(total, Math.ceil(total * elapsed / totalDays));
  const left = Math.max(0, total - done);
  const weeklyPace = daysLeft > 0 ? Math.ceil(left / daysLeft * 7) : left;
  return {
    total,
    done,
    left,
    daysLeft,
    expected,
    weeklyPace,
    perStudyDay: exam.studyDays ? weeklyPace / exam.studyDays : weeklyPace,
    ready: total > 0 && left === 0,
    onTrack: done >= expected,
  };
}

/**
 * Hours logged against the exam's subject in the last seven days, read the same
 * way the goal planner reads them. Subject rather than topic: a session records
 * the topics it covered only when a learner ticks them, and an hour of revision
 * is no less real for having gone unticked.
 */
function weekMinutes(sessions: StudySession[], subjectId: string, today: string) {
  const weekStart = addDays(today, -6);
  return sessions
    .filter((session) => session.subjectId === subjectId
      && session.studyDate >= weekStart && session.studyDate <= today)
    .reduce((sum, session) => sum + session.minutes, 0);
}

function isComplete(topic: Topic) {
  return topic.status === "Covered" || topic.status === "Exam Ready";
}

function countdownLabel(days: number) {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return `In ${weeks} week${weeks === 1 ? "" : "s"}`;
}

type FormState = {
  id: number | null;
  subjectId: string;
  title: string;
  stage: "" | SyllabusStage;
  examDate: string;
  startDate: string;
  weeklyHours: string;
  studyDays: string;
  paceMode: PaceMode;
  notes: string;
};

function blankForm(subjectId: string, today: string): FormState {
  return {
    id: null,
    subjectId,
    title: "",
    stage: "",
    examDate: addDays(today, 42),
    startDate: today,
    weeklyHours: "10",
    studyDays: "5",
    paceMode: "steady",
    notes: "",
  };
}

export default function ExamPlanner({ topics, subjects, sessions, today, updating, updateTopic, onMessage }: {
  topics: Topic[];
  subjects: Subject[];
  /** For the hours actually put in, against the hours the plan asked for. */
  sessions: StudySession[];
  today: string;
  /** Topic ids the shell has a write in flight for, so a box cannot be double-ticked. */
  updating: Set<string>;
  /** The shell's own writer, so ticking a topic here is the same act as ticking it on the board. */
  updateTopic: (topic: Topic, options: { status?: StudyStatus }) => void;
  onMessage: (message: string) => void;
}) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openPlanId, setOpenPlanId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const trackable = useMemo(
    () => subjects.filter((subject) => topics.some((topic) => topic.subjectId === subject.id)),
    [subjects, topics],
  );
  const subjectLookup = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const topicLookup = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

  useEffect(() => {
    api.get<{ exams: Exam[] }>(studyApi.exams.path)
      .then((data) => setExams(data.exams))
      .catch(() => onMessage("Your exams could not load."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Chapters, each with the points beneath it, for the subject and stage being edited. */
  const chapters = useMemo(() => {
    if (!form) return [];
    const subject = subjectLookup.get(form.subjectId) ?? null;
    const subjectTopics = topics.filter((topic) => topic.subjectId === form.subjectId);
    const inStage = (topic: Topic) =>
      !form.stage || getTopicStage(topic, subjectTopics, subject) === form.stage;

    return subjectTopics
      .filter((topic) => topic.kind === "chapter" && inStage(topic))
      .map((chapter) => ({
        chapter,
        points: subjectTopics.filter((topic) => topic.kind === "point" && topic.parentId === chapter.id),
      }))
      // A chapter with no points is selectable in its own right.
      .filter((entry) => entry.points.length || entry.chapter);
  }, [form, topics, subjectLookup]);

  /** What a chapter row toggles: its points, or itself when it has none. */
  const idsFor = (entry: { chapter: Topic; points: Topic[] }) =>
    entry.points.length ? entry.points.map((point) => point.id) : [entry.chapter.id];

  const selectableIds = useMemo(
    () => chapters.flatMap((entry) => idsFor(entry)),
    [chapters],
  );

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id); else next.delete(id);
      }
      return next;
    });
  }

  function startCreate() {
    const subjectId = trackable[0]?.id;
    if (!subjectId) {
      onMessage("Add a subject with a syllabus before planning an exam.");
      return;
    }
    setForm(blankForm(subjectId, today));
    setSelected(new Set());
  }

  function startEdit(exam: Exam) {
    setForm({
      id: exam.id,
      subjectId: exam.subjectId,
      title: exam.title,
      stage: exam.stage ?? "",
      examDate: exam.examDate,
      startDate: exam.startDate,
      weeklyHours: String(exam.weeklyHours),
      studyDays: String(exam.studyDays),
      paceMode: exam.paceMode,
      notes: exam.notes ?? "",
    });
    setSelected(new Set(exam.topics.map((topic) => topic.topicId)));
  }

  async function submit() {
    if (!form) return;
    if (!form.title.trim()) {
      onMessage("Name the exam, for example “Physics mock”.");
      return;
    }
    if (!selected.size) {
      onMessage("Pick the topics this exam covers.");
      return;
    }
    if (form.examDate <= form.startDate) {
      onMessage("The exam date has to be after the start date.");
      return;
    }

    setSaving(true);
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      subjectId: form.subjectId,
      title: form.title.trim(),
      stage: form.stage || null,
      examDate: form.examDate,
      startDate: form.startDate,
      weeklyHours: Number(form.weeklyHours),
      studyDays: Number(form.studyDays),
      paceMode: form.paceMode,
      notes: form.notes.trim() || null,
      topicIds: [...selected],
    };

    try {
      const { exam: saved } = form.id
        ? await studyApi.exams.update<{ exam: Exam }>(payload)
        : await studyApi.exams.create<{ exam: Exam }>(payload);

      setExams((current) => {
        const rest = current.filter((exam) => exam.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.examDate.localeCompare(b.examDate) || a.id - b.id);
      });
      onMessage(form.id ? "Exam plan updated." : "Exam plan created.");
      setForm(null);
      setSelected(new Set());
    } catch (error) {
      onMessage(apiMessage(error, "That exam could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(exam: Exam) {
    setBusyId(exam.id);
    try {
      await studyApi.exams.remove(exam.id);
      setExams((current) => current.filter((item) => item.id !== exam.id));
      if (openPlanId === exam.id) setOpenPlanId(null);
      onMessage(`“${exam.title}” removed.`);
    } catch {
      onMessage("That exam could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <section className="loading-state" aria-label="Loading exams"><div /><div /><div /></section>;
  }

  return (
    <div className="exam-planner">
      <section className="review-panel">
        <div className="section-heading">
          <h3>Your exams</h3>
          <button className="primary-button" onClick={startCreate}>Plan an exam</button>
        </div>

        {!exams.length ? (
          <div className="empty-state">
            <strong>No exams planned yet.</strong>
            <p>
              Add a mock or a real paper, choose the topics it actually covers, and
              Momentum spreads them across the run-up.
            </p>
          </div>
        ) : (
          <ul className="exam-list">
            {exams.map((exam) => {
              const covered = exam.topics.filter((entry) => {
                const topic = topicLookup.get(entry.topicId);
                return topic && isComplete(topic);
              }).length;
              const total = exam.topics.length;
              const percent = total ? Math.round((covered / total) * 100) : 0;
              const days = daysBetween(today, exam.examDate);
              const upcoming = exam.topics
                .filter((entry) => entry.reviseOn)
                .map((entry) => entry.reviseOn!)
                .sort();
              const nextDate = upcoming.find((date) => date >= today) ?? null;
              const overdue = upcoming.filter((date) => date < today).length;
              const subject = subjectLookup.get(exam.subjectId);
              const examPoints = exam.topics
                .map((entry) => topicLookup.get(entry.topicId))
                .filter((topic): topic is Topic => Boolean(topic));
              const budget = timeBudget(examPoints, {
                daysLeft: days,
                weeklyHours: exam.weeklyHours,
                studyDays: exam.studyDays,
              });
              const readiness = examReadiness(exam, covered, today);
              const loggedMinutes = weekMinutes(sessions, exam.subjectId, today);
              const targetMinutes = exam.weeklyHours * 60;

              return (
                <li key={exam.id} className={`exam-card ${days < 0 ? "past" : ""}`}>
                  <div className="exam-head">
                    <div className="exam-title">
                      <i className={`subject-pin ${subject?.tone ?? "slate"}`} aria-hidden="true" />
                      <div>
                        <strong>{exam.title}</strong>
                        <small>
                          {subjectName(subjects, exam.subjectId)}
                          {exam.stage ? ` · ${exam.stage}` : ""} · {formatDate(exam.examDate)}
                        </small>
                      </div>
                    </div>
                    <div className={`exam-countdown ${days <= 7 && days >= 0 ? "soon" : ""}`}>
                      <strong>{countdownLabel(days)}</strong>
                      <small>{total} topic{total === 1 ? "" : "s"}</small>
                    </div>
                  </div>

                  <div className="exam-progress" role="img" aria-label={`${percent}% of exam topics complete`}>
                    <div style={{ width: `${percent}%` }} />
                  </div>
                  <p className="exam-stats">
                    <span><b>{percent}%</b> ready</span>
                    <span>{covered} of {total} topics done</span>
                    {overdue ? <span className="behind">{overdue} revision date{overdue === 1 ? "" : "s"} passed</span> : null}
                    {nextDate ? <span>Next revision {shortDate(nextDate)}</span> : null}
                    {budget && days > 0 ? (
                      <span>
                        <b>{formatStudyTime(roundMinutes(budget.availableMinutes))}</b> to revise ·
                        about {formatStudyTime(roundMinutes(budget.availableMinutes / total))} a topic
                      </span>
                    ) : null}
                  </p>
                  {/*
                    * The same four questions the goal planner answers, asked of
                    * one paper: how long is left, how fast that means going,
                    * whether the run-up is being kept to, and whether the hours
                    * promised are actually being put in.
                    */}
                  <section className="exam-metrics" aria-label={`Progress towards ${exam.title}`}>
                    <article>
                      <span>Time remaining</span>
                      <strong>{Math.max(0, days)}</strong>
                      <small>{days < 0 ? "the exam has passed" : `day${days === 1 ? "" : "s"} until the paper`}</small>
                    </article>
                    <article>
                      <span>Required pace</span>
                      <strong>{readiness.ready ? "Done" : readiness.weeklyPace}</strong>
                      <small>
                        {readiness.ready
                          ? "every topic on this paper is covered"
                          : `topic${readiness.weeklyPace === 1 ? "" : "s"}/week · about ${readiness.perStudyDay.toFixed(1)} per study day`}
                      </small>
                    </article>
                    <article className={readiness.onTrack ? "on-track" : "behind"}>
                      <span>Exam readiness</span>
                      <strong>
                        {readiness.ready ? "Ready" : readiness.onTrack ? "On track" : `${readiness.expected - readiness.done} behind`}
                      </strong>
                      <small>
                        {readiness.ready
                          ? "nothing left to revise"
                          : `${readiness.expected} of ${readiness.total} should be done by today`}
                      </small>
                    </article>
                    <article>
                      <span>Study hours</span>
                      <strong>{formatHours(loggedMinutes)}</strong>
                      <small>of {exam.weeklyHours}h in the last 7 days</small>
                      <div className="mini-progress">
                        <i style={{ width: `${Math.min(100, targetMinutes ? loggedMinutes / targetMinutes * 100 : 0)}%` }} />
                      </div>
                    </article>
                  </section>

                  {exam.notes ? <p className="exam-notes">{exam.notes}</p> : null}

                  <div className="exam-actions">
                    <button onClick={() => setOpenPlanId(openPlanId === exam.id ? null : exam.id)}>
                      {openPlanId === exam.id ? "Hide plan" : "View plan"}
                    </button>
                    <button onClick={() => startEdit(exam)}>Edit</button>
                    <button className="danger" disabled={busyId === exam.id} onClick={() => remove(exam)}>
                      {busyId === exam.id ? "Removing…" : "Remove"}
                    </button>
                  </div>

                  {openPlanId === exam.id
                    ? <ExamPlan exam={exam} topics={topicLookup} today={today} budget={budget} updating={updating} updateTopic={updateTopic} />
                    : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {form ? (
        <section className="review-panel exam-form">
          <div className="section-heading">
            <h3>{form.id ? "Edit exam" : "Plan an exam"}</h3>
            <button onClick={() => { setForm(null); setSelected(new Set()); }}>Cancel</button>
          </div>

          <div className="exam-form-grid">
            <label>
              <span>Exam name</span>
              <input
                value={form.title}
                maxLength={120}
                placeholder="Physics mock, Paper 4"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>

            <label>
              <span>Subject</span>
              <select
                value={form.subjectId}
                onChange={(event) => { setForm({ ...form, subjectId: event.target.value, stage: "" }); setSelected(new Set()); }}
              >
                {trackable.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>

            {subjectHasStages(subjectLookup.get(form.subjectId)) ? (
              <label>
                <span>Stage</span>
                <select
                  value={form.stage}
                  onChange={(event) => { setForm({ ...form, stage: event.target.value as FormState["stage"] }); setSelected(new Set()); }}
                >
                  <option value="">Both stages</option>
                  {(subjectLookup.get(form.subjectId)?.stages ?? []).map((stage) => (
                    <option key={stage} value={stage}>{stage} only</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              <span>Revision starts</span>
              <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </label>

            <label>
              <span>Exam date</span>
              <input type="date" value={form.examDate} onChange={(event) => setForm({ ...form, examDate: event.target.value })} />
            </label>

            <label>
              <span>Revision days each week</span>
              <input type="number" min={1} max={7} value={form.studyDays} onChange={(event) => setForm({ ...form, studyDays: event.target.value })} />
            </label>

            <label>
              <span>Hours each week</span>
              <input type="number" min={1} max={80} value={form.weeklyHours} onChange={(event) => setForm({ ...form, weeklyHours: event.target.value })} />
            </label>
          </div>

          <fieldset className="pace-picker">
            <legend>Pacing style</legend>
            {PACE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={form.paceMode === option.value ? "active" : ""}
                onClick={() => setForm({ ...form, paceMode: option.value })}
              >
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </button>
            ))}
          </fieldset>

          <label className="exam-notes-field">
            <span>Notes (optional)</span>
            <input
              value={form.notes}
              maxLength={500}
              placeholder="Paper 4 only, no practical"
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>

          <div className="topic-picker">
            <div className="topic-picker-head">
              <div>
                <strong>Topics this exam covers</strong>
                <small>
                  An assessment rarely covers everything. Tick a chapter to take all of
                  it, or pick individual points.
                </small>
              </div>
              <div className="topic-picker-actions">
                <span>{selected.size} selected</span>
                <button type="button" onClick={() => toggle(selectableIds, true)}>Select all</button>
                <button type="button" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            </div>

            {!chapters.length ? (
              <p className="muted">This subject has no syllabus for that stage yet.</p>
            ) : (
              <ul className="topic-tree">
                {chapters.map((entry) => {
                  const ids = idsFor(entry);
                  const chosen = ids.filter((id) => selected.has(id)).length;
                  const all = chosen === ids.length;
                  const some = chosen > 0 && !all;
                  return (
                    <li key={entry.chapter.id}>
                      <label className={`topic-chapter ${some ? "partial" : ""}`}>
                        <input
                          type="checkbox"
                          checked={all}
                          ref={(node) => { if (node) node.indeterminate = some; }}
                          onChange={(event) => toggle(ids, event.target.checked)}
                        />
                        <span>
                          <b>{entry.chapter.code}</b> {entry.chapter.title}
                        </span>
                        <small>{chosen}/{ids.length}</small>
                      </label>

                      {entry.points.length ? (
                        <ul className="topic-points">
                          {entry.points.map((point) => (
                            <li key={point.id}>
                              <label className={isComplete(point) ? "done" : ""}>
                                <input
                                  type="checkbox"
                                  checked={selected.has(point.id)}
                                  onChange={(event) => toggle([point.id], event.target.checked)}
                                />
                                <span><b>{point.code}</b> {point.title}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="exam-form-actions">
            <button className="primary-button" disabled={saving} onClick={submit}>
              {saving ? "Building the plan…" : form.id ? "Save exam plan" : "Create exam plan"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The generated revision schedule, grouped by day, and tickable in place. */
function ExamPlan({ exam, topics, today, budget, updating, updateTopic }: {
  exam: Exam;
  topics: Map<string, Topic>;
  today: string;
  /** The exam's own time budget, so a day says how long it will take. */
  budget: TimeBudget | null;
  updating: Set<string>;
  updateTopic: (topic: Topic, options: { status?: StudyStatus }) => void;
}) {
  const days = useMemo(() => {
    const byDate = new Map<string, Topic[]>();
    for (const entry of exam.topics) {
      if (!entry.reviseOn) continue;
      const topic = topics.get(entry.topicId);
      if (!topic) continue;
      const bucket = byDate.get(entry.reviseOn) ?? [];
      bucket.push(topic);
      byDate.set(entry.reviseOn, bucket);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [exam, topics]);

  const done = exam.topics.filter((entry) => !entry.reviseOn).length;

  if (!days.length) {
    return (
      <div className="exam-plan">
        <p className="muted">
          Every topic on this exam is already at Covered or Exam Ready. Nothing left to schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="exam-plan">
      {done ? <p className="muted">{done} topic{done === 1 ? " is" : "s are"} already done and left off the plan.</p> : null}
      <ol className="exam-plan-days">
        {days.map(([date, items]) => (
          <li key={date} className={date < today ? "missed" : date === today ? "today" : ""}>
            <div className="plan-date">
              <strong>{shortDate(date)}</strong>
              <small>
                {items.length} topic{items.length === 1 ? "" : "s"} ·{" "}
                {formatStudyTime(items.reduce((sum, topic) => sum + pointMinutes(topic, budget), 0))}
              </small>
            </div>
            <ul>
              {items.map((topic) => {
                const complete = isComplete(topic);
                const busy = updating.has(topic.id);
                return (
                  <li key={topic.id} className={complete ? "done" : ""}>
                    {/*
                      * The same write the review board makes, from the screen a
                      * learner is already on. Revising for a paper and saying so
                      * should not be two trips.
                      */}
                    <label className="plan-tick">
                      <input
                        type="checkbox"
                        checked={complete}
                        disabled={busy}
                        aria-label={`Mark ${topic.code} ${topic.title} as covered`}
                        onChange={(event) => updateTopic(topic, { status: event.target.checked ? "Covered" : "Practising" })}
                      />
                      <span><b>{topic.code}</b> {topic.title}</span>
                    </label>
                    <em>{formatStudyTime(pointMinutes(topic, budget))}</em>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
