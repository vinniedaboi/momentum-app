"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Topic } from "./study-tracker-app";
import { SUBJECT_TONES, type Subject, type SubjectInput, type SubjectTone } from "./subjects";
import Icon from "./icons";
import { api, apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";
import { stagesForQualification } from "./syllabus-stage";

type CatalogueSubject = { qualification: string; board: string; subject: string; code: string; papers: number; hasStages: boolean; stages: string[] | null };

type SyllabusVersion = {
  recordId: string; subject: string; syllabusCode: string; yearFrom: number | null; yearTo: number | null;
  isCurrent: boolean; isLatest: boolean; pdfUrl: string | null; pageUrl: string | null; chapters: number; points: number;
};
type SyllabusContentRow = { code: string; kind: "chapter" | "point"; parentCode: string | null; title: string; academicLevel: string | null };

function versionLabel(version: SyllabusVersion) {
  const window = version.yearFrom ? `${version.yearFrom}${version.yearTo && version.yearTo !== version.yearFrom ? `–${version.yearTo}` : ""}` : "";
  const tag = version.isCurrent ? "current" : version.isLatest ? "latest" : "";
  return `${window}${tag ? ` (${tag})` : ""}`;
}

/** A rotating palette so board-picked subjects get distinct colours. */
const AUTO_TONES: SubjectTone[] = ["blue", "violet", "coral", "teal", "amber", "rose", "lime", "slate"];

function shortNameFor(subject: string) {
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length === 1) return subject.slice(0, 4);
  return words.map((word) => word[0]).join("").slice(0, 5);
}

const STAGE_PRESETS: Array<{ label: string; detail: string; stages: string[] }> = [
  { label: "AS + A2", detail: "Two-year A Level split", stages: ["AS", "A2"] },
  { label: "SL + HL", detail: "IB standard and higher level", stages: ["SL", "HL"] },
  { label: "Single stage", detail: "IGCSE, O Level, one-year courses", stages: ["A2"] },
];

type ImportRow = { code: string; title: string; kind: "chapter" | "point"; parentCode: string | null; paper: string | null; section: string | null; academicLevel: string | null };

const IMPORT_HEADER = "code,title,kind,parent,paper,section";
const IMPORT_SAMPLE = `${IMPORT_HEADER}
1,Atoms and reactions,chapter,,P1,Physical chemistry
1.1,Atomic structure and isotopes,point,1,P1,Physical chemistry
1.2,Relative masses and the mole,point,1,P1,Physical chemistry
2,Electrons and bonding,chapter,,P1,Physical chemistry
2.1,Electron configuration,point,2,P1,Physical chemistry`;

const TEXT_SAMPLE = `1 Atomic structure
1.1 Particles in the atom
Candidates should be able to describe the relative charge and mass of protons, neutrons and electrons.
1.2 The nucleus of the atom
1.3 Electron configurations
2 Chemical bonding
2.1 Ionic bonding
2.2 Covalent bonding
2.3 Intermolecular forces`;

/** Splits one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** Parses the syllabus CSV, tolerating a header row and extra columns. */
function parseSyllabusCsv(text: string): { rows: ImportRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0 };
  const header = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const hasHeader = header.includes("code") && header.includes("title");
  const columnOf = (names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const map = hasHeader
    ? {
        code: columnOf(["code"]),
        title: columnOf(["title", "name"]),
        kind: columnOf(["kind", "type"]),
        parent: columnOf(["parent", "parentcode", "chapter"]),
        paper: columnOf(["paper", "component"]),
        section: columnOf(["section", "topic"]),
        level: columnOf(["academiclevel", "level", "stage"]),
      }
    : { code: 0, title: 1, kind: 2, parent: 3, paper: 4, section: 5, level: 6 };

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line);
    const code = (cells[map.code] ?? "").trim();
    const title = (cells[map.title] ?? "").trim();
    if (!code || !title) { skipped += 1; continue; }
    const kindRaw = (cells[map.kind] ?? "").trim().toLowerCase();
    const kind: "chapter" | "point" = kindRaw === "chapter" ? "chapter" : "point";
    const at = (index: number) => (index >= 0 ? (cells[index] ?? "").trim() || null : null);
    rows.push({
      code,
      title,
      kind,
      parentCode: kind === "point" ? at(map.parent) : null,
      paper: at(map.paper),
      section: at(map.section),
      academicLevel: at(map.level),
    });
  }
  return { rows, skipped };
}

/**
 * Turns pasted syllabus content into a chapter/point tree by reading the
 * numbered outline, e.g. "1 Atomic structure" (chapter) then "1.1 …", "1.2 …"
 * (points). Non-numbered lines — the learning-outcome prose — are ignored.
 * The shallowest numbered depth becomes chapters; the next depth down becomes
 * their points, and anything deeper folds up to its chapter.
 */
function parseSyllabusText(text: string): { rows: ImportRow[]; skipped: number } {
  const matches: Array<{ code: string; depth: number; title: string }> = [];
  let skipped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // A leading dotted number, then the heading. Tolerates "1.2.3)" or "1.2 -".
    const match = line.match(/^(\d+(?:\.\d+)*)[).\s-]+(.{2,})$/);
    if (!match) { skipped += 1; continue; }
    const code = match[1].replace(/\.$/, "");
    matches.push({ code, depth: code.split(".").length, title: match[2].trim().replace(/\s+/g, " ").slice(0, 300) });
  }
  if (!matches.length) return { rows: [], skipped };

  const codes = new Set(matches.map((item) => item.code));
  const hasChild = (code: string) => matches.some((item) => item.code.startsWith(`${code}.`));
  // Chapter depth = the shallowest level that actually has children beneath it.
  const parentDepths = matches.filter((item) => hasChild(item.code)).map((item) => item.depth);
  const chapterDepth = parentDepths.length ? Math.min(...parentDepths) : Math.min(...matches.map((item) => item.depth));

  const rows: ImportRow[] = [];
  for (const item of matches) {
    if (item.depth < chapterDepth) continue; // headings above the chapter grain
    if (item.depth === chapterDepth) {
      rows.push({ code: item.code, title: item.title, kind: "chapter", parentCode: null, paper: null, section: null, academicLevel: null });
    } else {
      const parentCode = item.code.split(".").slice(0, chapterDepth).join(".");
      rows.push({ code: item.code, title: item.title, kind: "point", parentCode: codes.has(parentCode) ? parentCode : null, paper: null, section: null, academicLevel: null });
    }
  }
  return { rows, skipped };
}

function parseImport(text: string, mode: "text" | "csv") {
  return mode === "csv" ? parseSyllabusCsv(text) : parseSyllabusText(text);
}

function emptyDraft(): SubjectInput {
  return {
    name: "",
    shortName: null,
    tone: "blue",
    board: "CAIE",
    qualification: null,
    syllabusCode: null,
    stages: ["AS", "A2"],
    paperStages: {},
  };
}

function toDraft(subject: Subject): SubjectInput {
  return {
    name: subject.name,
    shortName: subject.shortName,
    tone: subject.tone,
    board: subject.board,
    qualification: subject.qualification,
    syllabusCode: subject.syllabusCode,
    stages: subject.stages,
    paperStages: subject.paperStages,
  };
}

function ImportPreview({ text, mode }: { text: string; mode: "text" | "csv" }) {
  if (!text.trim()) return null;
  const { rows, skipped } = parseImport(text, mode);
  if (!rows.length) return <p className="subject-import-preview warn">Nothing detected yet — {mode === "text" ? "each line needs a leading number like 1.1" : "each row needs a code and a title"}.</p>;
  const chapters = rows.filter((row) => row.kind === "chapter").length;
  const points = rows.length - chapters;
  const orphans = rows.filter((row) => row.kind === "point" && row.parentCode && !rows.some((other) => other.kind === "chapter" && other.code === row.parentCode)).length;
  return <p className="subject-import-preview">
    <b>{chapters}</b> chapter{chapters === 1 ? "" : "s"} · <b>{points}</b> point{points === 1 ? "" : "s"}
    {skipped ? ` · ${skipped} blank row${skipped === 1 ? "" : "s"} skipped` : ""}
    {orphans ? <span className="warn"> · {orphans} point{orphans === 1 ? "" : "s"} reference a missing chapter</span> : null}
  </p>;
}

export default function SubjectSettings({ subjects, topics, onMessage, onChanged }: {
  subjects: Subject[];
  topics: Topic[];
  onMessage: (message: string) => void;
  onChanged: (subjects: Subject[]) => void;
}) {
  const [draft, setDraft] = useState<SubjectInput>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [paperDraft, setPaperDraft] = useState("");
  const [importFor, setImportFor] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"official" | "text" | "csv">("text");
  const [directory, setDirectory] = useState<CatalogueSubject[]>([]);
  const [versions, setVersions] = useState<SyllabusVersion[]>([]);
  const [officialChapters, setOfficialChapters] = useState<Array<{ code: string; title: string; academicLevel: string | null; points: SyllabusContentRow[] }>>([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [pickQualification, setPickQualification] = useState("");
  const [pickSubject, setPickSubject] = useState("");

  useEffect(() => {
    studyApi.paperCatalogue
      .directory<{ subjects: CatalogueSubject[] }>()
      .then((data) => setDirectory(data.subjects))
      .catch(() => null);
  }, []);

  useEffect(() => {
    studyApi.syllabus
      .versions<{ versions: SyllabusVersion[] }>()
      .then((data) => setVersions(data.versions))
      .catch(() => null);
  }, []);

  /** The best parsed version for a syllabus code — current first, then latest. */
  const officialFor = useMemo(() => {
    const byCode = new Map<string, SyllabusVersion>();
    for (const version of versions) {
      if (!version.chapters && !version.points) continue;
      const existing = byCode.get(version.syllabusCode);
      if (!existing || (version.isCurrent && !existing.isCurrent)) byCode.set(version.syllabusCode, version);
    }
    return byCode;
  }, [versions]);

  async function loadOfficial(version: SyllabusVersion) {
    setOfficialLoading(true);
    setOfficialChapters([]);
    try {
      const data = await studyApi.syllabus.content<{ content?: SyllabusContentRow[] }>(version.recordId);
      const content = data.content ?? [];
      const chapters = content.filter((row) => row.kind === "chapter").map((chapter) => ({
        code: chapter.code,
        title: chapter.title,
        academicLevel: chapter.academicLevel,
        points: content.filter((row) => row.kind === "point" && row.parentCode === chapter.code),
      }));
      setOfficialChapters(chapters);
    } catch {
      onMessage("The official syllabus could not load.");
    } finally {
      setOfficialLoading(false);
    }
  }

  const qualifications = useMemo(
    () => [...new Set(directory.map((item) => item.qualification))],
    [directory],
  );
  const pickOptions = useMemo(
    () => directory.filter((item) => item.qualification === pickQualification),
    [directory, pickQualification],
  );
  const existingCodes = useMemo(
    () => new Set(subjects.map((item) => item.syllabusCode).filter(Boolean)),
    [subjects],
  );

  function applyCataloguePick(pick: CatalogueSubject) {
    const usedTones = new Set(subjects.map((item) => item.tone));
    const tone = AUTO_TONES.find((item) => !usedTones.has(item)) ?? "blue";
    setDraft({
      name: pick.subject,
      shortName: shortNameFor(pick.subject),
      tone,
      board: pick.board || "CAIE",
      qualification: pick.qualification,
      syllabusCode: pick.code || null,
      stages: pick.stages ?? stagesForQualification(pick.qualification),
      paperStages: {},
    });
    setImportText("");
    setOfficialChapters([]);
    const official = officialFor.get(pick.code);
    setImportMode(official ? "official" : "text");
    if (official) loadOfficial(official);
  }

  async function refresh() {
    const data = await api.get<{ subjects?: Subject[] }>(studyApi.subjects.path);
    if (data.subjects) onChanged(data.subjects);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prepared = !editingId
      ? importMode === "official"
        ? { rows: officialRows(), skipped: 0 }
        : parseImport(importText, importMode)
      : null;
    if (prepared && !prepared.rows.length) {
      onMessage(importMode === "official" ? "Load the official syllabus before adding this subject." : "Paste a syllabus with numbered headings before adding this subject.");
      return;
    }

    setSaving(true);
    setImporting(!editingId);
    let createdSubject: Subject | null = null;
    let creationCompleted = false;
    try {
      const data = editingId
        ? await studyApi.subjects.update<{ subject: Subject }>({ id: editingId, ...draft })
        : await studyApi.subjects.create<{ subject: Subject }>(draft);
      createdSubject = data.subject;

      let importSummary = "";
      if (!editingId && prepared) {
        const orphans = prepared.rows.filter((row) => row.kind === "point" && row.parentCode && !prepared.rows.some((other) => other.kind === "chapter" && other.code === row.parentCode)).length;
        const topicsData = await studyApi.topics.import<{ imported: { chapters: number; points: number } }>({
          subjectId: data.subject.id, topics: prepared.rows,
        });
        const notes = [prepared.skipped ? `${prepared.skipped} row${prepared.skipped === 1 ? "" : "s"} skipped` : "", orphans ? `${orphans} point${orphans === 1 ? "" : "s"} had no matching chapter` : ""].filter(Boolean);
        importSummary = `${topicsData.imported.chapters} chapters and ${topicsData.imported.points} points imported${notes.length ? ` (${notes.join(", ")})` : ""}`;
        creationCompleted = true;
      }

      await refresh();
      onMessage(editingId ? "Subject updated" : `${draft.name} added · ${importSummary}`);
      setDraft(emptyDraft());
      setEditingId(null);
      setComposerOpen(false);
      setImportText("");
      setOfficialChapters([]);
      setImportMode("text");
    } catch (error) {
      if (!editingId && createdSubject && !creationCompleted) {
        await studyApi.subjects.remove(createdSubject.id).catch(() => null);
      }
      const fallback = !editingId && createdSubject ? "The syllabus could not be imported, so the subject was not added." : "That subject could not be saved.";
      onMessage(apiMessage(error, fallback));
    } finally {
      setSaving(false);
      setImporting(false);
    }
  }

  async function toggleArchived(subject: Subject) {
    try {
      await studyApi.subjects.update({ id: subject.id, archived: !subject.archived });
      await refresh();
      onMessage(subject.archived ? `${subject.name} restored` : `${subject.name} archived`);
    } catch {
      onMessage("That subject could not be updated.");
    }
  }

  async function move(subject: Subject, direction: -1 | 1) {
    const ordered = [...subjects].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((item) => item.id === subject.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await studyApi.subjects.update({ order: ordered.map((item) => item.id) });
      await refresh();
    } catch {
      onMessage("That order could not be saved.");
    }
  }

  async function remove(subject: Subject) {
    try {
      await studyApi.subjects.remove(subject.id);
      await refresh();
      onMessage(`${subject.name} and its data were removed`);
      setConfirmDelete(null);
    } catch {
      onMessage("That subject could not be removed.");
    }
  }

  function startEdit(subject: Subject) {
    setEditingId(subject.id);
    setDraft(toDraft(subject));
    setComposerOpen(true);
  }

  function officialRows(): ImportRow[] {
    const rows: ImportRow[] = [];
    for (const chapter of officialChapters) {
      const title = chapter.title.trim() || `Topic ${chapter.code}`;
      rows.push({ code: chapter.code, title, kind: "chapter", parentCode: null, paper: null, section: null, academicLevel: chapter.academicLevel });
      for (const point of chapter.points) {
        rows.push({ code: point.code, title: point.title, kind: "point", parentCode: chapter.code, paper: null, section: null, academicLevel: point.academicLevel ?? chapter.academicLevel });
      }
    }
    return rows;
  }

  async function importSyllabus(subject: Subject) {
    const { rows, skipped } = importMode === "official"
      ? { rows: officialRows(), skipped: 0 }
      : parseImport(importText, importMode);
    if (!rows.length) {
      onMessage(importMode === "official" ? "Load the official syllabus first." : "No rows had both a code and a title. Check the format.");
      return;
    }
    const orphans = rows.filter((row) => row.kind === "point" && row.parentCode && !rows.some((other) => other.kind === "chapter" && other.code === row.parentCode)).length;
    setImporting(true);
    try {
      const data = await studyApi.topics.import<{ imported: { chapters: number; points: number } }>({
        subjectId: subject.id, topics: rows,
      });
      await refresh();
      const notes = [skipped ? `${skipped} row${skipped === 1 ? "" : "s"} skipped` : "", orphans ? `${orphans} point${orphans === 1 ? "" : "s"} had no matching chapter` : ""].filter(Boolean);
      onMessage(`${subject.name}: ${data.imported.chapters} chapters, ${data.imported.points} points imported${notes.length ? ` (${notes.join(", ")})` : ""}`);
      setImportFor(null);
      setImportText("");
      setOfficialChapters([]);
    } catch (error) {
      onMessage(apiMessage(error, "That syllabus could not be imported."));
    } finally {
      setImporting(false);
    }
  }

  function addPaperRule() {
    const paper = paperDraft.trim().slice(0, 16);
    if (!paper || !draft.stages.length) return;
    setDraft({ ...draft, paperStages: { ...draft.paperStages, [paper]: draft.stages[0] } });
    setPaperDraft("");
  }

  const ordered = [...subjects].sort((a, b) => a.position - b.position);
  const draftOfficial = draft.syllabusCode ? officialFor.get(draft.syllabusCode) : undefined;
  const draftOfficialPoints = officialChapters.reduce((sum, chapter) => sum + chapter.points.length, 0);
  const draftPlaceholders = officialChapters.filter((chapter) => /^Topic /.test(chapter.title.trim())).length;
  const draftMissingStages = draft.stages.length > 1 ? officialChapters.filter((chapter) => !chapter.academicLevel).length : 0;
  const newImportReady = importMode === "official" ? officialChapters.length > 0 : Boolean(importText.trim());

  return <div className="subjects-page">
    <section className="subject-settings-intro panel-card">
      <div>
        <p className="eyebrow">SUBJECTS</p>
        <h3>What you study</h3>
        <p>Add a subject and it appears across the whole tracker — review board, tasks, goals, hours, notes and papers. Everything is stored against a stable id, so renaming a subject never loses your work.</p>
      </div>
      {!composerOpen && <button className="primary-button" onClick={() => { setEditingId(null); setDraft(emptyDraft()); setPickQualification(""); setPickSubject(""); setImportText(""); setOfficialChapters([]); setImportMode("text"); setComposerOpen(true); }}>+ Add subject</button>}
    </section>

    {composerOpen && <section className="subject-composer panel-card">
      <div className="panel-heading">
        <p className="eyebrow">{editingId ? "EDIT SUBJECT" : "NEW SUBJECT"}</p>
        <h3>{editingId ? draft.name || "Subject" : "Add a subject"}</h3>
      </div>
      {!editingId && directory.length > 0 && <div className="subject-pick">
        <div className="subject-pick-copy"><strong>Start from an exam board</strong><span>Pick a syllabus and its name, code and structure fill in for you.</span></div>
        <div className="subject-pick-selects">
          <select value={pickQualification} onChange={(event) => { setPickQualification(event.target.value); setPickSubject(""); }} aria-label="Qualification">
            <option value="">Choose a qualification…</option>
            {qualifications.map((qualification) => <option key={qualification} value={qualification}>{qualification}</option>)}
          </select>
          <select value={pickSubject} disabled={!pickQualification} aria-label="Syllabus" onChange={(event) => {
            setPickSubject(event.target.value);
            const pick = pickOptions.find((item) => `${item.subject}|${item.code}` === event.target.value);
            if (pick) applyCataloguePick(pick);
          }}>
            <option value="">{pickQualification ? "Choose a subject…" : "Pick a qualification first"}</option>
            {pickOptions.map((item) => <option key={`${item.subject}|${item.code}`} value={`${item.subject}|${item.code}`} disabled={existingCodes.has(item.code)}>
              {item.subject}{item.code ? ` (${item.code})` : ""}{existingCodes.has(item.code) ? " · added" : ""}
            </option>)}
          </select>
        </div>
      </div>}
      <form onSubmit={submit}>
        <label className="subject-name-field">
          <span>Name</span>
          <input value={draft.name} maxLength={60} required placeholder="e.g. Chemistry" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          <span>Short name <small>optional</small></span>
          <input value={draft.shortName ?? ""} maxLength={12} placeholder="Chem" onChange={(event) => setDraft({ ...draft, shortName: event.target.value || null })} />
        </label>
        <label>
          <span>Board <small>optional</small></span>
          <input value={draft.board ?? ""} maxLength={40} placeholder="CAIE" onChange={(event) => setDraft({ ...draft, board: event.target.value || null })} />
        </label>
        <label>
          <span>Syllabus code <small>optional</small></span>
          <input value={draft.syllabusCode ?? ""} maxLength={16} placeholder="9701"
            onChange={(event) => setDraft({ ...draft, syllabusCode: event.target.value || null })}
            onBlur={() => {
              if (editingId || !draft.syllabusCode) return;
              const official = officialFor.get(draft.syllabusCode);
              if (official && importMode !== "official") {
                setImportMode("official");
                setImportText("");
                loadOfficial(official);
              }
            }} />
        </label>
        <div className="subject-tone-field">
          <span>Colour</span>
          <div>
            {SUBJECT_TONES.map((tone) => <button
              key={tone}
              type="button"
              aria-label={tone}
              aria-pressed={draft.tone === tone}
              className={`tone-swatch ${tone} ${draft.tone === tone ? "active" : ""}`}
              onClick={() => setDraft({ ...draft, tone: tone as SubjectTone })}
            />)}
          </div>
        </div>
        <div className="subject-stage-field">
          <span>Structure</span>
          <div className="subject-stage-presets">
            {STAGE_PRESETS.map((preset) => <button
              key={preset.label}
              type="button"
              className={draft.stages.join(",") === preset.stages.join(",") ? "active" : ""}
              onClick={() => setDraft({ ...draft, stages: preset.stages, paperStages: {} })}
            ><b>{preset.label}</b><small>{preset.detail}</small></button>)}
          </div>
        </div>
        {draft.stages.length > 1 && <div className="subject-paper-field">
          <span>Which papers are {draft.stages[0]}? <small>everything else falls to {draft.stages[draft.stages.length - 1]}</small></span>
          <div className="subject-paper-rules">
            {Object.entries(draft.paperStages).map(([paper, stage]) => <span key={paper}>
              <b>{paper}</b>
              <select value={stage} onChange={(event) => setDraft({ ...draft, paperStages: { ...draft.paperStages, [paper]: event.target.value } })}>
                {draft.stages.map((item) => <option key={item}>{item}</option>)}
              </select>
              <button type="button" aria-label={`Remove ${paper}`} onClick={() => {
                const next = { ...draft.paperStages };
                delete next[paper];
                setDraft({ ...draft, paperStages: next });
              }}><Icon name="close" /></button>
            </span>)}
          </div>
          <div className="custom-label-input">
            <input value={paperDraft} maxLength={16} placeholder="Paper label, e.g. P1" aria-label="Paper label"
              onChange={(event) => setPaperDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPaperRule(); } }} />
            <button type="button" onClick={addPaperRule} disabled={!paperDraft.trim()}>Add</button>
          </div>
        </div>}
        {!editingId && <div className="subject-import subject-create-import">
          <div className="subject-import-head">
            <div>
              <strong>Import the syllabus now</strong>
              {importMode === "official"
                ? <p>The official Cambridge {draft.syllabusCode || "syllabus"}{draftOfficial ? ` (${versionLabel(draftOfficial)})` : ""} will be created with the subject in one go. Review any highlighted chapter names or stages before adding it.</p>
                : importMode === "text"
                ? <p>Paste the numbered &ldquo;Subject content&rdquo; outline. Lines such as <code>1 Atomic structure</code> become chapters and <code>1.1 Particles in the atom</code> become syllabus points.</p>
                : <p>Paste a CSV with one row per chapter and syllabus point. Columns: <code>{IMPORT_HEADER}</code>.</p>}
            </div>
            {draftOfficial?.pdfUrl && <a className="ghost-button" href={draftOfficial.pdfUrl} target="_blank" rel="noreferrer noopener">Open PDF</a>}
          </div>
          <div className="subject-import-mode" role="group" aria-label="New subject syllabus format">
            {draftOfficial && <button type="button" className={importMode === "official" ? "active" : ""} onClick={() => { setImportMode("official"); setImportText(""); if (!officialChapters.length) loadOfficial(draftOfficial); }}>Official syllabus</button>}
            <button type="button" className={importMode === "text" ? "active" : ""} onClick={() => { setImportMode("text"); setImportText(""); setOfficialChapters([]); }}>Paste text</button>
            <button type="button" className={importMode === "csv" ? "active" : ""} onClick={() => { setImportMode("csv"); setImportText(""); setOfficialChapters([]); }}>CSV</button>
          </div>

          {importMode === "official" ? <>
            {officialLoading ? <p className="subject-import-preview">Loading the official syllabus…</p> : officialChapters.length ? <>
              <p className="subject-import-preview"><b>{officialChapters.length}</b> chapters · <b>{draftOfficialPoints}</b> points{draftPlaceholders ? <span className="warn"> · {draftPlaceholders} chapter name{draftPlaceholders === 1 ? "" : "s"} to review</span> : " · all chapter names detected"}{draftMissingStages ? <span className="warn"> · {draftMissingStages} stage{draftMissingStages === 1 ? "" : "s"} to review</span> : null}</p>
              <div className="official-chapters">
                {officialChapters.map((chapter, chapterIndex) => {
                  const isPlaceholder = /^Topic /.test(chapter.title.trim());
                  const needsStage = draft.stages.length > 1 && !chapter.academicLevel;
                  return <div className={`official-chapter ${draft.stages.length > 1 ? "has-stage" : ""} ${isPlaceholder || needsStage ? "review" : ""}`} key={chapter.code}>
                    <span className="official-chapter-code">{chapter.code}</span>
                    <input value={chapter.title} aria-label={`New subject chapter ${chapter.code} title`} placeholder={`Topic ${chapter.code}`}
                      onChange={(event) => setOfficialChapters((current) => current.map((item, index) => index === chapterIndex ? { ...item, title: event.target.value } : item))} />
                    {draft.stages.length > 1 && <select value={chapter.academicLevel ?? ""} aria-label={`New subject chapter ${chapter.code} stage`}
                      onChange={(event) => setOfficialChapters((current) => current.map((item, index) => index === chapterIndex ? { ...item, academicLevel: event.target.value || null } : item))}>
                      <option value="">Stage…</option>
                      {draft.stages.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>}
                    <b>{chapter.points.length} point{chapter.points.length === 1 ? "" : "s"}</b>
                  </div>;
                })}
              </div>
            </> : <p className="subject-import-preview warn">No official content is loaded. Choose Paste text or CSV instead.</p>}
          </> : <>
            <button className="ghost-button subject-import-example" type="button" onClick={() => setImportText(importMode === "csv" ? IMPORT_SAMPLE : TEXT_SAMPLE)}>Use example</button>
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={8} spellCheck={false} placeholder={importMode === "csv" ? IMPORT_SAMPLE : TEXT_SAMPLE} aria-label={`New subject syllabus ${importMode === "csv" ? "CSV" : "text"}`} />
            <ImportPreview text={importText} mode={importMode} />
          </>}
        </div>}
        <div className="subject-form-actions">
          <button type="button" className="ghost-button" onClick={() => { setComposerOpen(false); setEditingId(null); setDraft(emptyDraft()); setPickQualification(""); setPickSubject(""); setImportText(""); setOfficialChapters([]); setImportMode("text"); }}>Cancel</button>
          <button className="primary-button" disabled={saving || (!editingId && (!newImportReady || officialLoading))}>{saving ? editingId ? "Saving…" : "Adding subject & syllabus…" : editingId ? "Save changes" : "+ Add subject & syllabus"}</button>
        </div>
      </form>
    </section>}

    <section className="subject-list panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">YOUR SUBJECTS</p><h3>{ordered.length} configured</h3></div>
      </div>
      <div className="subject-rows">
        {ordered.map((subject, index) => {
          const topicCount = topics.filter((topic) => topic.subjectId === subject.id).length;
          return <article className={`subject-row ${subject.archived ? "archived" : ""}`} key={subject.id}>
            <i className={`subject-pin ${subject.tone}`} />
            <div className="subject-row-copy">
              <strong>{subject.name}{subject.archived && <em>Archived</em>}</strong>
              <small>
                {subject.syllabusCode ? `${subject.syllabusCode} · ` : ""}
                {subject.board ? `${subject.board} · ` : ""}
                {subject.stages.length > 1 ? subject.stages.join(" + ") : "Single stage"}
                {` · ${topicCount} syllabus ${topicCount === 1 ? "row" : "rows"}`}
              </small>
            </div>
            <div className="subject-row-order">
              <button onClick={() => move(subject, -1)} disabled={index === 0} aria-label={`Move ${subject.name} up`}><Icon name="arrow-up" /></button>
              <button onClick={() => move(subject, 1)} disabled={index === ordered.length - 1} aria-label={`Move ${subject.name} down`}><Icon name="arrow-down" /></button>
            </div>
            <div className="subject-row-actions">
              {subject.stages.length > 0 && <button onClick={() => {
                const opening = importFor !== subject.id;
                setImportFor(opening ? subject.id : null);
                setImportText("");
                setOfficialChapters([]);
                const official = subject.syllabusCode ? officialFor.get(subject.syllabusCode) : undefined;
                const mode = official ? "official" : "text";
                setImportMode(mode);
                if (opening && official) loadOfficial(official);
              }}>{topicCount ? "Replace syllabus" : "Import syllabus"}</button>}
              <button onClick={() => startEdit(subject)}>Edit</button>
              <button onClick={() => toggleArchived(subject)}>{subject.archived ? "Restore" : "Archive"}</button>
              <button className="delete" onClick={() => setConfirmDelete(subject.id)} aria-label={`Delete ${subject.name}`}><Icon name="close" /></button>
            </div>
            {importFor === subject.id && (() => {
              const official = subject.syllabusCode ? officialFor.get(subject.syllabusCode) : undefined;
              const officialPoints = officialChapters.reduce((sum, chapter) => sum + chapter.points.length, 0);
              const placeholders = officialChapters.filter((chapter) => /^Topic /.test(chapter.title.trim())).length;
              const missingStages = subject.stages.length > 1 ? officialChapters.filter((chapter) => !chapter.academicLevel).length : 0;
              return <div className="subject-import">
              <div className="subject-import-head">
                <div>
                  <strong>{topicCount ? `Replace ${subject.name}'s syllabus` : `Import ${subject.name}'s syllabus`}</strong>
                  {importMode === "official"
                    ? <p>Loaded from the official Cambridge {subject.syllabusCode} syllabus PDF{official ? ` (${versionLabel(official)})` : ""}. Spec points come straight from the document — check the chapter names below, fix any marked to review, then import.{topicCount ? " This replaces the current syllabus and its progress." : ""}</p>
                    : importMode === "text"
                    ? <p>Paste the syllabus &ldquo;Subject content&rdquo; — the numbered outline. Lines like <code>1 Atomic structure</code> become chapters and <code>1.1 …</code> become points. Prose in between is ignored.{topicCount ? " This replaces the current syllabus and its progress." : ""}</p>
                    : <p>Paste a CSV with a row per chapter and point. Columns: <code>{IMPORT_HEADER}</code>. Points link to their chapter by its <code>parent</code> code.{topicCount ? " This replaces the current syllabus and its progress." : ""}</p>}
                </div>
                {official?.pdfUrl && <a className="ghost-button" href={official.pdfUrl} target="_blank" rel="noreferrer noopener">Open PDF</a>}
              </div>
              <div className="subject-import-mode" role="group" aria-label="Import format">
                {official && <button type="button" className={importMode === "official" ? "active" : ""} onClick={() => { setImportMode("official"); setImportText(""); if (!officialChapters.length) loadOfficial(official); }}>Official syllabus</button>}
                <button type="button" className={importMode === "text" ? "active" : ""} onClick={() => { setImportMode("text"); setImportText(""); }}>Paste text</button>
                <button type="button" className={importMode === "csv" ? "active" : ""} onClick={() => { setImportMode("csv"); setImportText(""); }}>CSV</button>
              </div>

              {importMode === "official" ? <>
                {officialLoading ? <p className="subject-import-preview">Loading the official syllabus…</p> : officialChapters.length ? <>
                  <p className="subject-import-preview"><b>{officialChapters.length}</b> chapters · <b>{officialPoints}</b> points{placeholders ? <span className="warn"> · {placeholders} chapter name{placeholders === 1 ? "" : "s"} to review</span> : " · all chapter names detected"}{missingStages ? <span className="warn"> · {missingStages} stage{missingStages === 1 ? "" : "s"} to review</span> : null}</p>
                  <div className="official-chapters">
                    {officialChapters.map((chapter, chapterIndex) => {
                      const isPlaceholder = /^Topic /.test(chapter.title.trim());
                      const needsStage = subject.stages.length > 1 && !chapter.academicLevel;
                      return <div className={`official-chapter ${subject.stages.length > 1 ? "has-stage" : ""} ${isPlaceholder || needsStage ? "review" : ""}`} key={chapter.code}>
                        <span className="official-chapter-code">{chapter.code}</span>
                        <input value={chapter.title} aria-label={`Chapter ${chapter.code} title`} placeholder={`Topic ${chapter.code}`}
                          onChange={(event) => setOfficialChapters((current) => current.map((item, index) => index === chapterIndex ? { ...item, title: event.target.value } : item))} />
                        {subject.stages.length > 1 && <select value={chapter.academicLevel ?? ""} aria-label={`Chapter ${chapter.code} stage`}
                          onChange={(event) => setOfficialChapters((current) => current.map((item, index) => index === chapterIndex ? { ...item, academicLevel: event.target.value || null } : item))}>
                          <option value="">Stage…</option>
                          {subject.stages.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>}
                        <b>{chapter.points.length} point{chapter.points.length === 1 ? "" : "s"}</b>
                      </div>;
                    })}
                  </div>
                </> : <p className="subject-import-preview warn">No parsed content for this syllabus. Use paste or CSV instead.</p>}
              </> : <>
                <button className="ghost-button subject-import-example" type="button" onClick={() => setImportText(importMode === "csv" ? IMPORT_SAMPLE : TEXT_SAMPLE)}>Use example</button>
                <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={8} spellCheck={false} placeholder={importMode === "csv" ? IMPORT_SAMPLE : TEXT_SAMPLE} aria-label={`${subject.name} syllabus ${importMode === "csv" ? "CSV" : "text"}`} />
                <ImportPreview text={importText} mode={importMode} />
              </>}

              <div className="subject-import-actions">
                <button className="ghost-button" type="button" onClick={() => { setImportFor(null); setImportText(""); setOfficialChapters([]); }}>Cancel</button>
                <button className="primary-button" type="button" disabled={importing || (importMode === "official" ? !officialChapters.length : !importText.trim())} onClick={() => importSyllabus(subject)}>{importing ? "Importing…" : topicCount ? "Replace syllabus" : "Import syllabus"}</button>
              </div>
            </div>;
            })()}
            {confirmDelete === subject.id && <div className="subject-delete-confirm">
              <strong>Delete {subject.name}?</strong>
              <p>This permanently removes its {topicCount} syllabus rows plus any tasks, goals, sessions, decks, notes and paper attempts filed under it. Archiving hides it instead and keeps everything.</p>
              <div>
                <button className="ghost-button" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="ghost-button" onClick={() => { setConfirmDelete(null); toggleArchived(subject); }}>Archive instead</button>
                <button className="danger-button" onClick={() => remove(subject)}>Delete everything</button>
              </div>
            </div>}
          </article>;
        })}
      </div>
    </section>
  </div>;
}
