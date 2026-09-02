"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Topic } from "./study-tracker-app";
import { subjectName, type Subject } from "./subjects";
import { currentStage, getTopicStage, subjectHasStages, type SyllabusStage } from "./syllabus-stage";
import Icon from "./icons";

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

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    sessions.forEach((session) => totals.set(session.studyDate, (totals.get(session.studyDate) ?? 0) + session.minutes));
    return totals;
  }, [sessions]);

  const lastSeven = useMemo(() =>
    Array.from({ length: 7 }, (_, index) => {
      const studyDate = addDays(today, index - 6);
      return { studyDate, minutes: dailyTotals.get(studyDate) ?? 0 };
    }), [dailyTotals, today]);

  const todayMinutes = dailyTotals.get(today) ?? 0;
  const sevenDayMinutes = lastSeven.reduce((sum, day) => sum + day.minutes, 0);
  const activeDays = lastSeven.filter((day) => day.minutes > 0).length;
  const maxMinutes = Math.max(60, ...lastSeven.map((day) => day.minutes));

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
      <section className="hours-summary">
        <article><span>Today</span><strong>{formatStudyTime(todayMinutes)}</strong><small>{todayMinutes ? "Logged so far" : "No time logged yet"}</small></article>
        <article><span>Last 7 days</span><strong>{formatStudyTime(sevenDayMinutes)}</strong><small>{activeDays} active {activeDays === 1 ? "day" : "days"}</small></article>
        <article><span>Daily average</span><strong>{formatStudyTime(Math.round(sevenDayMinutes / 7))}</strong><small>Across this week</small></article>
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
          <div className="panel-heading"><p className="eyebrow">WEEKLY VIEW</p><h3>Your study rhythm</h3><p>Daily totals from the last seven days.</p></div>
          <div className="bar-chart" aria-label="Study time over the last seven days">
            {lastSeven.map((day) => (
              <div className="bar-day" key={day.studyDate}>
                <span className="bar-value">{day.minutes ? formatStudyTime(day.minutes) : "—"}</span>
                <div className="bar-track"><i style={{ height: `${Math.max(day.minutes ? 8 : 2, day.minutes / maxMinutes * 100)}%` }} /></div>
                <small>{new Intl.DateTimeFormat("en-SG", { weekday: "short" }).format(new Date(`${day.studyDate}T00:00:00Z`))}</small>
              </div>
            ))}
          </div>
          <div className="week-total"><span>Weekly total</span><strong>{formatStudyTime(sevenDayMinutes)}</strong></div>
        </section>
      </section>

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
