"use client";

import { useEffect, useMemo, useState } from "react";
import type { Topic } from "./study-tracker-app";
import { syllabusProgress } from "./syllabus-progress";
import { subjectName, type Subject } from "./subjects";

type TopicActivity = {
  id: number;
  topicId: string;
  eventType: "status" | "review" | "note";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  occurredAt: string;
  topicCode?: string;
  topicTitle?: string;
  topicKind?: "chapter" | "point";
};

type ActivityScope = "chapter" | "own";

function fullMoment(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function activityTitle(item: TopicActivity) {
  if (item.eventType === "note") return "Progress update";
  if (item.eventType === "review") return `Reviewed as ${item.toStatus}`;
  return item.fromStatus === item.toStatus ? `Updated ${item.toStatus}` : `${item.fromStatus} → ${item.toStatus}`;
}

export default function TopicTimeline({ topic, topics, subjects, onClose, onMessage, onTopicUpdated }: {
  topic: Topic;
  topics: Topic[];
  subjects: Map<string, Subject>;
  onClose: () => void;
  onMessage: (message: string) => void;
  onTopicUpdated: (topicId: string, updatedAt: string) => void;
}) {
  const isChapter = topic.kind === "chapter";
  const [activity, setActivity] = useState<TopicActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<ActivityScope>("chapter");

  const points = useMemo(
    () => (isChapter ? topics.filter((item) => item.parentId === topic.id) : []),
    [isChapter, topic.id, topics],
  );
  const progress = syllabusProgress(points);

  useEffect(() => {
    const query = isChapter ? `?topicId=${encodeURIComponent(topic.id)}&scope=chapter` : `?topicId=${encodeURIComponent(topic.id)}`;
    fetch(`/api/topic-activity${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return response.json() as Promise<{ activity: TopicActivity[] }>;
      })
      .then((data) => setActivity(data.activity))
      .catch(() => onMessage(isChapter ? "This chapter’s timeline could not load." : "This topic’s timeline could not load."))
      .finally(() => setLoading(false));
  }, [topic.id, isChapter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const visibleActivity = useMemo(
    () => (isChapter && scope === "own" ? activity.filter((item) => item.topicId === topic.id) : activity),
    [activity, isChapter, scope, topic.id],
  );
  const ownCount = useMemo(() => activity.filter((item) => item.topicId === topic.id).length, [activity, topic.id]);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/topic-activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, note }),
      });
      const data = await response.json() as { activity?: TopicActivity; updatedAt?: string; error?: string };
      if (!response.ok || !data.activity || !data.updatedAt) throw new Error(data.error ?? "save");
      const saved: TopicActivity = isChapter
        ? { ...data.activity, topicCode: topic.code, topicTitle: topic.title, topicKind: "chapter" }
        : data.activity;
      setActivity((current) => [saved, ...current]);
      onTopicUpdated(topic.id, data.updatedAt);
      setNote("");
      onMessage(isChapter ? "Chapter progress update added" : "Progress update added");
    } catch (error) {
      onMessage(error instanceof Error && error.message !== "save" ? error.message : "Your progress update could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="timeline-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="topic-timeline-drawer" role="dialog" aria-modal="true" aria-labelledby="topic-timeline-title">
      <header>
        <button className="timeline-close" onClick={onClose} aria-label={isChapter ? "Close chapter timeline" : "Close topic timeline"}>×</button>
        <p className="eyebrow">{isChapter ? "CHAPTER TIMELINE" : "TOPIC TIMELINE"}</p>
        <span>{subjectName(subjects, topic.subjectId)} · {topic.code}{isChapter ? ` · ${points.length} syllabus point${points.length === 1 ? "" : "s"}` : ""}</span>
        <h3 id="topic-timeline-title">{topic.title}</h3>
        <div className="timeline-topic-meta"><b className={`status-${topic.status.toLowerCase().replaceAll(" ", "-")}`}>{topic.status}</b><span>Last updated {fullMoment(topic.updatedAt)}</span>{!isChapter && <span>Last reviewed {topic.reviewedAt ? fullMoment(topic.reviewedAt) : topic.reviewedOn ?? "Never"}</span>}</div>
        {isChapter && points.length > 0 && <div className="chapter-timeline-progress">
          <div className="chapter-progress-bar"><i style={{ width: `${progress.percent}%` }} /></div>
          <div className="chapter-progress-stats">
            <span><strong>{progress.percent}%</strong>progress</span>
            <span><strong>{progress.started}</strong>started</span>
            <span><strong>{progress.coveredOrReady}/{points.length}</strong>covered</span>
            <span><strong>{progress.ready}</strong>exam ready</span>
          </div>
        </div>}
      </header>

      <form className="timeline-note-form" onSubmit={addNote}>
        <label htmlFor="timeline-note">{isChapter ? "Add a chapter progress update" : "Add a progress update"}</label>
        <textarea id="timeline-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder={isChapter ? "How is this chapter going overall, and what is left to do?" : "What improved, what is still difficult, or what should you do next?"} required />
        <div><small>{note.length}/500</small><button className="primary-button" disabled={saving}>{saving ? "Adding…" : "Add to timeline"}</button></div>
      </form>

      <section className="topic-history">
        <div className="topic-history-heading">
          <p className="eyebrow">PROGRESS OVER TIME</p>
          <span>{visibleActivity.length} update{visibleActivity.length === 1 ? "" : "s"}</span>
        </div>
        {isChapter && <div className="timeline-scope-switch" role="group" aria-label="Timeline scope">
          <button type="button" className={scope === "chapter" ? "active" : ""} onClick={() => setScope("chapter")}>Whole chapter</button>
          <button type="button" className={scope === "own" ? "active" : ""} onClick={() => setScope("own")}>Chapter only<b>{ownCount}</b></button>
        </div>}
        {loading ? <div className="timeline-loading"><i /><i /><i /></div> : visibleActivity.length ? <div className="topic-history-list">{visibleActivity.map((item) => <article className={item.eventType} key={item.id}>
          <div className="history-marker"><i>{item.eventType === "note" ? "+" : item.eventType === "review" ? "✓" : "↗"}</i></div>
          <div>
            <strong>{activityTitle(item)}</strong>
            {isChapter && <small className="history-source">{item.topicId === topic.id ? "Whole chapter" : `${item.topicCode ?? ""} ${item.topicTitle ?? ""}`.trim()}</small>}
            {item.note && <p>{item.note}</p>}
            <time dateTime={item.occurredAt}>{fullMoment(item.occurredAt)}</time>
          </div>
        </article>)}</div> : <div className="timeline-empty">
          <span>○</span>
          <strong>No history yet</strong>
          <p>{isChapter && scope === "own" ? "Add a chapter update above, or switch to the whole chapter to see topic activity." : "Your next status change, review, or note will appear here."}</p>
        </div>}
      </section>
    </aside>
  </div>;
}
