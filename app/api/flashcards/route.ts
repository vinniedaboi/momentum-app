import {
  createFlashcard,
  createFlashcards,
  createFlashcardDeck,
  deleteFlashcard,
  deleteFlashcardDeck,
  getFlashcardDecks,
  isValidFlashcardChapter,
  resetDeckProgress,
  updateFlashcard,
  updateFlashcardMastery,
} from "../../../lib/flashcards-db";
import { subjectStages } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ decks: await getFlashcardDecks(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your flashcards." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        kind?: "deck" | "card" | "cards" | "reset";
        title?: string;
        subjectId?: string | null;
        stage?: string | null;
        chapterId?: string | null;
        deckId?: number;
        front?: string;
        back?: string;
        cards?: Array<{ front?: string; back?: string }>;
      };
      if (body.kind === "deck") {
        const title = body.title?.trim().slice(0, 100) ?? "";
        const subjectId = body.subjectId?.trim() || null;
        const stages = subjectId ? await subjectStages(workspaceId, subjectId) : null;
        const stage = body.stage && stages?.includes(body.stage) ? body.stage : null;
        const chapterId = subjectId && stage ? body.chapterId?.trim() || null : null;
        if (!title) return Response.json({ error: "Name your flashcard deck." }, { status: 400 });
        if (subjectId && !stages) return Response.json({ error: "Choose a valid subject." }, { status: 400 });
        if (subjectId && !stage) return Response.json({ error: `Choose the ${stages?.join(" or ") || "subject's"} syllabus.` }, { status: 400 });
        if (chapterId && !(await isValidFlashcardChapter(workspaceId, chapterId, subjectId!))) {
          return Response.json({ error: "Choose a valid chapter for this syllabus." }, { status: 400 });
        }
        const id = await createFlashcardDeck(workspaceId, { title, subjectId, stage, chapterId });
        return Response.json({ id, decks: await getFlashcardDecks(workspaceId) }, { status: 201 });
      }
      if (body.kind === "card") {
        const deckId = Number(body.deckId);
        const front = body.front?.trim().slice(0, 1000) ?? "";
        const back = body.back?.trim().slice(0, 2000) ?? "";
        if (!Number.isInteger(deckId) || deckId < 1 || !front || !back) {
          return Response.json({ error: "Add both sides of the flashcard." }, { status: 400 });
        }
        const id = await createFlashcard(workspaceId, { deckId, front, back });
        return Response.json({ id, decks: await getFlashcardDecks(workspaceId) }, { status: 201 });
      }
      if (body.kind === "cards") {
        const deckId = Number(body.deckId);
        if (!Number.isInteger(deckId) || deckId < 1 || !Array.isArray(body.cards) || !body.cards.length || body.cards.length > 500) {
          return Response.json({ error: "Choose a valid deck and up to 500 flashcards." }, { status: 400 });
        }
        const cards = body.cards.map((card) => ({
          front: typeof card.front === "string" ? card.front.trim().slice(0, 1000) : "",
          back: typeof card.back === "string" ? card.back.trim().slice(0, 2000) : "",
        })).filter((card) => card.front && card.back);
        if (!cards.length) return Response.json({ error: "No usable flashcards were found." }, { status: 400 });
        const result = await createFlashcards(workspaceId, { deckId, cards });
        return Response.json({ ...result, decks: await getFlashcardDecks(workspaceId) }, { status: 201 });
      }
      if (body.kind === "reset") {
        const deckId = Number(body.deckId);
        if (!Number.isInteger(deckId) || deckId < 1) {
          return Response.json({ error: "Choose a valid deck." }, { status: 400 });
        }
        await resetDeckProgress(workspaceId, deckId);
        return Response.json({ decks: await getFlashcardDecks(workspaceId) });
      }
      return Response.json({ error: "Choose a flashcard action." }, { status: 400 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your flashcard could not be saved." }, { status: 500 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { id?: number; mastery?: number; front?: string; back?: string };
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Choose a valid flashcard." }, { status: 400 });
      if (body.front !== undefined || body.back !== undefined) {
        const front = body.front?.trim().slice(0, 1000) ?? "";
        const back = body.back?.trim().slice(0, 2000) ?? "";
        if (!front || !back) return Response.json({ error: "Add both sides of the flashcard." }, { status: 400 });
        await updateFlashcard(workspaceId, id, { front, back });
        return Response.json({ decks: await getFlashcardDecks(workspaceId) });
      }
      const mastery = Number(body.mastery);
      if (!Number.isInteger(mastery) || mastery < 0 || mastery > 5) {
        return Response.json({ error: "Choose a valid flashcard rating." }, { status: 400 });
      }
      await updateFlashcardMastery(workspaceId, id, mastery);
      return Response.json({ decks: await getFlashcardDecks(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your flashcard rating could not be saved." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const url = new URL(request.url);
      const kind = url.searchParams.get("kind");
      const id = Number(url.searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1 || (kind !== "deck" && kind !== "card")) {
        return Response.json({ error: "Choose a valid flashcard." }, { status: 400 });
      }
      if (kind === "deck") await deleteFlashcardDeck(workspaceId, id); else await deleteFlashcard(workspaceId, id);
      return Response.json({ decks: await getFlashcardDecks(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That flashcard could not be removed." }, { status: 500 });
    }
  });
}
