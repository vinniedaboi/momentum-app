import { getSql, nowIso, type SqlClient } from "./db";

export type TopicActivityType = "status" | "review" | "note";

export type TopicActivity = {
  id: number;
  topicId: string;
  eventType: TopicActivityType;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  occurredAt: string;
};

export type ChapterActivity = TopicActivity & {
  topicCode: string;
  topicTitle: string;
  topicKind: "chapter" | "point";
};

function mapActivity(row: Record<string, unknown>): TopicActivity {
  return {
    id: Number(row.id),
    topicId: String(row.topic_id),
    eventType: row.event_type as TopicActivityType,
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: row.to_status ? String(row.to_status) : null,
    note: row.note ? String(row.note) : null,
    occurredAt: String(row.occurred_at),
  };
}

function mapChapterActivity(row: Record<string, unknown>): ChapterActivity {
  return {
    ...mapActivity(row),
    topicCode: String(row.topic_code ?? ""),
    topicTitle: String(row.topic_title ?? ""),
    topicKind: row.topic_kind === "chapter" ? "chapter" : "point",
  };
}

export async function getTopicActivity(workspaceId: string, topicId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM topic_activity
    WHERE workspace_id = ${workspaceId} AND topic_id = ${topicId}
    ORDER BY occurred_at DESC, id DESC
    LIMIT 250
  `;
  return rows.map(mapActivity);
}

/** A chapter's own events plus every event from the points beneath it. */
export async function getChapterActivity(workspaceId: string, chapterId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT activity.*, topics.code AS topic_code, topics.title AS topic_title, topics.kind AS topic_kind
    FROM topic_activity AS activity
    JOIN topics
      ON topics.workspace_id = activity.workspace_id
     AND topics.id = activity.topic_id
    WHERE activity.workspace_id = ${workspaceId}
      AND (activity.topic_id = ${chapterId} OR topics.parent_id = ${chapterId})
    ORDER BY activity.occurred_at DESC, activity.id DESC
    LIMIT 250
  `;
  return rows.map(mapChapterActivity);
}

/**
 * Bulk-appends status and review events. `executor` lets a caller pass its own
 * transaction so the activity trail commits with the status change that caused
 * it, rather than as a separate write that can succeed on its own.
 */
export async function recordTopicActivities(
  workspaceId: string,
  entries: Array<{
    topicId: string;
    eventType: Exclude<TopicActivityType, "note">;
    fromStatus: string;
    toStatus: string;
    occurredAt: string;
  }>,
  executor: SqlClient = getSql(),
) {
  if (!entries.length) return;
  const rows = entries.map((entry) => ({
    workspace_id: workspaceId,
    topic_id: entry.topicId,
    event_type: entry.eventType,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    occurred_at: entry.occurredAt,
  }));
  await executor`
    INSERT INTO topic_activity ${executor(
      rows,
      "workspace_id",
      "topic_id",
      "event_type",
      "from_status",
      "to_status",
      "occurred_at",
    )}
  `;
}

export async function addTopicProgressNote(workspaceId: string, topicId: string, note: string) {
  const sql = getSql();
  const now = nowIso();

  return sql.begin(async (tx) => {
    const topic = await tx<{ id: string }[]>`
      SELECT id FROM topics WHERE workspace_id = ${workspaceId} AND id = ${topicId}
    `;
    if (!topic.length) throw new Error("Topic not found.");

    const inserted = await tx<Record<string, unknown>[]>`
      INSERT INTO topic_activity (workspace_id, topic_id, event_type, from_status, to_status, note, occurred_at)
      VALUES (${workspaceId}, ${topicId}, 'note', NULL, NULL, ${note}, ${now})
      RETURNING *
    `;
    await tx`
      UPDATE topics SET updated_at = ${now}
      WHERE workspace_id = ${workspaceId} AND id = ${topicId}
    `;

    return { activity: mapActivity(inserted[0]), updatedAt: now };
  });
}
