import { getSql, nowIso, series } from "./db";
import type { SyllabusStage } from "../app/syllabus-stage";

export type Flashcard = {
  id: number;
  deckId: number;
  front: string;
  back: string;
  mastery: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FlashcardDeck = {
  id: number;
  title: string;
  subjectId: string | null;
  stage: SyllabusStage | null;
  chapterId: string | null;
  createdAt: string;
  updatedAt: string;
  cards: Flashcard[];
};

function mapCard(row: Record<string, unknown>): Flashcard {
  return {
    id: Number(row.id),
    deckId: Number(row.deck_id),
    front: String(row.front),
    back: String(row.back),
    mastery: Number(row.mastery),
    lastReviewedAt: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getFlashcardDecks(workspaceId: string) {
  const sql = getSql();
  const [deckRows, cardRows] = await series([
    () => sql<Record<string, unknown>[]>`
      SELECT * FROM flashcard_decks
      WHERE workspace_id = ${workspaceId}
      ORDER BY updated_at DESC, id DESC
    `,
    () => sql<Record<string, unknown>[]>`
      SELECT * FROM flashcards
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at, id
    `,
  ]);

  const cardsByDeck = new Map<number, Flashcard[]>();
  for (const row of cardRows) {
    const card = mapCard(row);
    const bucket = cardsByDeck.get(card.deckId) ?? [];
    bucket.push(card);
    cardsByDeck.set(card.deckId, bucket);
  }

  return deckRows.map((row): FlashcardDeck => ({
    id: Number(row.id),
    title: String(row.title),
    subjectId: row.subject_id ? String(row.subject_id) : null,
    stage: row.stage ? String(row.stage) : null,
    chapterId: row.chapter_id ? String(row.chapter_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    cards: cardsByDeck.get(Number(row.id)) ?? [],
  }));
}

export async function createFlashcardDeck(workspaceId: string, input: {
  title: string;
  subjectId: string | null;
  stage: SyllabusStage | null;
  chapterId: string | null;
}) {
  const sql = getSql();
  const now = nowIso();
  const rows = await sql<{ id: number }[]>`
    INSERT INTO flashcard_decks (workspace_id, title, subject_id, stage, chapter_id, created_at, updated_at)
    VALUES (${workspaceId}, ${input.title}, ${input.subjectId}, ${input.stage}, ${input.chapterId}, ${now}, ${now})
    RETURNING id
  `;
  return Number(rows[0].id);
}

/** Decks can be pinned to a whole chapter, hence the `major:` prefix support. */
export async function isValidFlashcardChapter(workspaceId: string, chapterId: string, subjectId: string) {
  const sql = getSql();
  const topicId = chapterId.startsWith("major:") ? chapterId.slice("major:".length) : chapterId;
  if (!topicId) return false;
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM topics
    WHERE workspace_id = ${workspaceId} AND id = ${topicId} AND subject_id = ${subjectId} AND kind = 'chapter'
  `;
  return rows.length > 0;
}

export async function createFlashcard(workspaceId: string, input: { deckId: number; front: string; back: string }) {
  const sql = getSql();
  const now = nowIso();

  return sql.begin(async (tx) => {
    const deck = await tx<{ id: number }[]>`
      SELECT id FROM flashcard_decks WHERE workspace_id = ${workspaceId} AND id = ${input.deckId}
    `;
    if (!deck.length) throw new Error("Deck not found.");

    const rows = await tx<{ id: number }[]>`
      INSERT INTO flashcards (workspace_id, deck_id, front, back, mastery, created_at, updated_at)
      VALUES (${workspaceId}, ${input.deckId}, ${input.front}, ${input.back}, 0, ${now}, ${now})
      RETURNING id
    `;
    await tx`
      UPDATE flashcard_decks SET updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND id = ${input.deckId}
    `;
    return Number(rows[0].id);
  });
}

/** Bulk import (CSV / Anki paste). Cards already in the deck are skipped. */
export async function createFlashcards(workspaceId: string, input: {
  deckId: number;
  cards: Array<{ front: string; back: string }>;
}) {
  const sql = getSql();
  const now = nowIso();

  return sql.begin(async (tx) => {
    const deck = await tx<{ id: number }[]>`
      SELECT id FROM flashcard_decks WHERE workspace_id = ${workspaceId} AND id = ${input.deckId}
    `;
    if (!deck.length) throw new Error("Deck not found.");

    const existing = await tx<{ front: string; back: string }[]>`
      SELECT front, back FROM flashcards
      WHERE workspace_id = ${workspaceId} AND deck_id = ${input.deckId}
    `;
    const seen = new Set(existing.map((card) => `${card.front.trim().toLowerCase()}\u0000${card.back.trim().toLowerCase()}`));

    const cards = input.cards.filter((card) => {
      const key = `${card.front.trim().toLowerCase()}\u0000${card.back.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (let offset = 0; offset < cards.length; offset += 500) {
      const chunk = cards.slice(offset, offset + 500);
      if (!chunk.length) continue;
      await tx`
        INSERT INTO flashcards ${tx(
          chunk.map((card) => ({
            workspace_id: workspaceId,
            deck_id: input.deckId,
            front: card.front,
            back: card.back,
            mastery: 0,
            created_at: now,
            updated_at: now,
          })),
          "workspace_id",
          "deck_id",
          "front",
          "back",
          "mastery",
          "created_at",
          "updated_at",
        )}
      `;
    }

    if (cards.length) {
      await tx`
        UPDATE flashcard_decks SET updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${input.deckId}
      `;
    }

    return { imported: cards.length, skipped: input.cards.length - cards.length };
  });
}

export async function updateFlashcard(workspaceId: string, id: number, input: { front: string; back: string }) {
  const sql = getSql();
  const now = nowIso();

  await sql.begin(async (tx) => {
    const card = await tx<{ deck_id: number }[]>`
      SELECT deck_id FROM flashcards WHERE workspace_id = ${workspaceId} AND id = ${id}
    `;
    if (!card.length) throw new Error("Flashcard not found.");

    await tx`
      UPDATE flashcards SET front = ${input.front}, back = ${input.back}, updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND id = ${id}
    `;
    await tx`
      UPDATE flashcard_decks SET updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND id = ${card[0].deck_id}
    `;
  });
}

export async function updateFlashcardMastery(workspaceId: string, id: number, mastery: number) {
  const sql = getSql();
  const now = nowIso();
  await sql`
    UPDATE flashcards SET mastery = ${mastery}, last_reviewed_at = ${now}, updated_at = ${now}
    WHERE workspace_id = ${workspaceId} AND id = ${id}
  `;
}

export async function resetDeckProgress(workspaceId: string, deckId: number) {
  const sql = getSql();
  const now = nowIso();

  await sql.begin(async (tx) => {
    const deck = await tx<{ id: number }[]>`
      SELECT id FROM flashcard_decks WHERE workspace_id = ${workspaceId} AND id = ${deckId}
    `;
    if (!deck.length) throw new Error("Deck not found.");

    await tx`
      UPDATE flashcards SET mastery = 0, last_reviewed_at = NULL, updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND deck_id = ${deckId}
    `;
    await tx`
      UPDATE flashcard_decks SET updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND id = ${deckId}
    `;
  });
}

export async function deleteFlashcard(workspaceId: string, id: number) {
  const sql = getSql();
  await sql`DELETE FROM flashcards WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}

export async function deleteFlashcardDeck(workspaceId: string, id: number) {
  const sql = getSql();
  // flashcards cascade from the deck's foreign key.
  await sql`DELETE FROM flashcard_decks WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
