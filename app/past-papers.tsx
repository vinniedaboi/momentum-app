"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { KNOWN_STAGES, type SyllabusStage } from "./syllabus-stage";
import Icon from "./icons";
import { studyApi } from "./data/endpoints";

export const PAPER_SESSIONS = ["Feb/March", "May/June", "Oct/Nov", "Specimen", "Other"] as const;
export type PaperSession = (typeof PAPER_SESSIONS)[number];
export const PAPER_CONDITIONS = ["Timed", "Untimed", "Open book"] as const;
export type PaperConditions = (typeof PAPER_CONDITIONS)[number];
export const PAPER_GRADES = ["A*", "A", "B", "C", "D", "E", "U"] as const;
export type PaperGrade = (typeof PAPER_GRADES)[number];
export const PAPER_DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type PaperDifficulty = (typeof PAPER_DIFFICULTIES)[number];
export type PaperStatus = "planned" | "done";

const WEAK_TOPIC_PRESETS = ["Careless errors", "Ran out of time", "Method marks", "Wording of answer", "Forgot content"] as const;
const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_QUALIFICATION = "Cambridge International AS & A Level";

/** Subject names in the catalogue that differ from the tracker's own. */
const SUBJECT_ALIASES: Record<string, string> = { "Further Maths": "Further Math" };

const SUBJECT_TONES: Record<string, string> = {
  Mathematics: "blue",
  "Further Math": "violet",
  "Further Maths": "violet",
  Physics: "coral",
  "Computer Science": "teal",
};

export type CatalogueRow = {
  id: string;
  board: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  label: string;
  year: number;
  season: string;
  seasonCode: string;
  component: string | null;
  variant: string | null;
  paperUnitCode: string;
  stage: string | null;
  difficulty: PaperDifficulty | null;
  thresholdA: number | null;
  thresholdB: number | null;
  thresholdC: number | null;
  qpUrl: string | null;
  msUrl: string | null;
  erUrl: string | null;
};

type Facets = {
  qualifications: Array<{ value: string; count: number }>;
  subjects: Array<{ value: string; code: string; count: number }>;
  years: number[];
  seasons: string[];
  components: string[];
  variants: string[];
  difficulties: string[];
  catalogueTotal: number;
};

export type PastPaper = {
  id: number;
  paperId: string | null;
  subject: string;
  stage: SyllabusStage;
  board: string | null;
  paper: string;
  variant: string | null;
  session: PaperSession;
  year: number;
  attemptDate: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  grade: PaperGrade | null;
  durationMinutes: number | null;
  conditions: PaperConditions;
  status: PaperStatus;
  weakTopics: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PastPaperInput = Omit<PastPaper, "id" | "percentage" | "createdAt" | "updatedAt">;

export type PaperMeta = {
  paperId: string;
  difficulty: PaperDifficulty | null;
  resourceUrl: string | null;
  updatedAt: string;
};

const GRADE_BANDS: Array<{ grade: PaperGrade; minimum: number }> = [
  { grade: "A*", minimum: 90 },
  { grade: "A", minimum: 80 },
  { grade: "B", minimum: 70 },
  { grade: "C", minimum: 60 },
  { grade: "D", minimum: 50 },
  { grade: "E", minimum: 40 },
  { grade: "U", minimum: 0 },
];

export function estimatedGrade(percentage: number | null): PaperGrade | null {
  if (percentage == null) return null;
  return GRADE_BANDS.find((band) => percentage >= band.minimum)?.grade ?? "U";
}

/**
 * The published thresholds cover A, B and C only, so anything below C is
 * reported as a band rather than guessed at.
 */
function thresholdGrade(score: number | null, row: CatalogueRow | null) {
  if (score == null || !row || row.thresholdA == null) return null;
  if (score >= row.thresholdA) return "A";
  if (row.thresholdB != null && score >= row.thresholdB) return "B";
  if (row.thresholdC != null && score >= row.thresholdC) return "C";
  return "<C";
}

function gradeTone(grade: string | null) {
  if (grade === "A*" || grade === "A") return "high";
  if (grade === "B" || grade === "C") return "mid";
  if (grade === "D" || grade === "E") return "low";
  if (grade === "U" || grade === "<C") return "fail";
  return "none";
}

function sessionFor(seasonCode: string): PaperSession {
  if (seasonCode === "F/M") return "Feb/March";
  if (seasonCode === "M/J") return "May/June";
  if (seasonCode === "O/N") return "Oct/Nov";
  return "Other";
}

function trackerSubject(subject: string) {
  return SUBJECT_ALIASES[subject] ?? subject;
}

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${date}T00:00:00Z`));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type SortMode = "year-desc" | "year-asc" | "subject" | "difficulty";

export default function PastPapersView({ papers, meta, today, saving, busyIds, onAdd, onUpdate, onDelete, onSaveMeta }: {
  papers: PastPaper[];
  meta: PaperMeta[];
  today: string;
  saving: boolean;
  busyIds: Set<number>;
  onAdd: (input: PastPaperInput) => Promise<boolean>;
  onUpdate: (id: number, input: PastPaperInput) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onSaveMeta: (paperId: string, difficulty: PaperDifficulty | null, resourceUrl: string | null) => Promise<boolean>;
}) {
  const [qualification, setQualification] = useState(DEFAULT_QUALIFICATION);
  const [subject, setSubject] = useState("");
  const [stage, setStage] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [years, setYears] = useState<Set<number>>(new Set());
  const [seasons, setSeasons] = useState<Set<string>>(new Set());
  const [components, setComponents] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<Set<string>>(new Set());
  const [difficulties, setDifficulties] = useState<Set<string>>(new Set());
  const [attemptedOnly, setAttemptedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("year-desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(1);

  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<CatalogueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openPaperId, setOpenPaperId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const attemptsByPaper = useMemo(() => {
    const groups = new Map<string, PastPaper[]>();
    papers.forEach((attempt) => {
      if (!attempt.paperId) return;
      const current = groups.get(attempt.paperId) ?? [];
      current.push(attempt);
      groups.set(attempt.paperId, current);
    });
    groups.forEach((list) => list.sort((a, b) => b.attemptDate.localeCompare(a.attemptDate) || b.id - a.id));
    return groups;
  }, [papers]);

  const attemptedIds = useMemo(() => [...attemptsByPaper.keys()], [attemptsByPaper]);
  const unlisted = useMemo(() => papers.filter((attempt) => !attempt.paperId), [papers]);
  const metaById = useMemo(() => new Map(meta.map((item) => [item.paperId, item])), [meta]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams({ facets: "1" });
    if (qualification) params.set("qualification", qualification);
    studyApi.paperCatalogue
      .search<{ facets: Facets }>(params)
      .then((data) => setFacets(data.facets))
      .catch(() => setLoadError(true));
  }, [qualification]);

  const requestKey = useMemo(() => JSON.stringify({
    qualification, subject, stage, debouncedQuery, sort, page, pageSize, attemptedOnly,
    years: [...years], seasons: [...seasons], components: [...components],
    variants: [...variants], difficulties: [...difficulties], attemptedIds,
  }), [attemptedIds, attemptedOnly, components, debouncedQuery, difficulties, page, pageSize, qualification, seasons, sort, stage, subject, variants, years]);
  // Asking for attempted papers when nothing is logged has a known answer.
  const noAttemptsToShow = attemptedOnly && attemptedIds.length === 0;
  const loading = !noAttemptsToShow && loadedKey !== requestKey;

  const loadRows = useCallback(() => {
    if (noAttemptsToShow) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    if (qualification) params.set("qualification", qualification);
    if (subject) params.set("subject", subject);
    if (stage) params.set("stage", stage);
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (years.size) params.set("years", [...years].join(","));
    if (seasons.size) params.set("seasons", [...seasons].join(","));
    if (components.size) params.set("components", [...components].join(","));
    if (variants.size) params.set("variants", [...variants].join(","));
    if (difficulties.size) params.set("difficulties", [...difficulties].join(","));
    if (attemptedOnly) params.set("ids", attemptedIds.join(","));

    studyApi.paperCatalogue
      .search<{ total: number; rows: CatalogueRow[] }>(params)
      .then((data) => { setRows(data.rows); setTotal(data.total); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoadedKey(requestKey));
  }, [attemptedIds, attemptedOnly, components, debouncedQuery, difficulties, noAttemptsToShow, page, pageSize, qualification, requestKey, seasons, sort, stage, subject, variants, years]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const visibleRows = noAttemptsToShow ? [] : rows;
  const visibleTotal = noAttemptsToShow ? 0 : total;
  const totalPages = Math.max(1, Math.ceil(visibleTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const firstShown = visibleTotal ? (currentPage - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(currentPage * pageSize, visibleTotal);

  const filtersActive = Boolean(query.trim() || subject || stage || attemptedOnly
    || years.size || seasons.size || components.size || variants.size || difficulties.size);

  const scoredAttempts = useMemo(
    () => papers.filter((attempt) => attempt.status === "done" && attempt.percentage != null),
    [papers],
  );
  const averagePercent = average(scoredAttempts.map((attempt) => attempt.percentage!));
  const bestAttempt = scoredAttempts.reduce<PastPaper | null>((best, attempt) => (!best || attempt.percentage! > best.percentage! ? attempt : best), null);
  const attemptSubjects = useMemo(
    () => [...new Set(scoredAttempts.map((attempt) => attempt.subject))].sort((a, b) => a.localeCompare(b)),
    [scoredAttempts],
  );
  const weakTopicRanking = useMemo(() => {
    const counts = new Map<string, number>();
    papers.forEach((attempt) => attempt.weakTopics.forEach((topic) => counts.set(topic, (counts.get(topic) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [papers]);

  function clearFilters() {
    setQuery("");
    setSubject("");
    setStage("");
    setYears(new Set());
    setSeasons(new Set());
    setComponents(new Set());
    setVariants(new Set());
    setDifficulties(new Set());
    setAttemptedOnly(false);
    setPage(1);
  }

  function toggle<T>(value: T, current: Set<T>, setter: (next: Set<T>) => void) {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
    setPage(1);
  }

  function exportCsv() {
    const header = ["Paper", "Subject", "Year", "Season", "Date", "Score", "Total", "Percent", "Grade", "Conditions", "Weak topics", "Notes"];
    const lines = papers.map((attempt) => [
      `${attempt.paper}${attempt.variant ? ` v${attempt.variant}` : ""}`,
      attempt.subject,
      attempt.year,
      attempt.session,
      attempt.attemptDate,
      attempt.score ?? "",
      attempt.maxScore ?? "",
      attempt.percentage ?? "",
      attempt.grade ?? estimatedGrade(attempt.percentage) ?? "",
      attempt.conditions,
      attempt.weakTopics.join("; "),
      attempt.notes ?? "",
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `past-papers-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="papers-page">
    <section className="paper-summary" aria-label="Past paper summary">
      <article>
        <span>Papers attempted</span>
        <strong>{attemptedIds.length}</strong>
        <small>{papers.length} logged {papers.length === 1 ? "attempt" : "attempts"}</small>
      </article>
      <article className={averagePercent != null && averagePercent >= 80 ? "strong" : ""}>
        <span>Average score</span>
        <strong>{formatPercent(averagePercent)}</strong>
        <small>{scoredAttempts.length} scored</small>
      </article>
      <article>
        <span>Best paper</span>
        <strong>{formatPercent(bestAttempt?.percentage ?? null)}</strong>
        <small>{bestAttempt ? `${bestAttempt.subject} ${bestAttempt.paper}` : "waiting on your first"}</small>
      </article>
      <article>
        <span>Catalogue</span>
        <strong>{facets?.catalogueTotal.toLocaleString() ?? "—"}</strong>
        <small>papers with mark schemes</small>
      </article>
    </section>

    <section className="paper-database panel-card">
      <div className="section-heading paper-db-heading">
        <div>
          <p className="eyebrow">PAPER DATABASE</p>
          <h3>Find a paper</h3>
        </div>
        <div className="paper-db-actions">
          <button className="ghost-button" onClick={() => setManualOpen(true)}>+ Paper not listed</button>
          <button className="ghost-button" disabled={!papers.length} onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="paper-filters" aria-label="Filter papers">
        <label className="paper-search">
          <Icon name="search" className="search-icon" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paper or code, e.g. 9709" aria-label="Search papers" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}
        </label>
        <select value={qualification} onChange={(event) => { setQualification(event.target.value); setSubject(""); clearChips(); setPage(1); }} aria-label="Filter by qualification">
          {(facets?.qualifications ?? [{ value: DEFAULT_QUALIFICATION, count: 0 }]).map((item) => (
            <option key={item.value} value={item.value}>{item.value}</option>
          ))}
        </select>
        <select value={subject} onChange={(event) => { setSubject(event.target.value); setPage(1); }} aria-label="Filter by subject">
          <option value="">All subjects</option>
          {(facets?.subjects ?? []).map((item) => (
            <option key={item.value} value={item.value}>{item.value}{item.code ? ` (${item.code})` : ""}</option>
          ))}
        </select>
        <select value={stage} onChange={(event) => { setStage(event.target.value); setPage(1); }} aria-label="Filter by stage">
          <option value="">AS + A2</option>
          <option value="AS">AS</option>
          <option value="A2">A2</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort papers">
          <option value="year-desc">Newest paper first</option>
          <option value="year-asc">Oldest paper first</option>
          <option value="subject">By subject</option>
          <option value="difficulty">Easiest first</option>
        </select>
        <label className="paper-attempted-toggle">
          <input type="checkbox" checked={attemptedOnly} onChange={(event) => { setAttemptedOnly(event.target.checked); setPage(1); }} />
          <span>Only papers I have done</span>
        </label>
        {filtersActive && <button className="ghost-button" onClick={clearFilters}>Clear filters</button>}
      </div>

      <div className="paper-chip-filters">
        <ChipRow label="Year" items={facets?.years ?? []} selected={years} render={String} onToggle={(value) => toggle(value, years, setYears)} />
        <ChipRow label="Season" items={facets?.seasons ?? []} selected={seasons} render={(value) => value} onToggle={(value) => toggle(value, seasons, setSeasons)} />
        <ChipRow label="Paper" items={facets?.components ?? []} selected={components} render={(value) => `P${value}`} onToggle={(value) => toggle(value, components, setComponents)} />
        <ChipRow label="Variant" items={facets?.variants ?? []} selected={variants} render={(value) => `V${value}`} onToggle={(value) => toggle(value, variants, setVariants)} />
        <ChipRow label="Difficulty" items={facets?.difficulties ?? []} selected={difficulties} render={(value) => value} onToggle={(value) => toggle(value, difficulties, setDifficulties)} />
      </div>

      <div className="paper-table-tools">
        <label>Show <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Entries per page">{PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}</select> entries</label>
        <span>{loading ? "Loading…" : visibleTotal ? `Showing ${firstShown} to ${lastShown} of ${visibleTotal.toLocaleString()} papers` : "No papers match these filters"}</span>
      </div>

      <div className="paper-table-scroll">
        <table className="paper-table">
          <thead>
            <tr>
              <th scope="col">Paper</th>
              <th scope="col">Stage</th>
              <th scope="col">Difficulty</th>
              <th scope="col">Thresholds</th>
              <th scope="col">Attempts</th>
              <th scope="col">Best</th>
              <th scope="col">Files</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => <PaperTableRow
              key={row.id}
              row={row}
              attempts={attemptsByPaper.get(row.id) ?? []}
              override={metaById.get(row.id) ?? null}
              today={today}
              open={openPaperId === row.id}
              saving={saving}
              busyIds={busyIds}
              onToggle={() => setOpenPaperId(openPaperId === row.id ? null : row.id)}
              onAdd={onAdd}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onSaveMeta={onSaveMeta}
            />)}
          </tbody>
        </table>
        {!loading && !visibleRows.length && <div className="empty-state compact">
          <strong>{loadError ? "The catalogue could not load" : "No papers match these filters"}</strong>
          <p>{loadError ? "Refresh the page to try again." : "Widen a filter or clear them to see the whole catalogue."}</p>
          {!loadError && <button className="ghost-button" onClick={clearFilters}>Clear filters</button>}
        </div>}
      </div>

      {totalPages > 1 && <div className="paper-pagination">
        <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        {pageNumbers(currentPage, totalPages).map((entry, index) => (
          entry === "gap"
            ? <span key={`gap-${index}`}>…</span>
            : <button key={entry} className={entry === currentPage ? "active" : ""} onClick={() => setPage(entry)}>{entry}</button>
        ))}
        <button disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>}
    </section>

    {scoredAttempts.length > 1 && <section className="paper-analytics">
      <article className="paper-chart panel-card">
        <div className="panel-heading"><p className="eyebrow">PROGRESSION</p><h3>Score over time</h3></div>
        <ScoreChart attempts={[...scoredAttempts].sort((a, b) => a.attemptDate.localeCompare(b.attemptDate))} />
      </article>
      <article className="paper-splits panel-card">
        <div className="panel-heading"><p className="eyebrow">BREAKDOWN</p><h3>How it splits</h3></div>
        <div className="paper-split-group">
          <h4>Average by subject</h4>
          {attemptSubjects.map((item) => {
            const scored = scoredAttempts.filter((attempt) => attempt.subject === item);
            const mean = average(scored.map((attempt) => attempt.percentage!));
            return <div className="paper-split-row" key={item}>
              <i className={`subject-pin ${SUBJECT_TONES[item] ?? "neutral"}`} />
              <span>{item}</span>
              <div><i style={{ width: `${Math.min(100, mean ?? 0)}%` }} /></div>
              <b>{formatPercent(mean)}</b>
              <small>{scored.length}</small>
            </div>;
          })}
        </div>
        <div className="paper-split-group">
          <h4>Grade spread</h4>
          <div className="paper-grade-spread">
            {PAPER_GRADES.map((gradeValue) => {
              const count = scoredAttempts.filter((attempt) => (attempt.grade ?? estimatedGrade(attempt.percentage)) === gradeValue).length;
              return count ? <span key={gradeValue} className={`grade-badge ${gradeTone(gradeValue)}`}>{gradeValue}<b>{count}</b></span> : null;
            })}
          </div>
        </div>
        {weakTopicRanking.length > 0 && <div className="paper-split-group">
          <h4>Recurring problems</h4>
          <div className="paper-weak-ranking">
            {weakTopicRanking.map(([topic, count]) => <span key={topic}>{topic}<b>{count}</b></span>)}
          </div>
        </div>}
      </article>
    </section>}

    {unlisted.length > 0 && <section className="paper-unlisted panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">NOT IN THE CATALOGUE</p><h3>{unlisted.length} other {unlisted.length === 1 ? "attempt" : "attempts"}</h3></div>
      </div>
      <div className="paper-list">
        {unlisted.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} busy={busyIds.has(attempt.id)} onDelete={onDelete} />)}
      </div>
    </section>}

    {manualOpen && <ManualAttemptForm
      today={today}
      saving={saving}
      onClose={() => setManualOpen(false)}
      onAdd={async (input) => {
        const saved = await onAdd(input);
        if (saved) setManualOpen(false);
        return saved;
      }}
    />}
  </div>;

  function clearChips() {
    setYears(new Set());
    setSeasons(new Set());
    setComponents(new Set());
    setVariants(new Set());
    setDifficulties(new Set());
  }
}

function pageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

function ChipRow<T extends string | number>({ label, items, selected, render, onToggle }: {
  label: string;
  items: readonly T[];
  selected: Set<T>;
  render: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  if (!items.length) return null;
  return <div className="paper-chip-row">
    <span>{label}</span>
    <div>
      {items.map((item) => <button
        key={String(item)}
        type="button"
        aria-pressed={selected.has(item)}
        className={selected.has(item) ? "active" : ""}
        onClick={() => onToggle(item)}
      >{render(item)}</button>)}
    </div>
  </div>;
}

function PaperTableRow({ row, attempts, override, today, open, saving, busyIds, onToggle, onAdd, onUpdate, onDelete, onSaveMeta }: {
  row: CatalogueRow;
  attempts: PastPaper[];
  override: PaperMeta | null;
  today: string;
  open: boolean;
  saving: boolean;
  busyIds: Set<number>;
  onToggle: () => void;
  onAdd: (input: PastPaperInput) => Promise<boolean>;
  onUpdate: (id: number, input: PastPaperInput) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onSaveMeta: (paperId: string, difficulty: PaperDifficulty | null, resourceUrl: string | null) => Promise<boolean>;
}) {
  const difficulty = override?.difficulty ?? row.difficulty;
  const scored = attempts.filter((attempt) => attempt.status === "done" && attempt.score != null);
  const bestScore = scored.length ? Math.max(...scored.map((attempt) => attempt.score!)) : null;
  const bestPercent = scored.length ? Math.max(...scored.map((attempt) => attempt.percentage ?? 0)) : null;
  const best = thresholdGrade(bestScore, row) ?? estimatedGrade(bestPercent);

  return <>
    <tr className={`paper-table-row ${attempts.length ? "attempted" : ""} ${open ? "open" : ""}`}>
      <th scope="row">
        <button className="paper-name-button" onClick={onToggle} aria-expanded={open}>
          <i className={`subject-pin ${SUBJECT_TONES[row.subject] ?? "neutral"}`} />
          <span>
            <strong>{row.label}</strong>
            <small>{row.syllabusCode}{row.paperUnitCode ? `/${row.paperUnitCode}` : ""} · {row.subject}</small>
          </span>
        </button>
      </th>
      <td>{row.stage ? <span className="stage-tag">{row.stage}</span> : <span className="paper-blank">—</span>}</td>
      <td>{difficulty ? <span className={`difficulty-badge ${difficulty.toLowerCase()}`}>{difficulty}{override?.difficulty ? <em>·</em> : null}</span> : <span className="paper-blank">—</span>}</td>
      <td className="paper-thresholds">{row.thresholdA != null
        ? <span title="Grade boundaries: A / B / C">{row.thresholdA}<i>/</i>{row.thresholdB ?? "–"}<i>/</i>{row.thresholdC ?? "–"}</span>
        : <span className="paper-blank">—</span>}</td>
      <td>{attempts.length ? <span className="attempt-count">{attempts.length}</span> : <span className="paper-blank">—</span>}</td>
      <td>{bestPercent == null ? <span className="paper-blank">—</span> : <span className={`grade-badge ${gradeTone(best)}`}>{formatPercent(bestPercent)}</span>}</td>
      <td className="paper-files">
        {row.qpUrl && <a href={row.qpUrl} target="_blank" rel="noreferrer noopener">QP</a>}
        {row.msUrl && <a href={row.msUrl} target="_blank" rel="noreferrer noopener">MS</a>}
        {row.erUrl && <a href={row.erUrl} target="_blank" rel="noreferrer noopener">ER</a>}
        {override?.resourceUrl && <a href={override.resourceUrl} target="_blank" rel="noreferrer noopener">Mine</a>}
      </td>
      <td className="paper-row-toggle">
        <button onClick={onToggle} aria-expanded={open}>{open ? "Close" : attempts.length ? "Open" : "Log"}</button>
      </td>
    </tr>
    {open && <tr className="paper-detail-row">
      <td colSpan={8}>
        <PaperDetail
          row={row}
          attempts={attempts}
          override={override}
          today={today}
          saving={saving}
          busyIds={busyIds}
          onAdd={onAdd}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSaveMeta={onSaveMeta}
        />
      </td>
    </tr>}
  </>;
}

function PaperDetail({ row, attempts, override, today, saving, busyIds, onAdd, onUpdate, onDelete, onSaveMeta }: {
  row: CatalogueRow;
  attempts: PastPaper[];
  override: PaperMeta | null;
  today: string;
  saving: boolean;
  busyIds: Set<number>;
  onAdd: (input: PastPaperInput) => Promise<boolean>;
  onUpdate: (id: number, input: PastPaperInput) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
  onSaveMeta: (paperId: string, difficulty: PaperDifficulty | null, resourceUrl: string | null) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [linkDraft, setLinkDraft] = useState(override?.resourceUrl ?? "");

  const blank = {
    attemptDate: today,
    score: "",
    maxScore: "",
    durationMinutes: "",
    conditions: "Timed" as PaperConditions,
    grade: "" as "" | PaperGrade,
    weakTopics: [] as string[],
    notes: "",
  };
  const [draft, setDraft] = useState(blank);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: PastPaperInput = {
      paperId: row.id,
      subject: trackerSubject(row.subject),
      stage: row.stage === "AS" ? "AS" : "A2",
      board: row.board,
      paper: row.component ? `Paper ${row.component}` : row.paperUnitCode,
      variant: row.variant,
      session: sessionFor(row.seasonCode),
      year: row.year,
      attemptDate: draft.attemptDate,
      score: draft.score === "" ? null : Number(draft.score),
      maxScore: draft.maxScore === "" ? null : Number(draft.maxScore),
      grade: draft.grade === "" ? null : draft.grade,
      durationMinutes: draft.durationMinutes === "" ? null : Number(draft.durationMinutes),
      conditions: draft.conditions,
      status: "done",
      weakTopics: draft.weakTopics,
      notes: draft.notes.trim() || null,
    };
    const saved = editingId ? await onUpdate(editingId, input) : await onAdd(input);
    if (!saved) return;
    setDraft(blank);
    setEditingId(null);
  }

  function startEdit(attempt: PastPaper) {
    setEditingId(attempt.id);
    setDraft({
      attemptDate: attempt.attemptDate,
      score: attempt.score == null ? "" : String(attempt.score),
      maxScore: attempt.maxScore == null ? "" : String(attempt.maxScore),
      durationMinutes: attempt.durationMinutes == null ? "" : String(attempt.durationMinutes),
      conditions: attempt.conditions,
      grade: attempt.grade ?? "",
      weakTopics: attempt.weakTopics,
      notes: attempt.notes ?? "",
    });
  }

  const liveScore = draft.score === "" ? null : Number(draft.score);
  const livePercent = liveScore != null && draft.maxScore !== "" && Number(draft.maxScore) > 0
    ? Math.round((liveScore / Number(draft.maxScore)) * 1000) / 10
    : null;
  const liveGrade = thresholdGrade(liveScore, row);
  const marksOffA = liveScore != null && row.thresholdA != null ? row.thresholdA - liveScore : null;

  return <div className="paper-detail">
    <div className="paper-detail-meta">
      <div className="paper-difficulty-set">
        <span>Difficulty {row.difficulty && <small>catalogue says {row.difficulty}</small>}</span>
        <div>
          {PAPER_DIFFICULTIES.map((level) => <button
            key={level}
            type="button"
            className={(override?.difficulty ?? row.difficulty) === level ? "active" : ""}
            aria-pressed={(override?.difficulty ?? row.difficulty) === level}
            onClick={() => onSaveMeta(row.id, override?.difficulty === level ? null : level, override?.resourceUrl ?? null)}
          >{level}</button>)}
        </div>
      </div>
      {row.thresholdA != null && <div className="paper-threshold-set">
        <span>Grade boundaries</span>
        <div>
          <b>A<i>{row.thresholdA}</i></b>
          {row.thresholdB != null && <b>B<i>{row.thresholdB}</i></b>}
          {row.thresholdC != null && <b>C<i>{row.thresholdC}</i></b>}
        </div>
      </div>}
      <label className="paper-link-set">
        <span>Saved link <small>your own copy</small></span>
        <div>
          <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://…" />
          <button type="button" onClick={() => onSaveMeta(row.id, override?.difficulty ?? null, linkDraft.trim() || null)}>Save</button>
        </div>
      </label>
    </div>

    <form className="paper-attempt-form" onSubmit={submit}>
      <p className="eyebrow">{editingId ? "EDIT ATTEMPT" : "LOG AN ATTEMPT"}</p>
      <label><span>Date</span><input type="date" value={draft.attemptDate} required onChange={(event) => setDraft({ ...draft, attemptDate: event.target.value })} /></label>
      <label><span>Score</span><input type="number" min="0" max="1000" step="0.5" required placeholder="—" value={draft.score} onChange={(event) => setDraft({ ...draft, score: event.target.value })} /></label>
      <label><span>Total marks</span><input type="number" min="1" max="1000" step="0.5" required placeholder="75" value={draft.maxScore} onChange={(event) => setDraft({ ...draft, maxScore: event.target.value })} /></label>
      <div className="paper-live-percent">
        <span>Result</span>
        <strong>{formatPercent(livePercent)}{liveGrade && <b className={`grade-badge ${gradeTone(liveGrade)}`}>{liveGrade}</b>}</strong>
        <small>{marksOffA == null ? (livePercent == null ? "add both marks" : `about a ${estimatedGrade(livePercent)}`)
          : marksOffA > 0 ? `${marksOffA} marks off an A` : `${Math.abs(marksOffA)} marks above the A boundary`}</small>
      </div>
      <label><span>Time taken <small>min</small></span><input type="number" min="1" max="600" placeholder="105" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label>
      <label><span>Conditions</span><select value={draft.conditions} onChange={(event) => setDraft({ ...draft, conditions: event.target.value as PaperConditions })}>{PAPER_CONDITIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Grade <small>override</small></span><select value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value as "" | PaperGrade })}><option value="">From boundaries</option>{PAPER_GRADES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="paper-weak-field">
        <span>Where you lost marks <small>up to 8</small></span>
        <WeakTopicPicker topics={draft.weakTopics} onChange={(weakTopics) => setDraft({ ...draft, weakTopics })} />
      </div>
      <label className="paper-notes-field"><span>Notes <small>optional</small></span><textarea rows={2} maxLength={500} value={draft.notes} placeholder="What to fix before the next attempt" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="paper-form-actions">
        {editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setDraft(blank); }}>Cancel edit</button>}
        <button className="primary-button" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "+ Log attempt"}</button>
      </div>
    </form>

    {attempts.length > 0 && <div className="paper-attempt-history">
      <p className="eyebrow">YOUR ATTEMPTS</p>
      {attempts.map((attempt) => {
        const real = thresholdGrade(attempt.score, row);
        const attemptGrade = attempt.grade ?? real ?? estimatedGrade(attempt.percentage);
        return <article key={attempt.id} className={busyIds.has(attempt.id) ? "is-updating" : ""}>
          <div>
            <strong>{attempt.score}<small>/{attempt.maxScore}</small></strong>
            <span>{formatPercent(attempt.percentage)}</span>
          </div>
          <span className={`grade-badge ${gradeTone(attemptGrade)}`}>{attemptGrade}{!attempt.grade && !real && <em>est</em>}</span>
          <div className="attempt-meta">
            <b>{attempt.conditions}</b>
            <i />{shortDate(attempt.attemptDate)}
            {attempt.durationMinutes ? <><i />{attempt.durationMinutes} min</> : null}
            {attempt.weakTopics.length > 0 && <div className="paper-weak-tags">{attempt.weakTopics.map((topic) => <b key={topic}>{topic}</b>)}</div>}
            {attempt.notes && <p className="paper-note">{attempt.notes}</p>}
          </div>
          <div className="paper-row-actions">
            <button disabled={busyIds.has(attempt.id)} onClick={() => startEdit(attempt)}>Edit</button>
            <button className="delete" disabled={busyIds.has(attempt.id)} onClick={() => onDelete(attempt.id)} aria-label="Delete attempt"><Icon name="close" /></button>
          </div>
        </article>;
      })}
    </div>}
  </div>;
}

function AttemptRow({ attempt, busy, onDelete }: {
  attempt: PastPaper;
  busy: boolean;
  onDelete: (id: number) => Promise<void>;
}) {
  const grade = attempt.grade ?? estimatedGrade(attempt.percentage);
  return <article className={`paper-row ${busy ? "is-updating" : ""}`}>
    <i className={`subject-pin ${SUBJECT_TONES[attempt.subject] ?? "neutral"}`} />
    <div className="paper-copy">
      <span>{attempt.subject} · {attempt.stage}{attempt.board ? ` · ${attempt.board}` : ""}</span>
      <strong>{attempt.paper}{attempt.variant ? ` v${attempt.variant}` : ""} · {attempt.session} {attempt.year}</strong>
      <small className="paper-meta"><b>{attempt.conditions}</b><i />{shortDate(attempt.attemptDate)}</small>
      {attempt.notes && <p className="paper-note">{attempt.notes}</p>}
    </div>
    <div className="paper-score">
      <strong>{attempt.score}<small>/{attempt.maxScore}</small></strong>
      <span>{formatPercent(attempt.percentage)}</span>
    </div>
    <span className={`grade-badge ${gradeTone(grade)}`}>{grade}{!attempt.grade && <em>est</em>}</span>
    <div className="paper-row-actions">
      <button className="delete" disabled={busy} onClick={() => onDelete(attempt.id)} aria-label="Delete attempt"><Icon name="close" /></button>
    </div>
  </article>;
}

function ManualAttemptForm({ today, saving, onClose, onAdd }: {
  today: string;
  saving: boolean;
  onClose: () => void;
  onAdd: (input: PastPaperInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PastPaperInput>({
    paperId: null,
    subject: "Mathematics",
    stage: "A2",
    board: "CAIE",
    paper: "Paper 1",
    variant: null,
    session: "Other",
    year: Number(today.slice(0, 4)),
    attemptDate: today,
    score: null,
    maxScore: null,
    grade: null,
    durationMinutes: null,
    conditions: "Timed",
    status: "done",
    weakTopics: [],
    notes: null,
  });

  return <div className="timeline-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="topic-timeline-drawer" role="dialog" aria-modal="true" aria-labelledby="manual-paper-title">
      <header>
        <button className="timeline-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <p className="eyebrow">NOT IN THE CATALOGUE</p>
        <h3 id="manual-paper-title">Log any other paper</h3>
        <span>School mocks, specimen papers, or anything the catalogue is missing.</span>
      </header>
      <form className="paper-form manual-paper-form" onSubmit={async (event) => { event.preventDefault(); await onAdd(draft); }}>
        <label><span>Subject</span><input value={draft.subject} maxLength={60} required onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label>
        <label><span>Stage</span><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as SyllabusStage })}>{KNOWN_STAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Board</span><input value={draft.board ?? ""} maxLength={40} onChange={(event) => setDraft({ ...draft, board: event.target.value || null })} /></label>
        <label><span>Paper</span><input value={draft.paper} maxLength={40} required onChange={(event) => setDraft({ ...draft, paper: event.target.value })} /></label>
        <label><span>Session</span><select value={draft.session} onChange={(event) => setDraft({ ...draft, session: event.target.value as PaperSession })}>{PAPER_SESSIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Year</span><input type="number" min="1990" max="2100" value={draft.year} required onChange={(event) => setDraft({ ...draft, year: Number(event.target.value) })} /></label>
        <label><span>Date</span><input type="date" value={draft.attemptDate} required onChange={(event) => setDraft({ ...draft, attemptDate: event.target.value })} /></label>
        <label><span>Score</span><input type="number" min="0" max="1000" step="0.5" required value={draft.score ?? ""} onChange={(event) => setDraft({ ...draft, score: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label><span>Total marks</span><input type="number" min="1" max="1000" step="0.5" required value={draft.maxScore ?? ""} onChange={(event) => setDraft({ ...draft, maxScore: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label><span>Conditions</span><select value={draft.conditions} onChange={(event) => setDraft({ ...draft, conditions: event.target.value as PaperConditions })}>{PAPER_CONDITIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="paper-notes-field"><span>Notes <small>optional</small></span><textarea rows={2} maxLength={500} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} /></label>
        <div className="paper-form-actions">
          <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "+ Log paper"}</button>
        </div>
      </form>
    </aside>
  </div>;
}

function ScoreChart({ attempts }: { attempts: PastPaper[] }) {
  const width = 640;
  const height = 210;
  const padding = { top: 16, right: 14, bottom: 26, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = attempts.map((attempt, index) => ({
    attempt,
    x: padding.left + (attempts.length === 1 ? plotWidth / 2 : (index / (attempts.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (Math.min(100, attempt.percentage!) / 100) * plotHeight,
  }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  return <div className="paper-chart-body">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Past paper scores over time">
      {[0, 25, 50, 75, 100].map((mark) => {
        const y = padding.top + plotHeight - (mark / 100) * plotHeight;
        return <g key={mark}>
          <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e7e3da" strokeWidth="1" />
          <text x={padding.left - 7} y={y + 3} textAnchor="end" fontSize="9" fill="#8b93a2">{mark}</text>
        </g>;
      })}
      <polyline points={line} fill="none" stroke="#516f9f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point) => <circle key={point.attempt.id} cx={point.x} cy={point.y} r="4" fill="#fff" stroke="#516f9f" strokeWidth="2">
        <title>{`${point.attempt.subject} ${point.attempt.paper} · ${formatPercent(point.attempt.percentage)} · ${shortDate(point.attempt.attemptDate)}`}</title>
      </circle>)}
    </svg>
    <div className="paper-chart-axis">
      <span>{shortDate(attempts[0].attemptDate)}</span>
      <span>{shortDate(attempts[attempts.length - 1].attemptDate)}</span>
    </div>
  </div>;
}

function WeakTopicPicker({ topics, onChange }: { topics: string[]; onChange: (topics: string[]) => void }) {
  const [custom, setCustom] = useState("");

  function toggleTopic(topic: string) {
    const selected = topics.some((item) => item.toLowerCase() === topic.toLowerCase());
    if (selected) onChange(topics.filter((item) => item.toLowerCase() !== topic.toLowerCase()));
    else if (topics.length < 8) onChange([...topics, topic]);
  }

  function addCustom() {
    const topic = custom.trim().replace(/\s+/g, " ").slice(0, 40);
    if (topic && topics.length < 8 && !topics.some((item) => item.toLowerCase() === topic.toLowerCase())) onChange([...topics, topic]);
    setCustom("");
  }

  return <div className="paper-weak-picker">
    <div className="paper-weak-presets">
      {WEAK_TOPIC_PRESETS.map((topic) => <button type="button" key={topic} aria-pressed={topics.includes(topic)} className={topics.includes(topic) ? "active" : ""} onClick={() => toggleTopic(topic)}>{topic}</button>)}
    </div>
    <div className="custom-label-input">
      <input value={custom} maxLength={40} placeholder="Topic or mistake" aria-label="Custom weak topic"
        onChange={(event) => setCustom(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} />
      <button type="button" onClick={addCustom} disabled={!custom.trim() || topics.length >= 8}>Add</button>
    </div>
    {topics.length > 0 && <div className="selected-task-labels">
      {topics.map((topic) => <button type="button" key={topic} onClick={() => toggleTopic(topic)} aria-label={`Remove ${topic}`}>{topic}<Icon name="close" /></button>)}
    </div>}
  </div>;
}
