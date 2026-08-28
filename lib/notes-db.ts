import { getSql, nowIso } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Note attachments live in the private `notes` Supabase Storage bucket, with
 * Postgres holding the metadata. Storage is always reached through the caller's
 * own session (never the service role), so the bucket policies in
 * supabase/migrations/0005 are enforced on every read and write.
 */

const BUCKET = "notes";

export type NoteFile = {
  id: number;
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  subjectId: string | null;
  stage: "AS" | "A2" | null;
  chapterId: string | null;
  createdAt: string;
};

function mapNote(row: Record<string, unknown>): NoteFile {
  return {
    id: Number(row.id),
    storageKey: String(row.storage_key),
    originalName: String(row.original_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    subjectId: row.subject_id ? String(row.subject_id) : null,
    stage: row.stage === "AS" || row.stage === "A2" ? row.stage : null,
    chapterId: row.chapter_id ? String(row.chapter_id) : null,
    createdAt: String(row.created_at),
  };
}

export async function getNoteFiles(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM note_files
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map(mapNote);
}

export async function getNoteFile(workspaceId: string, id: number) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM note_files WHERE workspace_id = ${workspaceId} AND id = ${id}
  `;
  return rows.length ? mapNote(rows[0]) : null;
}

export async function saveNoteFile(workspaceId: string, input: {
  file: File;
  subjectId: string | null;
  stage: "AS" | "A2" | null;
  chapterId: string | null;
}) {
  const sql = getSql();
  const supabase = await createSupabaseServerClient();

  // The workspace id leads the path so the storage policies can authorise on
  // the first path segment without consulting Postgres.
  const key = `${workspaceId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const contentType = input.file.type || "application/octet-stream";

  const upload = await supabase.storage.from(BUCKET).upload(key, input.file, {
    contentType,
    upsert: false,
  });
  if (upload.error) throw new Error(`Note upload failed: ${upload.error.message}`);

  try {
    const now = nowIso();
    const rows = await sql<Record<string, unknown>[]>`
      INSERT INTO note_files (
        workspace_id, storage_key, original_name, content_type, size_bytes,
        subject_id, stage, chapter_id, created_at
      ) VALUES (
        ${workspaceId}, ${key}, ${input.file.name.slice(0, 180)}, ${contentType}, ${input.file.size},
        ${input.subjectId}, ${input.stage}, ${input.chapterId}, ${now}
      )
      RETURNING *
    `;
    if (!rows.length) throw new Error("Note metadata was not saved.");
    return mapNote(rows[0]);
  } catch (error) {
    // Never leave an orphaned object behind if the metadata insert fails.
    await supabase.storage.from(BUCKET).remove([key]);
    throw error;
  }
}

export async function isValidNoteChapter(workspaceId: string, chapterId: string, subjectId: string) {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM topics
    WHERE workspace_id = ${workspaceId} AND id = ${chapterId} AND subject_id = ${subjectId} AND kind = 'chapter'
  `;
  return rows.length > 0;
}

/** The stored object, or null when it has gone missing from the bucket. */
export async function downloadNoteFile(note: NoteFile): Promise<Blob | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(note.storageKey);
  if (error || !data) return null;
  return data;
}

export async function deleteNoteFile(workspaceId: string, id: number) {
  const sql = getSql();
  const note = await getNoteFile(workspaceId, id);
  if (!note) return;

  await sql`DELETE FROM note_files WHERE workspace_id = ${workspaceId} AND id = ${id}`;

  const supabase = await createSupabaseServerClient();
  await supabase.storage.from(BUCKET).remove([note.storageKey]);
}
