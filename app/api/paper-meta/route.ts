import { getPaperMeta, savePaperMeta, PAPER_DIFFICULTIES, type PaperDifficulty } from "../../../lib/past-papers-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const DIFFICULTIES = new Set<string>(PAPER_DIFFICULTIES);

function cleanUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ meta: await getPaperMeta(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your paper details." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { paperId?: string; difficulty?: string | null; resourceUrl?: string | null };
      const paperId = body.paperId?.trim().slice(0, 60) ?? "";
      if (!paperId) return Response.json({ error: "Choose a paper." }, { status: 400 });
      if (body.difficulty != null && !DIFFICULTIES.has(body.difficulty)) {
        return Response.json({ error: "Choose Easy, Medium or Hard." }, { status: 400 });
      }
      if (typeof body.resourceUrl === "string" && body.resourceUrl.trim() && !cleanUrl(body.resourceUrl)) {
        return Response.json({ error: "Enter a valid http or https link." }, { status: 400 });
      }
      const meta = await savePaperMeta(workspaceId, {
        paperId,
        difficulty: (body.difficulty as PaperDifficulty | null) ?? null,
        resourceUrl: cleanUrl(body.resourceUrl),
      });
      return Response.json({ meta });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Those paper details could not be saved." }, { status: 500 });
    }
  });
}
