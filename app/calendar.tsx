"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudySession } from "./study-hours";
import type { Topic } from "./study-tracker-app";
import type { StudyTask } from "./tasks";
import { subjectName, type Subject } from "./subjects";
import { getTopicStage } from "./syllabus-stage";
import Icon from "./icons";
import { api } from "./data/api";
import { studyApi } from "./data/endpoints";

type Goal = { subjectId: string; stage: "AS" | "A2"; startDate: string; targetDate: string; paceMode: "steady" | "front-loaded" | "finish-line" };
type Exam = { id: number; subjectId: string; title: string; stage: "AS" | "A2" | null; examDate: string; topics: Array<{ topicId: string; reviseOn: string | null }> };

/**
 * Where a day's items come from. The calendar gathers eight of these out of
 * five different places, so the legend that names them is also what filters
 * them: the colour a learner is looking for is the control they reach for.
 */
const EVENT_KINDS = [
  { kind: "review", label: "Review" },
  { kind: "goal-task", label: "Goal plan" },
  { kind: "task", label: "Task" },
  { kind: "study", label: "Study log" },
  { kind: "milestone", label: "Milestone" },
  { kind: "goal", label: "Goal" },
  { kind: "exam-task", label: "Exam revision" },
  { kind: "exam", label: "Exam" },
] as const;

type EventKind = (typeof EVENT_KINDS)[number]["kind"];
type CalendarEvent = { id: string; date: string; kind: EventKind; title: string; detail: string };

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function paceFraction(fraction: number, mode: Goal["paceMode"]) {
  if (mode === "front-loaded") return Math.pow(fraction, 1.3);
  if (mode === "finish-line") return Math.pow(fraction, 0.72);
  return fraction;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours ? `${hours}h` : ""}${hours && rest ? " " : ""}${rest ? `${rest}m` : ""}`;
}

export default function CalendarView({ topics, subjects, sessions, tasks, today, onMessage }: {
  topics: Topic[];
  subjects: Map<string, Subject>;
  sessions: StudySession[];
  tasks: StudyTask[];
  today: string;
  onMessage: (message: string) => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(today);
  const [hidden, setHidden] = useState<ReadonlySet<EventKind>>(new Set());

  useEffect(() => {
    api.get<{ goals: Goal[] }>(studyApi.goals.path)
      .then((data) => setGoals(data.goals))
      .catch(() => onMessage("Goal milestones could not be added to the calendar."));

    api.get<{ exams: Exam[] }>(studyApi.exams.path)
      .then((data) => setExams(data.exams))
      .catch(() => onMessage("Exams could not be added to the calendar."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lookup = subjects;
  const events = useMemo(() => {
    const items: CalendarEvent[] = [];
    topics.filter((topic) => topic.kind === "point" && topic.goalDue).forEach((topic) => items.push({
      id: `goal-task-${topic.id}`,
      date: topic.goalDue!,
      kind: "goal-task",
      title: `${topic.code} · ${topic.title}`,
      detail: `${subjectName(lookup, topic.subjectId)} goal-plan task`,
    }));
    topics.filter((topic) => topic.kind === "point" && topic.reviewDue).forEach((topic) => items.push({
      id: `review-${topic.id}`,
      date: topic.reviewDue!,
      kind: "review",
      title: `${topic.code} · ${topic.title}`,
      detail: `${subjectName(lookup, topic.subjectId)} review`,
    }));
    sessions.forEach((session) => items.push({
      id: `study-${session.id}`,
      date: session.studyDate,
      kind: "study",
      title: `${formatMinutes(session.minutes)} ${subjectName(lookup, session.subjectId)}`,
      detail: session.note ?? (session.topics[0] ? session.topics.map((topic) => topic.code).join(", ") : "Study hours logged"),
    }));
    tasks.filter((task) => !task.completed).forEach((task) => items.push({
      id: `task-${task.id}`,
      date: task.dueDate,
      kind: "task",
      title: task.title,
      detail: `${subjectName(lookup, task.subjectId)} task · ${task.priority} priority`,
    }));
    goals.forEach((goal) => {
      items.push({ id: `goal-${goal.subjectId}-${goal.stage}`, date: goal.targetDate, kind: "goal", title: `Finish ${subjectName(lookup, goal.subjectId)} ${goal.stage}`, detail: "Syllabus goal deadline" });
      const chapters = topics.filter((topic) => topic.kind === "chapter" && topic.subjectId === goal.subjectId && getTopicStage(topic, topics, lookup.get(goal.subjectId)) === goal.stage);
      const chapterIds = new Set(chapters.map((chapter) => chapter.id));
      const points = topics.filter((topic) => topic.kind === "point" && topic.parentId && chapterIds.has(topic.parentId));
      const totalDays = Math.max(1, daysBetween(goal.startDate, goal.targetDate));
      chapters.forEach((chapter, index) => {
        const cumulative = chapters.slice(0, index + 1).reduce((sum, item) => sum + points.filter((point) => point.parentId === item.id).length, 0);
        const progress = points.length ? cumulative / points.length : 1;
        const date = addDays(goal.startDate, Math.round(totalDays * paceFraction(progress, goal.paceMode)));
        items.push({ id: `milestone-${goal.subjectId}-${goal.stage}-${chapter.id}`, date, kind: "milestone", title: `${chapter.code} · ${chapter.title}`, detail: `${subjectName(lookup, goal.subjectId)} ${goal.stage} milestone` });
      });
    });
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    exams.forEach((exam) => {
      items.push({
        id: `exam-${exam.id}`,
        date: exam.examDate,
        kind: "exam",
        title: exam.title,
        detail: `${subjectName(lookup, exam.subjectId)}${exam.stage ? ` ${exam.stage}` : ""} exam`,
      });
      exam.topics.forEach((entry) => {
        if (!entry.reviseOn) return;
        const topic = topicById.get(entry.topicId);
        if (!topic) return;
        items.push({
          id: `exam-task-${exam.id}-${entry.topicId}`,
          date: entry.reviseOn,
          kind: "exam-task",
          title: `${topic.code} · ${topic.title}`,
          detail: `${exam.title} revision`,
        });
      });
    });
    return items;
  }, [exams, goals, lookup, sessions, tasks, topics]);

  const calendarDays = useMemo(() => {
    const startOffset = new Date(`${month}T00:00:00Z`).getUTCDay();
    const start = addDays(month, -startOffset);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.filter((event) => !hidden.has(event.kind))
      .forEach((event) => map.set(event.date, [...(map.get(event.date) ?? []), event]));
    return map;
  }, [events, hidden]);
  const selectedEvents = byDate.get(selectedDate) ?? [];
  // An empty day reads differently when the filters are what emptied it.
  const filteredOut = useMemo(
    () => events.filter((event) => event.date === selectedDate && hidden.has(event.kind)).length,
    [events, hidden, selectedDate],
  );

  function toggleKind(kind: EventKind) {
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  }

  function moveMonth(offset: number) {
    const value = new Date(`${month}T00:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + offset);
    const next = value.toISOString().slice(0, 10);
    setMonth(next);
    setSelectedDate(next);
  }

  const monthLabel = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(new Date(`${month}T00:00:00Z`));
  const selectedLabel = new Intl.DateTimeFormat("en-SG", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T00:00:00Z`));

  return <div className="calendar-page">
    <section className="calendar-panel panel-card">
      <div className="calendar-toolbar"><button onClick={() => moveMonth(-1)} aria-label="Previous month"><Icon name="chevron-left" /></button><div><p className="eyebrow">STUDY CALENDAR</p><h3>{monthLabel}</h3></div><button onClick={() => moveMonth(1)} aria-label="Next month"><Icon name="chevron-right" /></button></div>
      <div className="calendar-legend" role="group" aria-label="Show or hide calendar items by where they come from">
        <span className="calendar-filter-label" aria-hidden="true">Show</span>
        {EVENT_KINDS.map(({ kind, label }) => <button
          key={kind}
          type="button"
          className={`calendar-filter ${kind}${hidden.has(kind) ? " off" : ""}`}
          aria-pressed={!hidden.has(kind)}
          onClick={() => toggleKind(kind)}
        >{label}</button>)}
        {hidden.size > 0 && <button type="button" className="calendar-show-all" onClick={() => setHidden(new Set())}>Show all</button>}
        <button type="button" className="calendar-today" onClick={() => { setMonth(`${today.slice(0, 7)}-01`); setSelectedDate(today); }}>Today</button>
      </div>
      <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{calendarDays.map((date) => {
        const dayEvents = byDate.get(date) ?? [];
        return <button key={date} className={`${date.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""} ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} onClick={() => setSelectedDate(date)}>
          <b>{Number(date.slice(-2))}</b><div>{dayEvents.slice(0, 3).map((event) => <span className={event.kind} key={event.id}>{event.title}</span>)}{dayEvents.length > 3 && <i>+{dayEvents.length - 3} more</i>}</div>
        </button>;
      })}</div>
    </section>
    <aside className="calendar-agenda panel-card"><p className="eyebrow">SELECTED DAY</p><h3>{selectedLabel}</h3>{selectedEvents.length ? <div className="agenda-list">{selectedEvents.map((event) => <article key={event.id}><i className={event.kind} /><div><strong>{event.title}</strong><span>{event.detail}</span></div></article>)}</div> : filteredOut ? <div className="agenda-empty"><span><Icon name="circle" /></span><strong>{filteredOut === 1 ? "1 item is hidden" : `${filteredOut} items are hidden`}</strong><p>Turn a filter back on above to see this day.</p></div> : <div className="agenda-empty"><span><Icon name="circle" /></span><strong>Nothing scheduled</strong><p>Select another day or enjoy the space.</p></div>}</aside>
  </div>;
}
