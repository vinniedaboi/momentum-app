import { getSql } from "./db";

/**
 * Read access to the Cambridge syllabus directory and the spec-point content
 * parsed from the official PDFs. Both tables are shared across accounts and are
 * populated offline by scripts/import-shared-data.mjs; the app only reads them.
 */

export type SyllabusVersion = {
  recordId: string;
  board: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  yearFrom: number | null;
  yearTo: number | null;
  isCurrent: boolean;
  isLatest: boolean;
  pdfUrl: string | null;
  pageUrl: string | null;
  notes: string | null;
  chapters: number;
  points: number;
};

export type SyllabusContentRow = {
  code: string;
  kind: "chapter" | "point";
  parentCode: string | null;
  title: string;
  academicLevel: string | null;
};

export async function getSyllabusVersions(): Promise<SyllabusVersion[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT v.*,
      (SELECT COUNT(*)::int FROM syllabus_content c WHERE c.record_id = v.record_id AND c.kind = 'chapter') AS chapters,
      (SELECT COUNT(*)::int FROM syllabus_content c WHERE c.record_id = v.record_id AND c.kind = 'point') AS points
    FROM syllabus_versions v
    ORDER BY v.subject, v.year_from DESC
  `;

  return rows.map((row) => ({
    recordId: String(row.record_id),
    board: String(row.board),
    qualification: String(row.qualification),
    subject: String(row.subject),
    syllabusCode: String(row.syllabus_code),
    yearFrom: row.year_from == null ? null : Number(row.year_from),
    yearTo: row.year_to == null ? null : Number(row.year_to),
    isCurrent: Boolean(row.is_current),
    isLatest: Boolean(row.is_latest),
    pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
    pageUrl: row.page_url ? String(row.page_url) : null,
    notes: row.notes ? String(row.notes) : null,
    chapters: Number(row.chapters ?? 0),
    points: Number(row.points ?? 0),
  }));
}

/** The parsed chapter/point tree for one syllabus version, in reading order. */
export async function getSyllabusContent(recordId: string): Promise<SyllabusContentRow[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT code, kind, parent_code, title, academic_level
    FROM syllabus_content
    WHERE record_id = ${recordId}
    ORDER BY seq
  `;

  return rows.map((row) => ({
    code: String(row.code),
    kind: row.kind === "chapter" ? "chapter" : "point",
    parentCode: row.parent_code ? String(row.parent_code) : null,
    title: String(row.title),
    academicLevel: row.academic_level ? String(row.academic_level) : null,
  }));
}
