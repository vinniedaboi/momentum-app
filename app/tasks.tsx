"use client";

import { useMemo, useState } from "react";
import { subjectName, type Subject } from "./subjects";

export type TaskPriority = "low" | "medium" | "high";
export const TASK_LABEL_PRESETS = ["Homework", "Revision", "Past Paper", "Test Prep", "Coursework", "Admin", "Personal"] as const;

export type StudyTask = {
  id: number;
  title: string;
  subjectId: string;
  dueDate: string;
  priority: TaskPriority;
  labels: string[];
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  title: string;
  subjectId: string;
  dueDate: string;
  priority: TaskPriority;
  labels: string[];
};


function readableDate(date: string, today: string) {
  if (date === today) return "Today";
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
}

export default function TasksView({ tasks, subjects, today, adding, busyIds, onAdd, onUpdate, onDelete }: {
  tasks: StudyTask[];
  subjects: Subject[];
  today: string;
  adding: boolean;
  busyIds: Set<number>;
  onAdd: (input: TaskInput) => Promise<boolean>;
  onUpdate: (id: number, input: Partial<TaskInput> & { completed?: boolean }) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const options = useMemo(() => subjects.filter((item) => !item.archived), [subjects]);
  const lookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const [subjectId, setSubjectId] = useState("");
  const chosenSubject = subjectId || options[0]?.id || "";
  const [dueDate, setDueDate] = useState(today);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [labels, setLabels] = useState<string[]>([]);
  const [filter, setFilter] = useState<"open" | "completed" | "all">("open");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [labelFilter, setLabelFilter] = useState("All");

  const open = tasks.filter((task) => !task.completed);
  const overdue = open.filter((task) => task.dueDate < today).length;
  const dueToday = open.filter((task) => task.dueDate === today).length;
  const availableLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort((a, b) => a.localeCompare(b)), [tasks]);
  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === "open" && task.completed) return false;
    if (filter === "completed" && !task.completed) return false;
    if (subjectFilter !== "All" && task.subjectId !== subjectFilter) return false;
    return labelFilter === "All" || task.labels.includes(labelFilter);
  }), [filter, labelFilter, subjectFilter, tasks]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const saved = await onAdd({ title, subjectId: chosenSubject, dueDate, priority, labels });
    if (saved) {
      setTitle("");
      setDueDate(today);
      setPriority("medium");
      setLabels([]);
    }
  }

  return <div className="tasks-page">
    <section className="task-composer panel-card">
      <div className="task-composer-copy"><p className="eyebrow">NEW TASK</p><h3>What needs doing?</h3><p>Add homework, revision blocks and past papers, or pick General for anything outside a syllabus — admin, applications, errands. Use labels to organise work your way.</p></div>
      <form onSubmit={submit}>
        <label className="task-title-field"><span>Task</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Finish mechanics past paper" required /></label>
        <label><span>Subject</span><select value={chosenSubject} onChange={(event) => setSubjectId(event.target.value)}>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
        <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <button className="primary-button" disabled={adding}>{adding ? "Adding…" : "+ Add task"}</button>
        <div className="task-label-field"><span>Labels <small>up to 5</small></span><LabelPicker labels={labels} onChange={setLabels} /></div>
      </form>
    </section>

    <section className="task-summary" aria-label="Task summary">
      <article><span>Open</span><strong>{open.length}</strong><small>tasks remaining</small></article>
      <article className={overdue ? "urgent" : ""}><span>Overdue</span><strong>{overdue}</strong><small>{overdue ? "needs attention" : "nothing late"}</small></article>
      <article><span>Due today</span><strong>{dueToday}</strong><small>{dueToday ? "on today’s board" : "clear today"}</small></article>
      <article><span>Completed</span><strong>{tasks.filter((task) => task.completed).length}</strong><small>tasks finished</small></article>
    </section>

    <section className="task-board panel-card">
      <div className="section-heading task-board-heading">
        <div><p className="eyebrow">SUBJECT TASKS</p><h3>{filter === "open" ? "To do" : filter === "completed" ? "Completed" : "All tasks"}</h3></div>
        <div className="task-filters">
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} aria-label="Filter tasks by subject"><option value="All">All</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} aria-label="Filter tasks by label"><option>All</option>{availableLabels.map((label) => <option key={label}>{label}</option>)}</select>
          <div>{(["open", "completed", "all"] as const).map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value === "open" ? "Open" : value === "completed" ? "Done" : "All"}</button>)}</div>
        </div>
      </div>
      {visible.length ? <div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} subjects={options} lookup={lookup} today={today} busy={busyIds.has(task.id)} onUpdate={onUpdate} onDelete={onDelete} />)}</div> : <div className="empty-state compact"><span className="success-ring">✓</span><strong>{filter === "completed" ? "No completed tasks yet" : "Your task list is clear"}</strong><p>Add a subject task above whenever something comes up.</p></div>}
    </section>
  </div>;
}

function TaskRow({ task, subjects, lookup, today, busy, onUpdate, onDelete }: {
  task: StudyTask;
  subjects: Subject[];
  lookup: Map<string, Subject>;
  today: string;
  busy: boolean;
  onUpdate: (id: number, input: Partial<TaskInput> & { completed?: boolean }) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskInput>({ title: task.title, subjectId: task.subjectId, dueDate: task.dueDate, priority: task.priority, labels: task.labels });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await onUpdate(task.id, draft)) setEditing(false);
  }

  if (editing) return <form className="task-row task-edit-row" onSubmit={save}>
    <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={160} aria-label="Task name" required />
    <select value={draft.subjectId} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value })} aria-label="Task subject">{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} aria-label="Task due date" required />
    <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })} aria-label="Task priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
    <div className="task-edit-labels"><LabelPicker labels={draft.labels} onChange={(labels) => setDraft({ ...draft, labels })} compact /></div>
    <div><button className="primary-button" disabled={busy}>Save</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div>
  </form>;

  const dateState = !task.completed && task.dueDate < today ? "overdue" : task.dueDate === today ? "due" : "soon";
  return <article className={`task-row ${task.completed ? "completed" : ""}`}>
    <button className="task-check" aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={busy} onClick={() => onUpdate(task.id, { completed: !task.completed })}>{task.completed ? "✓" : ""}</button>
    <i className={`subject-pin ${lookup.get(task.subjectId)?.tone ?? "slate"}`} />
    <div className="task-copy"><strong>{task.title}</strong><span>{subjectName(lookup, task.subjectId)}</span>{task.labels.length > 0 && <div className="task-labels">{task.labels.map((label) => <b key={label}>{label}</b>)}</div>}</div>
    <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
    <span className={`date-badge ${dateState}`}>{readableDate(task.dueDate, today)}</span>
    <div className="task-row-actions"><button disabled={busy} onClick={() => { setDraft({ title: task.title, subjectId: task.subjectId, dueDate: task.dueDate, priority: task.priority, labels: task.labels }); setEditing(true); }}>Edit</button><button className="delete" disabled={busy} onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`}>×</button></div>
  </article>;
}

export function DueTasksPanel({ tasks, subjects, today, busyIds, onUpdate, onOpenTasks }: {
  tasks: StudyTask[];
  subjects: Map<string, Subject>;
  today: string;
  busyIds: Set<number>;
  onUpdate: (id: number, input: Partial<TaskInput> & { completed?: boolean }) => Promise<boolean>;
  onOpenTasks: () => void;
}) {
  const due = tasks.filter((task) => !task.completed && task.dueDate <= today).slice(0, 5);
  if (!due.length) return null;
  return <section className="due-task-panel panel-card">
    <div className="section-heading"><div><p className="eyebrow">TASKS DUE</p><h3>Also on your plate</h3></div><button className="ghost-button" onClick={onOpenTasks}>View all tasks</button></div>
    <div>{due.map((task) => <article key={task.id}>
      <button className="task-check" aria-label={`Complete ${task.title}`} disabled={busyIds.has(task.id)} onClick={() => onUpdate(task.id, { completed: true })} />
      <i className={`subject-pin ${subjects.get(task.subjectId)?.tone ?? "slate"}`} />
      <span><strong>{task.title}</strong><small>{subjectName(subjects, task.subjectId)} · {task.priority} priority{task.labels[0] ? ` · ${task.labels.join(", ")}` : ""}</small></span>
      <b className={task.dueDate < today ? "overdue" : "due"}>{task.dueDate < today ? readableDate(task.dueDate, today) : "Today"}</b>
    </article>)}</div>
  </section>;
}

function LabelPicker({ labels, onChange, compact = false }: { labels: string[]; onChange: (labels: string[]) => void; compact?: boolean }) {
  const [custom, setCustom] = useState("");

  function toggle(label: string) {
    const selected = labels.some((item) => item.toLowerCase() === label.toLowerCase());
    if (selected) onChange(labels.filter((item) => item.toLowerCase() !== label.toLowerCase()));
    else if (labels.length < 5) onChange([...labels, label]);
  }

  function addCustom() {
    const label = custom.trim().replace(/\s+/g, " ").slice(0, 24);
    if (label && labels.length < 5 && !labels.some((item) => item.toLowerCase() === label.toLowerCase())) onChange([...labels, label]);
    setCustom("");
  }

  return <div className={`task-label-picker ${compact ? "compact" : ""}`}>
    <div className="task-label-presets">{TASK_LABEL_PRESETS.map((label) => <button type="button" aria-pressed={labels.includes(label)} className={labels.includes(label) ? "active" : ""} onClick={() => toggle(label)} key={label}>{label}</button>)}</div>
    <div className="custom-label-input"><input value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} maxLength={24} placeholder="Custom label" aria-label="Custom task label" /><button type="button" onClick={addCustom} disabled={!custom.trim() || labels.length >= 5}>Add</button></div>
    {labels.length > 0 && <div className="selected-task-labels">{labels.map((label) => <button type="button" onClick={() => toggle(label)} aria-label={`Remove ${label} label`} key={label}>{label}<span>×</span></button>)}</div>}
  </div>;
}
