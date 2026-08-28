"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { type Subject } from "./subjects";
import { getTopicStage, type SyllabusStage } from "./syllabus-stage";
import type { Topic } from "./study-tracker-app";


type NoteFile = {
  id: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  subjectId: string | null;
  stage: "AS" | "A2" | null;
  chapterId: string | null;
  createdAt: string;
};

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(note: NoteFile) {
  if (note.contentType === "application/pdf") return "PDF";
  if (note.contentType.startsWith("image/")) return "Image";
  if (note.contentType.includes("word")) return "Word";
  if (note.contentType.includes("powerpoint") || note.contentType.includes("presentation")) return "Slides";
  return "Text";
}

export default function NotesView({ topics, subjects, onMessage }: { topics: Topic[]; subjects: Subject[]; onMessage: (message: string) => void }) {
  const lookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const syllabuses = useMemo(() => subjects
    .filter((item) => !item.archived && item.stages.length > 0)
    .flatMap((item) => item.stages.map((stage) => ({ id: item.id, name: item.name, stage, value: `${item.id}|${stage}` }))), [subjects]);
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [syllabus, setSyllabus] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("All");
  const inputRef = useRef<HTMLInputElement>(null);
  const [subject = "", stage = ""] = syllabus.split("|") as [string, SyllabusStage | ""];
  const chapters = useMemo(() => topics.filter((topic) => (
    topic.kind === "chapter" && topic.subjectId === subject && stage && getTopicStage(topic, topics, lookup.get(subject)) === stage
  )), [lookup, stage, subject, topics]);
  const chapterById = useMemo(() => new Map(topics.filter((topic) => topic.kind === "chapter").map((topic) => [topic.id, topic])), [topics]);

  useEffect(() => {
    fetch("/api/notes")
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return response.json() as Promise<{ notes: NoteFile[] }>;
      })
      .then((data) => setNotes(data.notes))
      .catch(() => onMessage("Your notes library could not load."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("subject", subject);
    form.set("stage", stage);
    form.set("chapterId", chapterId);
    try {
      const response = await fetch("/api/notes", { method: "POST", body: form });
      const data = await response.json() as { note?: NoteFile; error?: string };
      if (!response.ok || !data.note) throw new Error(data.error ?? "upload");
      setNotes((current) => [data.note!, ...current]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onMessage(`${data.note.originalName} uploaded`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Your notes could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(note: NoteFile) {
    if (!window.confirm(`Delete ${note.originalName}?`)) return;
    try {
      const response = await fetch(`/api/notes?id=${note.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete");
      setNotes((current) => current.filter((item) => item.id !== note.id));
      onMessage("Note removed");
    } catch {
      onMessage("That note could not be removed.");
    }
  }

  const filtered = notes.filter((note) => {
    if (filter === "All") return true;
    if (filter === "General") return !note.subjectId;
    const [filterSubject, filterStage] = filter.split("|");
    return note.subjectId === filterSubject && note.stage === filterStage;
  });

  function noteLocation(note: NoteFile) {
    if (!note.subjectId || !note.stage) return "General notes";
    const chapter = note.chapterId ? chapterById.get(note.chapterId) : null;
    return chapter ? `${lookup.get(note.subjectId)?.name ?? note.subjectId} ${note.stage} · ${chapter.code} ${chapter.title}` : `${lookup.get(note.subjectId)?.name ?? note.subjectId} · ${note.stage} syllabus`;
  }

  return <div className="notes-page">
    <form className="note-upload panel-card" onSubmit={upload}>
      <div className="panel-heading"><p className="eyebrow">NOTES LIBRARY</p><h3>Upload study notes</h3><p>Choose the exact syllabus—and optionally the chapter—where each file belongs.</p></div>
      <label className={`file-drop ${file ? "has-file" : ""}`}>
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <i>{file ? "✓" : "↑"}</i><strong>{file ? file.name : "Choose a notes file"}</strong><span>{file ? fileSize(file.size) : "Up to 20 MB"}</span>
      </label>
      <div className="note-label-fields syllabus-placement">
        <label><span>Upload to syllabus</span><select value={syllabus} onChange={(event) => { setSyllabus(event.target.value); setChapterId(""); }}><option value="">General notes / no syllabus</option>{syllabuses.map((track) => <option value={track.value} key={track.value}>{track.name} — {track.stage}</option>)}</select></label>
        {syllabus && <label><span>Chapter <small>optional</small></span><select value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">Whole {stage} syllabus</option>{chapters.map((chapter) => <option value={chapter.id} key={chapter.id}>{chapter.code} · {chapter.title}</option>)}</select></label>}
      </div>
      <button className="hours-submit" disabled={!file || uploading}>{uploading ? "Uploading…" : "Upload notes"}</button>
    </form>

    <section className="notes-library panel-card">
      <div className="section-heading"><div><p className="eyebrow">YOUR FILES</p><h3>{notes.length} uploaded {notes.length === 1 ? "file" : "files"}</h3></div><select aria-label="Filter notes by syllabus" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>General</option>{syllabuses.map((track) => <option value={track.value} key={track.value}>{track.name} — {track.stage}</option>)}</select></div>
      {filtered.length ? <div className="note-grid">{filtered.map((note) => <article key={note.id}>
        <div className={`note-file-icon ${fileKind(note).toLowerCase()}`}>{fileKind(note).slice(0, 1)}</div>
        <div className="note-file-copy"><strong title={note.originalName}>{note.originalName}</strong><span title={noteLocation(note)}>{noteLocation(note)}</span><small>{fileSize(note.sizeBytes)} · {new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(note.createdAt))}</small></div>
        <a href={`/api/notes?id=${note.id}`}>Download</a><button onClick={() => remove(note)} aria-label={`Delete ${note.originalName}`}>×</button>
      </article>)}</div> : <div className="empty-state compact"><span className="notes-empty-icon">↑</span><strong>No notes here yet</strong><p>Upload a file or change the subject filter.</p></div>}
    </section>
  </div>;
}
