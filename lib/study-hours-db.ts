import { getSql, nowIso, type SqlClient } from "./db";
import { reviewStudyTopics } from "./topics-db";

export type StudySession = {
  id: number;
  studyDate: string;
  minutes: number;
  subjectId: string | null;
  note: string | null;
  topics: StudySessionTopic[];
  createdAt: string;
  updatedAt: string;
};

export type StudySessionTopic = {
  id: string;
  code: string;
  title: string;
  kind: "chapter" | "point";
  parentId: string | null;
};

function mapSession(row: Record<string, unknown>, topics: StudySessionTopic[] = []): StudySession {
  return {
    id: Number(row.id),
    studyDate: String(row.study_date),
    minutes: Number(row.minutes),
    subjectId: row.subject_id ? String(row.subject_id) : null,
    note: row.note ? String(row.note) : null,
    topics,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getSessionTopics(executor: SqlClient, workspaceId: string, sessionIds: number[]) {
  const bySession = new Map<number, StudySessionTopic[]>();
  if (!sessionIds.length) return bySession;

  const rows = await executor<Record<string, unknown>[]>`
    SELECT st.session_id, t.id, t.code, t.title, t.kind, t.parent_id
    FROM study_session_topics st
    INNER JOIN topics t
      ON t.workspace_id = st.workspace_id
     AND t.id = st.topic_id
    WHERE st.workspace_id = ${workspaceId}
      AND st.session_id = ANY(${sessionIds}::int[])
    ORDER BY st.session_id DESC, t.source_row
  `;

  for (const row of rows) {
    const sessionId = Number(row.session_id);
    const current = bySession.get(sessionId) ?? [];
    current.push({
      id: String(row.id),
      code: String(row.code),
      title: String(row.title),
      kind: row.kind as "chapter" | "point",
      parentId: row.parent_id ? String(row.parent_id) : null,
    });
    bySession.set(sessionId, current);
  }
  return bySession;
}

export async function getStudySessions(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM study_sessions
    WHERE workspace_id = ${workspaceId}
    ORDER BY study_date DESC, id DESC
  `;
  const topicMap = await getSessionTopics(sql, workspaceId, rows.map((row) => Number(row.id)));
  return rows.map((row) => mapSession(row, topicMap.get(Number(row.id)) ?? []));
}

/**
 * Logging hours against syllabus topics also counts as reviewing them, which is
 * why the session insert and the review update share one transaction: a session
 * that recorded time but silently failed to move the review schedule would be
 * worse than no session at all.
 */
export async function addStudySession(workspaceId: string, input: {
  studyDate: string;
  minutes: number;
  subjectId: string | null;
  note: string | null;
  topicIds: string[];
}) {
  const sql = getSql();
  const topicIds = [...new Set(input.topicIds)].slice(0, 200);
  if (topicIds.length && !input.subjectId) {
    throw new Error("A subject is required when selecting syllabus topics.");
  }
  const now = nowIso();

  return sql.begin(async (tx) => {
    if (topicIds.length) {
      const matches = await tx<{ id: string }[]>`
        SELECT id FROM topics
        WHERE workspace_id = ${workspaceId}
          AND subject_id = ${input.subjectId}
          AND id = ANY(${topicIds}::text[])
      `;
      if (matches.length !== topicIds.length) throw new Error("A selected syllabus topic is invalid.");
    }

    const inserted = await tx<Record<string, unknown>[]>`
      INSERT INTO study_sessions (workspace_id, study_date, minutes, subject_id, note, created_at, updated_at)
      VALUES (${workspaceId}, ${input.studyDate}, ${input.minutes}, ${input.subjectId}, ${input.note}, ${now}, ${now})
      RETURNING *
    `;
    const session = inserted[0];
    const id = Number(session.id);

    if (topicIds.length) {
      await tx`
        INSERT INTO study_session_topics ${tx(
          topicIds.map((topicId) => ({ workspace_id: workspaceId, session_id: id, topic_id: topicId })),
          "workspace_id",
          "session_id",
          "topic_id",
        )}
      `;
    }

    const topicMap = await getSessionTopics(tx, workspaceId, [id]);
    const reviewedTopics = topicIds.length && input.subjectId
      ? await reviewStudyTopics(
          workspaceId,
          { ids: topicIds, subjectId: input.subjectId, reviewedOn: input.studyDate },
          tx,
        )
      : [];

    return { session: mapSession(session, topicMap.get(id) ?? []), reviewedTopics };
  });
}

export async function deleteStudySession(workspaceId: string, id: number) {
  const sql = getSql();
  // study_session_topics cascades from the session's foreign key.
  await sql`DELETE FROM study_sessions WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
