"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Topic } from "./study-tracker-app";
import { subjectName, type Subject } from "./subjects";
import { currentStage, getTopicStage, subjectHasStages, type SyllabusStage } from "./syllabus-stage";
import Icon from "./icons";
import { STUDY_RANGES, studyAnalytics, type RangeKey } from "./study-analytics";

export type StudySession = {
  id: number;
  studyDate: string;
  minutes: number;
  subjectId: string | null;
  note: string | null;
  topics: Array<{ id: string; code: string; title: string; kind: "chapter" | "point"; parentId: string | null }>;
  createdAt: string;
  updatedAt: string;
};


function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatStudyTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

function toneFor(lookup: Map<string, Subject>, id: string | null) {
  return id ? lookup.get(id)?.tone ?? "slate" : "slate";
}

const WEEKDAY = new Intl.DateTimeFormat("en-SG", { weekday: "short", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });

function asDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

/** Monday first, which is how a school week reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** A signed percentage, for a figure that is only interesting as a direction. */
function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`;
}

export default function StudyHoursView({
  sessions,
  subjects,
  topics: syllabusTopics,
  today,
  saving,
  onAdd,
  onDelete,
}: {
  sessions: StudySession[];
  subjects: Subject[];
  topics: Topic[];
  today: string;
  saving: boolean;
  onAdd: (input: { studyDate: string; minutes: number; subjectId: string | null; note: string | null; topicIds: string[] }) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [subject, setSubject] = useState("");
  const [chosenStage, setStage] = useState<SyllabusStage>("");
  const options = useMemo(() => subjects.filter((item) => !item.archived && item.stages.length > 0), [subjects]);
  const lookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const chosen = lookup.get(subject) ?? null;
  const stage = currentStage(chosen, chosenStage);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [openChapterIds, setOpenChapterIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  /**
   * Thirty days rather than seven. A week is enough to log against and not
   * enough to learn anything from: it cannot tell a good week from a normal
   * one, and it resets before a habit shows up in it.
   */
  const [range, setRange] = useState<RangeKey>("30");

  const chapters = useMemo(() => syllabusTopics.filter((topic) =>
    topic.kind === "chapter" && topic.subjectId === subject && getTopicStage(topic, syllabusTopics, chosen) === stage
  ), [chosen, stage, subject, syllabusTopics]);
  const pointsByChapter = useMemo(() => {
    const groups = new Map<string, Topic[]>();
    syllabusTopics.filter((topic) => topic.kind === "point" && topic.subjectId === subject).forEach((topic) => {
      if (!topic.parentId) return;
      const current = groups.get(topic.parentId) ?? [];
      current.push(topic);
      groups.set(topic.parentId, current);
    });
    return groups;
  }, [subject, syllabusTopics]);

  const window = STUDY_RANGES.find((option) => option.key === range) ?? STUDY_RANGES[1];
  const stats = useMemo(
    () => studyAnalytics(sessions, today, window.days),
    [sessions, today, window.days],
  );
  const todayMinutes = useMemo(
    () => sessions.filter((session) => session.studyDate === today).reduce((sum, session) => sum + session.minutes, 0),
    [sessions, today],
  );
  const maxMinutes = Math.max(60, ...stats.buckets.map((bucket) => bucket.minutes));
  const busiestWeekday = Math.max(0, ...stats.byWeekday);
  const daily = stats.buckets.length > 0 && stats.buckets[0].start === stats.buckets[0].end;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (total < 1 || total > 1440) return;
    const saved = await onAdd({
      studyDate: date,
      minutes: total,
      subjectId: subject || null,
      note: note.trim() || null,
      topicIds: [...selectedTopicIds],
    });
    if (saved) {
      setHours("");
      setMinutes("");
      setNote("");
      setSelectedTopicIds(new Set());
    }
  }

  function changeSubject(nextSubject: string) {
    setSubject(nextSubject);
    setStage("");
    setSelectedTopicIds(new Set());
    setOpenChapterIds(new Set());
  }

  function changeStage(nextStage: SyllabusStage) {
    setStage(nextStage);
    setSelectedTopicIds(new Set());
    setOpenChapterIds(new Set());
  }

  function toggleChapterOpen(id: string) {
    setOpenChapterIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleWholeChapter(chapter: Topic) {
    const children = pointsByChapter.get(chapter.id) ?? [];
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(chapter.id)) next.delete(chapter.id);
      else {
        children.forEach((point) => next.delete(point.id));
        next.add(chapter.id);
      }
      return next;
    });
  }

  function togglePoint(chapter: Topic, point: Topic) {
    const children = pointsByChapter.get(chapter.id) ?? [];
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(chapter.id)) {
        next.delete(chapter.id);
        children.forEach((child) => next.add(child.id));
        next.delete(point.id);
      } else if (next.has(point.id)) next.delete(point.id);
      else next.add(point.id);
      return next;
    });
  }

  return (
    <div className="hours-page">
      <section className="hours-range" aria-label="How far back to look">
        <div role="group">
          {STUDY_RANGES.map((option) => <button
            key={option.key}
            type="button"
            aria-pressed={range === option.key}
            className={range === option.key ? "active" : ""}
            onClick={() => setRange(option.key)}
          >{option.label}</button>)}
        </div>
        <span>{DAY_MONTH.format(asDate(stats.from))} – {DAY_MONTH.format(asDate(stats.to))} · {stats.span} days</span>
      </section>

      <section className="hours-summary">
        <article><span>Today</span><strong>{formatStudyTime(todayMinutes)}</strong><small>{todayMinutes ? "Logged so far" : "Nothing yet"}</small></article>
        <article className={stats.change != null && stats.change >= 0 ? "on-track" : ""}>
          <span>{window.label}</span>
          <strong>{formatStudyTime(stats.minutes)}</strong>
          {/* A total on its own is a number; a total against the window before
              it is the only version that says whether things are going well. */}
          <small>{stats.change == null
            ? `${stats.sessionCount} ${stats.sessionCount === 1 ? "session" : "sessions"}`
            : `${signed(stats.change)} on the ${stats.span} days before`}</small>
        </article>
        <article>
          <span>Daily average</span>
          <strong>{formatStudyTime(stats.perDay)}</strong>
          <small>{stats.perActiveDay ? `${formatStudyTime(stats.perActiveDay)} on the days you studied` : "across every day"}</small>
        </article>
        <article className={stats.consistency >= 70 ? "on-track" : stats.consistency < 30 ? "behind" : ""}>
          <span>Consistency</span>
          <strong>{stats.consistency}%</strong>
          <small>{stats.activeDays} of {stats.span} days</small>
        </article>
        <article className={stats.streak.current > 0 ? "on-track" : ""}>
          <span>Streak</span>
          <strong>{stats.streak.current} {stats.streak.current === 1 ? "day" : "days"}</strong>
          <small>{stats.streak.longest ? `best run ${stats.streak.longest}` : "start one today"}</small>
        </article>
      </section>

      <section className="hours-layout">
        <form className="hours-form panel-card" onSubmit={submit}>
          <div className="panel-heading"><p className="eyebrow">QUICK LOG</p><h3>Add study time</h3><p>Copy in a daily total, or add separate sessions.</p></div>
          <label><span>Date</span><input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} required /></label>
          <div className="duration-fields">
            <label><span>Hours</span><input type="number" min="0" max="24" inputMode="numeric" placeholder="0" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
            <label><span>Minutes</span><input type="number" min="0" max="59" inputMode="numeric" placeholder="0" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
          </div>
          <label><span>Subject <small>optional</small></span><select value={subject} onChange={(event) => changeSubject(event.target.value)}><option value="">General study</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {subject && <section className="study-topic-picker" aria-label="Syllabus topics studied">
            <div className="study-topic-picker-heading">
              <div><strong>What did you study?</strong><span>Selected topics count as reviewed and are automatically rescheduled</span></div>
              {selectedTopicIds.size > 0 && <button type="button" onClick={() => setSelectedTopicIds(new Set())}>Clear</button>}
            </div>
            {subjectHasStages(chosen) && <div className="study-stage-switch" aria-label="Syllabus stage">
              {chosen!.stages.map((item) => <button key={item} type="button" className={stage === item ? "active" : ""} onClick={() => changeStage(item)}>{item}</button>)}
            </div>}
            <div className="study-topic-summary"><strong>{selectedTopicIds.size ? `${selectedTopicIds.size} selected for review` : "None selected"}</strong><span>Select a whole chapter to review every point inside it, or open it for individual points.</span></div>
            <div className="study-topic-tree">
              {chapters.map((chapter) => {
                const children = pointsByChapter.get(chapter.id) ?? [];
                const chapterSelected = selectedTopicIds.has(chapter.id);
                const selectedChildren = children.filter((point) => selectedTopicIds.has(point.id)).length;
                const open = openChapterIds.has(chapter.id);
                return <article className={`study-topic-group ${chapterSelected ? "selected" : ""}`} key={chapter.id}>
                  <div className="study-topic-chapter">
                    <input type="checkbox" checked={chapterSelected} onChange={() => toggleWholeChapter(chapter)} aria-label={`Select whole chapter ${chapter.title}`} />
                    <button type="button" onClick={() => toggleChapterOpen(chapter.id)} aria-expanded={open}>
                      <i><Icon name={open ? "chevron-down" : "chevron-right"} /></i><span><small>{chapter.code}</small><strong>{chapter.title}</strong></span><b>{chapterSelected ? "Whole chapter" : selectedChildren ? `${selectedChildren}/${children.length}` : children.length}</b>
                    </button>
                  </div>
                  {open && <div className="study-topic-points">
                    {children.map((point) => <label key={point.id}>
                      <input type="checkbox" checked={chapterSelected || selectedTopicIds.has(point.id)} onChange={() => togglePoint(chapter, point)} />
                      <span><small>{point.code}</small>{point.title}</span>
                    </label>)}
                  </div>}
                </article>;
              })}
            </div>
          </section>}
          <label><span>Note <small>optional</small></span><input maxLength={300} placeholder="Past paper, revision, flashcards…" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <button className="hours-submit" disabled={saving || ((Number(hours) || 0) * 60 + (Number(minutes) || 0) < 1)}>{saving ? "Saving…" : selectedTopicIds.size ? "Log time + mark reviewed" : "Log study time"}</button>
        </form>

        <section className="hours-chart panel-card">
          <div className="panel-heading">
            <p className="eyebrow">{daily ? "DAY BY DAY" : "WEEK BY WEEK"}</p>
            <h3>Your study rhythm</h3>
            <p>{daily
              ? "Totals for each day in the window."
              : "Totals for each week, counted back from today."}</p>
          </div>
          <div className="bar-chart" aria-label={`Study time ${daily ? "each day" : "each week"} over the last ${stats.span} days`}>
            {stats.buckets.map((bucket) => (
              <div className={`bar-day ${bucket.end === today ? "current" : ""}`} key={bucket.key}>
                <span className="bar-value">{bucket.minutes ? formatStudyTime(bucket.minutes) : "—"}</span>
                <div className="bar-track"><i style={{ height: `${Math.max(bucket.minutes ? 8 : 2, bucket.minutes / maxMinutes * 100)}%` }} /></div>
                <small>{daily ? WEEKDAY.format(asDate(bucket.start)) : DAY_MONTH.format(asDate(bucket.start))}</small>
              </div>
            ))}
          </div>
          <div className="week-total">
            <span>{stats.best ? `Best day ${longDate(stats.best.date)}` : "Nothing logged yet"}</span>
            <strong>{stats.best ? formatStudyTime(stats.best.minutes) : "—"}</strong>
          </div>
        </section>
      </section>

      {stats.minutes > 0 && <section className="hours-breakdown">
        <article className="panel-card">
          <div className="panel-heading"><p className="eyebrow">WHERE IT GOES</p><h3>Time by subject</h3><p>Which courses the {window.label.toLowerCase()} actually went on.</p></div>
          <ul className="hours-subject-split">
            {stats.bySubject.map((entry) => (
              <li key={entry.subjectId ?? "general"}>
                <i className={`subject-pin ${toneFor(lookup, entry.subjectId)}`} />
                <span>{subjectName(lookup, entry.subjectId)}</span>
                <div><i style={{ width: `${entry.share}%` }} /></div>
                <b>{formatStudyTime(entry.minutes)}</b>
                <small>{entry.share}%</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel-card">
          <div className="panel-heading"><p className="eyebrow">YOUR WEEK</p><h3>When you actually study</h3><p>Average for each day of the week, across the window.</p></div>
          <ul className="hours-weekday">
            {WEEK_ORDER.map((weekday) => {
              const average = stats.byWeekday[weekday];
              return <li key={weekday} className={average === busiestWeekday && average > 0 ? "peak" : ""}>
                <span>{WEEKDAY.format(asDate(addDays("2026-01-04", weekday)))}</span>
                <div><i style={{ width: `${busiestWeekday ? (average / busiestWeekday) * 100 : 0}%` }} /></div>
                <b>{average ? formatStudyTime(average) : "—"}</b>
              </li>;
            })}
          </ul>
          <dl className="hours-facts">
            <div><dt>Sessions</dt><dd>{stats.sessionCount}</dd></div>
            <div><dt>Longest sitting</dt><dd>{formatStudyTime(stats.longestSession)}</dd></div>
            <div><dt>Topics reviewed</dt><dd>{stats.reviewed}</dd></div>
          </dl>
        </article>
      </section>}

      <section className="hours-history review-panel">
        <div className="section-heading"><div><p className="eyebrow">HISTORY</p><h3>Recent study logs</h3></div><span className="history-count">{sessions.length} {sessions.length === 1 ? "entry" : "entries"}</span></div>
        {sessions.length ? <div className="session-list">{sessions.slice(0, 50).map((session) => (
          <article className="session-row" key={session.id}>
            <div className="session-date"><strong>{longDate(session.studyDate)}</strong>{session.studyDate === today && <span>Today</span>}</div>
            <i className={`subject-pin ${toneFor(lookup, session.subjectId)}`} />
            <div className="session-copy"><strong>{subjectName(lookup, session.subjectId)}</strong><span>{session.note ?? "No note"}</span>{session.topics.length > 0 && <div className="session-topics"><em>Counted as review</em>{session.topics.slice(0, 2).map((topic) => <i key={topic.id}>{topic.code} · {topic.title}</i>)}{session.topics.length > 2 && <b>+{session.topics.length - 2} more</b>}</div>}</div>
            <b className="session-duration">{formatStudyTime(session.minutes)}</b>
            <button className="delete-session" onClick={() => onDelete(session.id)} aria-label={`Delete ${formatStudyTime(session.minutes)} entry from ${longDate(session.studyDate)}`}><Icon name="close" /></button>
          </article>
        ))}</div> : <div className="empty-state compact"><span className="hours-empty-icon"><Icon name="hours" /></span><strong>No study hours logged yet</strong><p>Add today’s study time with the quick log above.</p></div>}
      </section>
    </div>
  );
}
