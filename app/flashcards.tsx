"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { type Subject } from "./subjects";
import { getTopicStage, type SyllabusStage } from "./syllabus-stage";
import type { Topic } from "./study-tracker-app";
import Icon from "./icons";
import { api } from "./data/api";
import { studyApi } from "./data/endpoints";


type ChapterGroup = { key: string; code: string; title: string; chapters: Topic[] };
type CardFilter = "all" | "new" | "learning" | "confident";
type StudyScope = "due" | "all" | "weak";
type StudyDirection = "front" | "back" | "mixed";
type Grade = "again" | "good" | "easy";

function mainChapterCode(code: string) {
  return code.split(".")[0] || code;
}

type Flashcard = {
  id: number;
  deckId: number;
  front: string;
  back: string;
  mastery: number;
  lastReviewedAt: string | null;
};

type FlashcardDeck = {
  id: number;
  title: string;
  subjectId: string | null;
  stage: "AS" | "A2" | null;
  chapterId: string | null;
  cards: Flashcard[];
};

type FlashcardResponse = {
  id?: number;
  decks?: FlashcardDeck[];
  imported?: number;
  skipped?: number;
  error?: string;
};

const DAY = 86_400_000;
// Leitner-style spaced-repetition intervals (in days) indexed by mastery 0–5.
const REVIEW_INTERVALS = [0, 1, 3, 7, 16, 35];

function reviewInterval(mastery: number) {
  return REVIEW_INTERVALS[Math.min(Math.max(mastery, 0), REVIEW_INTERVALS.length - 1)];
}

function dueTime(card: Flashcard) {
  if (!card.lastReviewedAt) return 0;
  const last = new Date(card.lastReviewedAt).getTime();
  if (Number.isNaN(last)) return 0;
  return last + reviewInterval(card.mastery) * DAY;
}

function isDue(card: Flashcard, now: number) {
  return dueTime(card) <= now;
}

// Map a recall grade onto the next mastery level, then that level's interval sets the wait.
function gradeToMastery(current: number, grade: Grade) {
  if (grade === "again") return 1;
  if (grade === "good") return Math.min(5, Math.max(2, current + 1));
  return Math.min(5, Math.max(3, current + 2));
}

function intervalLabel(mastery: number) {
  const days = reviewInterval(mastery);
  if (days <= 0) return "now";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30)} mo`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const frontIndex = header.findIndex((cell) => ["front", "question", "term", "prompt"].includes(cell));
  const backIndex = header.findIndex((cell) => ["back", "answer", "definition", "response"].includes(cell));
  const hasHeader = frontIndex >= 0 && backIndex >= 0;
  return (hasHeader ? rows.slice(1) : rows).map((cells) => ({
    front: (cells[hasHeader ? frontIndex : 0] ?? "").trim().slice(0, 1000),
    back: (cells[hasHeader ? backIndex : 1] ?? "").trim().slice(0, 2000),
  })).filter((card) => card.front && card.back).slice(0, 500);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function shuffled(values: number[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export default function FlashcardsView({ topics, subjects, onMessage }: { topics: Topic[]; subjects: Subject[]; onMessage: (message: string) => void }) {
  const lookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const syllabuses = useMemo(() => subjects
    .filter((item) => !item.archived && item.stages.length > 0)
    .flatMap((item) => item.stages.map((stage) => ({ id: item.id, name: item.name, stage, value: `${item.id}|${stage}` }))), [subjects]);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [showDeckForm, setShowDeckForm] = useState(false);
  const [deckTitle, setDeckTitle] = useState("");
  const [deckSyllabus, setDeckSyllabus] = useState("");
  const [deckChapterId, setDeckChapterId] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [studying, setStudying] = useState(false);
  const [studyComplete, setStudyComplete] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyQueue, setStudyQueue] = useState<number[]>([]);
  const [queueSides, setQueueSides] = useState<Array<"front" | "back">>([]);
  const [sessionResults, setSessionResults] = useState<Record<number, Grade>>({});
  const [studyScope, setStudyScope] = useState<StudyScope>("due");
  const [studyDirection, setStudyDirection] = useState<StudyDirection>("front");
  const [shuffleStudy, setShuffleStudy] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [cardQuery, setCardQuery] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editingFront, setEditingFront] = useState("");
  const [editingBack, setEditingBack] = useState("");
  const frontInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [deckSubject = "", deckStage = ""] = deckSyllabus.split("|") as [string, SyllabusStage | ""];
  const chapters = useMemo(() => topics.filter((topic) => (
    topic.kind === "chapter" && topic.subjectId === deckSubject && deckStage && getTopicStage(topic, topics, lookup.get(deckSubject)) === deckStage
  )), [deckStage, deckSubject, lookup, topics]);
  const chapterGroups = useMemo(() => {
    const groups = new Map<string, ChapterGroup>();
    chapters.forEach((chapter) => {
      const code = mainChapterCode(chapter.code);
      const key = `${chapter.paper ?? ""}|${code}`;
      const current = groups.get(key) ?? { key, code, title: chapter.section ?? chapter.title, chapters: [] };
      current.chapters.push(chapter);
      groups.set(key, current);
    });
    return [...groups.values()];
  }, [chapters]);
  const chapterById = useMemo(() => new Map(topics.filter((topic) => topic.kind === "chapter").map((topic) => [topic.id, topic])), [topics]);

  useEffect(() => {
    api.get<{ decks: FlashcardDeck[] }>(studyApi.flashcards.path)
      .then((data) => {
        setDecks(data.decks);
        if (data.decks[0]) setSelectedDeckId(data.decks[0].id);
        else setShowDeckForm(true);
      })
      .catch(() => onMessage("Your flashcards could not load."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "now" lives in state so spaced-repetition due dates stay pure during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const studyCard = selectedDeck?.cards.find((card) => card.id === studyQueue[studyIndex]) ?? null;
  const promptSide = queueSides[studyIndex] ?? "front";

  function scopeCards(deck: FlashcardDeck, scope: StudyScope) {
    if (scope === "all") return deck.cards;
    if (scope === "weak") return deck.cards.filter((card) => card.mastery < 4);
    return deck.cards.filter((card) => isDue(card, now));
  }

  const eligibleStudyCount = selectedDeck ? scopeCards(selectedDeck, studyScope).length : 0;
  const deckStats = useMemo(() => {
    const cards = selectedDeck?.cards ?? [];
    return {
      total: cards.length,
      fresh: cards.filter((card) => card.mastery === 0).length,
      learning: cards.filter((card) => card.mastery > 0 && card.mastery < 4).length,
      confident: cards.filter((card) => card.mastery >= 4).length,
      due: cards.filter((card) => isDue(card, now)).length,
    };
  }, [selectedDeck, now]);
  const dueByDeck = useMemo(() => new Map(decks.map((deck) => [deck.id, deck.cards.filter((card) => isDue(card, now)).length])), [decks, now]);

  const visibleCards = useMemo(() => {
    if (!selectedDeck) return [];
    const query = cardQuery.trim().toLowerCase();
    return selectedDeck.cards.filter((card) => {
      const matchesQuery = !query || card.front.toLowerCase().includes(query) || card.back.toLowerCase().includes(query);
      const matchesFilter = cardFilter === "all" || (cardFilter === "new" && card.mastery === 0) || (cardFilter === "learning" && card.mastery > 0 && card.mastery < 4) || (cardFilter === "confident" && card.mastery >= 4);
      return matchesQuery && matchesFilter;
    });
  }, [cardFilter, cardQuery, selectedDeck]);

  const resultTally = useMemo(() => {
    const values = Object.values(sessionResults);
    return {
      total: values.length,
      again: values.filter((grade) => grade === "again").length,
      good: values.filter((grade) => grade === "good").length,
      easy: values.filter((grade) => grade === "easy").length,
    };
  }, [sessionResults]);

  async function send(body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") {
    const data = method === "PATCH"
      ? await studyApi.flashcards.rate<FlashcardResponse>(body)
      : await studyApi.flashcards.send<FlashcardResponse>(body);
    if (!data.decks) throw new Error("save");
    setDecks(data.decks);
    return data;
  }

  async function createDeck(event: FormEvent) {
    event.preventDefault();
    if (!deckTitle.trim()) return;
    setSaving(true);
    try {
      const data = await send({ kind: "deck", title: deckTitle, subjectId: deckSubject || null, stage: deckStage || null, chapterId: deckChapterId || null });
      setSelectedDeckId(data.id ?? data.decks?.[0]?.id ?? null);
      setDeckTitle("");
      setDeckSyllabus("");
      setDeckChapterId("");
      setShowDeckForm(false);
      onMessage("Flashcard deck created");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Your deck could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function addCard(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeck || !front.trim() || !back.trim()) return;
    setSaving(true);
    try {
      await send({ kind: "card", deckId: selectedDeck.id, front, back });
      setFront("");
      setBack("");
      setAddedCount((count) => count + 1);
      frontInputRef.current?.focus();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Your flashcard could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function swapSides() {
    setFront(back);
    setBack(front);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedDeck) return;
    if (file.size > 2_000_000) {
      onMessage("Choose a CSV file smaller than 2 MB.");
      return;
    }
    const cards = parseCsv(await file.text());
    if (!cards.length) {
      onMessage("No usable cards found. Use front,back or question,answer columns.");
      return;
    }
    setSaving(true);
    try {
      const data = await send({ kind: "cards", deckId: selectedDeck.id, cards });
      const skipped = data.skipped ?? 0;
      onMessage(`${data.imported ?? 0} flashcards imported${skipped ? ` · ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "That CSV could not be imported.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!selectedDeck) return;
    const rows = ["front,back", ...selectedDeck.cards.map((card) => `${csvCell(card.front)},${csvCell(card.back)}`)];
    const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedDeck.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "flashcards"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onMessage("Deck exported as CSV");
  }

  function sideFor(): "front" | "back" {
    if (studyDirection === "front") return "front";
    if (studyDirection === "back") return "back";
    return Math.random() < 0.5 ? "front" : "back";
  }

  function startStudy(scope: StudyScope = studyScope, ids?: number[]) {
    if (!selectedDeck) return;
    const pool = ids ?? scopeCards(selectedDeck, scope).map((card) => card.id);
    if (!pool.length) {
      onMessage(scope === "due" ? "Nothing is due right now — great work." : "No cards match this study mode.");
      return;
    }
    const ordered = shuffleStudy ? shuffled(pool) : [...pool].sort((a, b) => {
      const first = selectedDeck.cards.find((card) => card.id === a)?.mastery ?? 0;
      const second = selectedDeck.cards.find((card) => card.id === b)?.mastery ?? 0;
      return first - second;
    });
    setStudyQueue(ordered);
    setQueueSides(ordered.map(() => sideFor()));
    setSessionResults({});
    setStudyIndex(0);
    setFlipped(false);
    setStudyComplete(false);
    setStudying(true);
  }

  async function rateCard(grade: Grade) {
    if (!studyCard) return;
    const nextMastery = gradeToMastery(studyCard.mastery, grade);
    setSessionResults((current) => ({ ...current, [studyCard.id]: grade }));
    try {
      await send({ id: studyCard.id, mastery: nextMastery }, "PATCH");
    } catch {
      onMessage("That flashcard rating was not saved.");
      return;
    }
    if (studyIndex + 1 >= studyQueue.length) {
      setStudyComplete(true);
    } else {
      setStudyIndex((index) => index + 1);
      setFlipped(false);
    }
  }

  function goPrevious() {
    if (studyIndex === 0) return;
    setStudyIndex((index) => index - 1);
    setFlipped(false);
  }

  function exitStudy() {
    setStudying(false);
    setStudyComplete(false);
  }

  // Keyboard control for the study session.
  useEffect(() => {
    if (!studying || studyComplete || !studyCard) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "Escape") { event.preventDefault(); exitStudy(); return; }
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setFlipped((value) => !value);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "Backspace") { event.preventDefault(); goPrevious(); return; }
      if (!flipped) return;
      if (event.key === "1") { event.preventDefault(); void rateCard("again"); }
      else if (event.key === "2") { event.preventDefault(); void rateCard("good"); }
      else if (event.key === "3") { event.preventDefault(); void rateCard("easy"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function resetProgress() {
    if (!selectedDeck) return;
    if (!window.confirm(`Reset review progress for all ${selectedDeck.cards.length} cards in "${selectedDeck.title}"? Card text is kept.`)) return;
    setSaving(true);
    try {
      await send({ kind: "reset", deckId: selectedDeck.id });
      onMessage("Review progress reset");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Progress could not be reset.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(card: Flashcard) {
    setEditingCardId(card.id);
    setEditingFront(card.front);
    setEditingBack(card.back);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingCardId || !editingFront.trim() || !editingBack.trim()) return;
    setSaving(true);
    try {
      await send({ id: editingCardId, front: editingFront, back: editingBack }, "PATCH");
      setEditingCardId(null);
      onMessage("Flashcard updated");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "That flashcard could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "deck" | "card", id: number) {
    if (!window.confirm(kind === "deck" ? "Delete this deck and all its cards?" : "Delete this flashcard?")) return;
    try {
      const data = await studyApi.flashcards.remove<{ decks?: FlashcardDeck[] }>(kind, id);
      if (!data.decks) throw new Error("delete");
      setDecks(data.decks);
      if (kind === "deck") setSelectedDeckId(data.decks[0]?.id ?? null);
      onMessage(kind === "deck" ? "Deck deleted" : "Flashcard deleted");
    } catch {
      onMessage("That flashcard could not be removed.");
    }
  }

  function deckLocation(deck: FlashcardDeck) {
    if (!deck.subjectId || !deck.stage) return "General deck";
    const wholeChapter = deck.chapterId?.startsWith("major:") ?? false;
    const storedChapterId = wholeChapter ? deck.chapterId!.slice("major:".length) : deck.chapterId;
    const chapter = storedChapterId ? chapterById.get(storedChapterId) : null;
    if (wholeChapter && chapter) return `${lookup.get(deck.subjectId)?.name ?? deck.subjectId} ${deck.stage} · ${mainChapterCode(chapter.code)} ${chapter.section ?? chapter.title}`;
    return chapter ? `${lookup.get(deck.subjectId)?.name ?? deck.subjectId} ${deck.stage} · ${chapter.code} ${chapter.title}` : `${lookup.get(deck.subjectId)?.name ?? deck.subjectId} · ${deck.stage} syllabus`;
  }

  const masteryLabel = (mastery: number) => mastery >= 4 ? "Confident" : mastery ? "Learning" : "New";
  const scopeCount = (scope: StudyScope) => selectedDeck ? scopeCards(selectedDeck, scope).length : 0;

  return <div className="flashcards-page">
    <aside className="deck-sidebar panel-card">
      <div className="deck-sidebar-heading"><div><p className="eyebrow">YOUR DECKS</p><h3>Flashcards</h3></div><button onClick={() => setShowDeckForm(true)} aria-label="Create deck">+</button></div>
      {decks.length ? <div className="deck-list">{decks.map((deck) => {
        const due = dueByDeck.get(deck.id) ?? 0;
        return <button key={deck.id} className={selectedDeckId === deck.id && !showDeckForm ? "active" : ""} onClick={() => { setSelectedDeckId(deck.id); setShowDeckForm(false); setStudying(false); setStudyComplete(false); setCardQuery(""); setCardFilter("all"); setAddedCount(0); }}><span><strong>{deck.title}</strong><small title={deckLocation(deck)}>{deckLocation(deck)}</small></span>{due > 0 ? <b className="due-badge" title={`${due} due for review`}>{due}</b> : <b>{deck.cards.length}</b>}</button>;
      })}</div> : <div className="deck-empty">Create your first deck to start learning.</div>}
    </aside>

    {showDeckForm || !selectedDeck ? <form className="deck-create panel-card" onSubmit={createDeck}>
      <p className="eyebrow">NEW DECK</p><h3>Build a flashcard deck</h3><p>Choose a whole numbered chapter, a specific subchapter, or the complete syllabus.</p>
      <label><span>Deck name</span><input maxLength={100} placeholder="e.g. Mechanics definitions" value={deckTitle} onChange={(event) => setDeckTitle(event.target.value)} /></label>
      <label><span>Add to syllabus</span><select value={deckSyllabus} onChange={(event) => { setDeckSyllabus(event.target.value); setDeckChapterId(""); }}><option value="">General deck / no syllabus</option>{syllabuses.map((track) => <option value={track.value} key={track.value}>{track.name} — {track.stage}</option>)}</select></label>
      {deckSyllabus && <label><span>Chapter <small>optional</small></span><select value={deckChapterId} onChange={(event) => setDeckChapterId(event.target.value)}><option value="">Whole {deckStage} syllabus</option>{chapterGroups.map((group) => <optgroup label={`${group.code} · ${group.title}`} key={group.key}><option value={`major:${group.chapters[0].id}`}>{group.code} · Whole chapter — {group.title}</option>{group.chapters.filter((chapter) => chapter.code !== group.code).map((chapter) => <option value={chapter.id} key={chapter.id}>{chapter.code} · {chapter.title}</option>)}</optgroup>)}</select></label>}
      <div className="deck-form-actions">{decks.length > 0 && <button type="button" className="ghost-button" onClick={() => setShowDeckForm(false)}>Cancel</button>}<button className="primary-button" disabled={saving || !deckTitle.trim()}>{saving ? "Creating…" : "Create deck"}</button></div>
    </form> : studying && studyComplete ? <section className="study-summary panel-card">
      <span className="summary-badge"><Icon name="check" /></span>
      <p className="eyebrow">SESSION COMPLETE</p>
      <h3>{resultTally.total} card{resultTally.total === 1 ? "" : "s"} reviewed</h3>
      <p>Nicely done. Here is how this round went.</p>
      <div className="summary-breakdown">
        <article className="again"><strong>{resultTally.again}</strong><span>Again</span></article>
        <article className="good"><strong>{resultTally.good}</strong><span>Good</span></article>
        <article className="easy"><strong>{resultTally.easy}</strong><span>Easy</span></article>
      </div>
      <div className="summary-actions">
        {resultTally.again > 0 && <button className="primary-button" onClick={() => startStudy(studyScope, Object.entries(sessionResults).filter(([, grade]) => grade === "again").map(([id]) => Number(id)))}>Review missed ({resultTally.again})</button>}
        <button className="ghost-button" onClick={() => startStudy(studyScope, [...studyQueue])}>Study again</button>
        <button className="ghost-button" onClick={exitStudy}>Back to deck</button>
      </div>
    </section> : studying && studyCard ? <section className="study-deck panel-card">
      <div className="study-deck-heading"><div><p className="eyebrow">STUDY · {studyScope === "weak" ? "NEEDS WORK" : studyScope === "all" ? "FULL DECK" : "DUE FOR REVIEW"}</p><h3>{selectedDeck.title}</h3></div><span>{studyIndex + 1} / {studyQueue.length}</span></div>
      <div className="study-progress"><i style={{ width: `${((studyIndex + (flipped ? 1 : 0)) / studyQueue.length) * 100}%` }} /></div>
      <button className={`flashcard-stage ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((value) => !value)}>
        <small>{flipped ? (promptSide === "front" ? "BACK" : "FRONT") : promptSide.toUpperCase()}</small>
        <strong>{flipped ? (promptSide === "front" ? studyCard.back : studyCard.front) : (promptSide === "front" ? studyCard.front : studyCard.back)}</strong>
        <span>{flipped ? "How well did you recall it?" : "Tap or press Space to reveal"}</span>
      </button>
      {flipped ? <div className="study-rating">
        <button onClick={() => rateCard("again")}><b>1</b>Again<small>{intervalLabel(gradeToMastery(studyCard.mastery, "again"))}</small></button>
        <button onClick={() => rateCard("good")}><b>2</b>Good<small>{intervalLabel(gradeToMastery(studyCard.mastery, "good"))}</small></button>
        <button onClick={() => rateCard("easy")}><b>3</b>Easy<small>{intervalLabel(gradeToMastery(studyCard.mastery, "easy"))}</small></button>
      </div> : <button className="reveal-answer" onClick={() => setFlipped(true)}>Reveal answer</button>}
      <div className="study-footer">
        <button className="study-nav" onClick={goPrevious} disabled={studyIndex === 0}><Icon name="arrow-left" /> Previous</button>
        <span className="study-hint">Space flip · 1/2/3 rate · ← back · Esc exit</span>
        <button className="study-nav" onClick={exitStudy}>Exit</button>
      </div>
    </section> : <div className="deck-workspace">
      <section className="deck-overview panel-card">
        <div className="deck-overview-head">
          <div><p className="eyebrow" title={deckLocation(selectedDeck)}>{deckLocation(selectedDeck)}</p><h3>{selectedDeck.title}</h3><p>{deckStats.total} card{deckStats.total === 1 ? "" : "s"} · {deckStats.confident} confident · {deckStats.due} due today</p></div>
          <div className="deck-file-actions"><label className="ghost-button import-csv">Import CSV<input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={saving} /></label><button className="ghost-button" onClick={exportCsv}>Export CSV</button><button className="ghost-button" onClick={resetProgress} disabled={saving || !deckStats.total}>Reset progress</button><button className="ghost-button danger" onClick={() => remove("deck", selectedDeck.id)}>Delete deck</button></div>
        </div>
        {deckStats.total > 0 && <div className="mastery-meter" role="img" aria-label={`${deckStats.fresh} new, ${deckStats.learning} learning, ${deckStats.confident} confident`}>
          {deckStats.fresh > 0 && <i className="seg-new" style={{ flexGrow: deckStats.fresh }} title={`${deckStats.fresh} new`} />}
          {deckStats.learning > 0 && <i className="seg-learning" style={{ flexGrow: deckStats.learning }} title={`${deckStats.learning} learning`} />}
          {deckStats.confident > 0 && <i className="seg-confident" style={{ flexGrow: deckStats.confident }} title={`${deckStats.confident} confident`} />}
        </div>}
        {deckStats.total > 0 && <div className="mastery-legend"><span><i className="seg-new" />New {deckStats.fresh}</span><span><i className="seg-learning" />Learning {deckStats.learning}</span><span><i className="seg-confident" />Confident {deckStats.confident}</span></div>}
      </section>

      <section className="study-launch panel-card">
        <div className="study-launch-copy"><p className="eyebrow">START A SESSION</p><h3>{deckStats.due > 0 ? `${deckStats.due} card${deckStats.due === 1 ? "" : "s"} due for review` : "You're all caught up"}</h3><p>Spaced repetition brings cards back right before you would forget them.</p></div>
        <div className="study-setup">
          <div className="scope-tabs" role="tablist" aria-label="Cards to study">
            <button role="tab" aria-selected={studyScope === "due"} className={studyScope === "due" ? "active" : ""} onClick={() => setStudyScope("due")}>Due <b>{scopeCount("due")}</b></button>
            <button role="tab" aria-selected={studyScope === "weak"} className={studyScope === "weak" ? "active" : ""} onClick={() => setStudyScope("weak")}>Needs work <b>{scopeCount("weak")}</b></button>
            <button role="tab" aria-selected={studyScope === "all"} className={studyScope === "all" ? "active" : ""} onClick={() => setStudyScope("all")}>All <b>{scopeCount("all")}</b></button>
          </div>
          <div className="study-setup-row">
            <label className="setup-select"><span>Show first</span><select value={studyDirection} onChange={(event) => setStudyDirection(event.target.value as StudyDirection)}><option value="front">Front side</option><option value="back">Back side</option><option value="mixed">Mixed sides</option></select></label>
            <label className="setup-check"><input type="checkbox" checked={shuffleStudy} onChange={(event) => setShuffleStudy(event.target.checked)} /> Shuffle order</label>
            <button className="primary-button study-start" disabled={!eligibleStudyCount} onClick={() => startStudy()}>Study {eligibleStudyCount}</button>
          </div>
        </div>
      </section>

      <form className="card-maker panel-card" onSubmit={addCard}>
        <div><p className="eyebrow">ADD A CARD</p><h3>Question and answer</h3><p>{addedCount > 0 ? `${addedCount} added this session · press Ctrl+Enter to save fast.` : "Tip: import a CSV to add hundreds at once."}</p></div>
        <label><span>Front</span><textarea ref={frontInputRef} maxLength={1000} placeholder="Question, term or prompt" value={front} onChange={(event) => setFront(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addCard(event); }} /></label>
        <label><span>Back <button type="button" className="swap-sides" onClick={swapSides} title="Swap front and back"><Icon name="swap" /> swap</button></span><textarea maxLength={2000} placeholder="Answer or explanation" value={back} onChange={(event) => setBack(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addCard(event); }} /></label>
        <button className="primary-button" disabled={saving || !front.trim() || !back.trim()}>{saving ? "Saving…" : "Add flashcard"}</button>
      </form>

      <section className="card-library panel-card">
        <div className="section-heading flashcard-library-heading"><div><p className="eyebrow">CARD LIBRARY</p><h3>{visibleCards.length === selectedDeck.cards.length ? `${selectedDeck.cards.length} cards` : `${visibleCards.length} of ${selectedDeck.cards.length}`}</h3></div><div className="card-library-tools"><input type="search" value={cardQuery} onChange={(event) => setCardQuery(event.target.value)} placeholder="Search cards" aria-label="Search flashcards" /><select value={cardFilter} onChange={(event) => setCardFilter(event.target.value as CardFilter)} aria-label="Filter flashcards by mastery"><option value="all">All cards</option><option value="new">New</option><option value="learning">Learning</option><option value="confident">Confident</option></select></div></div>
        {visibleCards.length ? <div className="card-list">{visibleCards.map((card) => editingCardId === card.id ? <form className="card-edit-row" onSubmit={saveEdit} key={card.id}><label><small>FRONT</small><textarea value={editingFront} onChange={(event) => setEditingFront(event.target.value)} maxLength={1000} required /></label><label><small>BACK</small><textarea value={editingBack} onChange={(event) => setEditingBack(event.target.value)} maxLength={2000} required /></label><div><button className="primary-button" disabled={saving}>Save</button><button type="button" className="ghost-button" onClick={() => setEditingCardId(null)}>Cancel</button></div></form> : <article key={card.id}><div><small>FRONT</small><strong>{card.front}</strong></div><div><small>BACK</small><span>{card.back}</span></div><b className={`mastery-tag m-${masteryLabel(card.mastery).toLowerCase()}`}>{masteryLabel(card.mastery)}</b><div className="card-row-actions"><button onClick={() => beginEdit(card)}>Edit</button><button onClick={() => remove("card", card.id)} aria-label="Delete flashcard"><Icon name="close" /></button></div></article>)}</div> : <div className="empty-state compact"><strong>{selectedDeck.cards.length ? "No matching cards" : "No cards yet"}</strong><p>{selectedDeck.cards.length ? "Try a different search or filter." : "Add one above or import a CSV with front and back columns."}</p></div>}
      </section>
    </div>}
  </div>;
}
