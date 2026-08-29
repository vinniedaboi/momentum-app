import { deleteNoteFile, downloadNoteFile, getNoteFile, getNoteFiles, isValidNoteChapter, saveNoteFile } from "../../../lib/notes-db";
import { subjectStages } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function GET(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (Number.isInteger(id) && id > 0) {
        const note = await getNoteFile(workspaceId, id);
        if (!note) return Response.json({ error: "Note not found." }, { status: 404 });
        const file = await downloadNoteFile(note);
        if (!file) return Response.json({ error: "The uploaded file is unavailable." }, { status: 404 });
        return new Response(file, {
          headers: new Headers({
            "content-type": note.contentType,
            "content-length": String(note.sizeBytes),
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(note.originalName)}`,
          }),
        });
      }
      return Response.json({ notes: await getNoteFiles(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your notes." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const form = await request.formData();
      const file = form.get("file");
      const subjectValue = String(form.get("subjectId") ?? "").trim();
      const stageValue = String(form.get("stage") ?? "").trim();
      const chapterValue = String(form.get("chapterId") ?? "").trim();
      const subjectId = subjectValue || null;
      const stages = subjectId ? await subjectStages(workspaceId, subjectId) : null;
      const stage = stageValue && stages?.includes(stageValue) ? stageValue : null;
      const chapterId = subjectId && stage && chapterValue ? chapterValue : null;
      if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
        return Response.json({ error: "Choose a file up to 20 MB." }, { status: 400 });
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return Response.json({ error: "Upload a PDF, Word, PowerPoint, text, or image file." }, { status: 400 });
      }
      if (subjectId && !stages) {
        return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      }
      if (subjectId && !stage) {
        return Response.json({ error: `Choose the ${stages?.join(" or ") || "subject's"} syllabus.` }, { status: 400 });
      }
      if (chapterId && !(await isValidNoteChapter(workspaceId, chapterId, subjectId!))) {
        return Response.json({ error: "Choose a valid chapter for this syllabus." }, { status: 400 });
      }
      const note = await saveNoteFile(workspaceId, { file, subjectId, stage, chapterId });
      return Response.json({ note }, { status: 201 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your notes could not be uploaded." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Choose a valid note." }, { status: 400 });
      await deleteNoteFile(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That note could not be removed." }, { status: 500 });
    }
  });
}
