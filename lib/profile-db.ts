import { getSql, type SqlClient } from "./db";
import { normalisePace, type ReviewPace } from "../app/topics";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  examBoard: string | null;
  qualification: string | null;
  targetYear: number | null;
  weeklyHoursTarget: number;
  timezone: string;
  /** The learner's own gaps between reviews, in days. */
  reviewPace: ReviewPace;
  onboardedAt: string | null;
};

export type OnboardingInput = {
  fullName: string;
  examBoard: string | null;
  qualification: string | null;
  targetYear: number | null;
  weeklyHoursTarget: number;
  timezone: string;
};

/**
 * The pace columns as the app's own table. `normalisePace` fills in anything
 * missing, which is what keeps a profile row read before the pace migration
 * landed — or one column somehow null — scheduling on the defaults rather than
 * on NaN.
 */
function readPace(row: Record<string, unknown>): ReviewPace {
  return normalisePace({
    Learning: row.review_days_learning,
    Practising: row.review_days_practising,
    Covered: row.review_days_covered,
    "Exam Ready": row.review_days_exam_ready,
  });
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    examBoard: row.exam_board ? String(row.exam_board) : null,
    qualification: row.qualification ? String(row.qualification) : null,
    targetYear: row.target_year == null ? null : Number(row.target_year),
    weeklyHoursTarget: Number(row.weekly_hours_target ?? 10),
    timezone: String(row.timezone ?? "Asia/Singapore"),
    reviewPace: readPace(row),
    onboardedAt:
      row.onboarded_at instanceof Date
        ? row.onboarded_at.toISOString()
        : row.onboarded_at
          ? String(row.onboarded_at)
          : null,
  };
}

export async function getProfile(workspaceId: string): Promise<Profile | null> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM profiles WHERE id = ${workspaceId}
  `;
  return rows.length ? mapProfile(rows[0]) : null;
}

/**
 * Creates the profile row if the signup trigger has not landed yet. Signup and
 * the first page load can race on a cold project, and an onboarding screen that
 * 500s on a brand new account is a bad first impression.
 */
export async function ensureProfile(workspaceId: string, email: string | null) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO profiles (id, email)
    VALUES (${workspaceId}, ${email})
    ON CONFLICT (id) DO UPDATE SET email = COALESCE(profiles.email, excluded.email)
    RETURNING *
  `;
  return mapProfile(rows[0]);
}

/**
 * The learner's own gaps, read inside whatever transaction is scheduling.
 *
 * Every scheduler path reads this for itself rather than taking it as an
 * argument, so no caller can forget one and quietly reschedule an account back
 * onto the defaults. An account with no profile row yet gets the defaults.
 */
export async function getReviewPace(workspaceId: string, executor: SqlClient = getSql()): Promise<ReviewPace> {
  const rows = await executor<Record<string, unknown>[]>`
    SELECT review_days_learning, review_days_practising, review_days_covered, review_days_exam_ready
    FROM profiles WHERE id = ${workspaceId}
  `;
  return rows.length ? readPace(rows[0]) : normalisePace(null);
}

/**
 * Writes the four gaps and nothing else. Rescheduling the points that already
 * carry a date is the scheduler's job, so this stays a column write and
 * `setReviewPace` in topics-db drives the two together.
 */
export async function writeReviewPace(workspaceId: string, pace: ReviewPace, executor: SqlClient = getSql()) {
  const rows = await executor<Record<string, unknown>[]>`
    UPDATE profiles SET
      review_days_learning = ${pace.Learning},
      review_days_practising = ${pace.Practising},
      review_days_covered = ${pace.Covered},
      review_days_exam_ready = ${pace["Exam Ready"]},
      updated_at = now()
    WHERE id = ${workspaceId}
    RETURNING review_days_learning, review_days_practising, review_days_covered, review_days_exam_ready
  `;
  if (!rows.length) throw new Error("Profile not found.");
  return readPace(rows[0]);
}

export async function completeOnboarding(workspaceId: string, input: OnboardingInput) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE profiles SET
      full_name = ${input.fullName || null},
      exam_board = ${input.examBoard},
      qualification = ${input.qualification},
      target_year = ${input.targetYear},
      weekly_hours_target = ${input.weeklyHoursTarget},
      timezone = ${input.timezone},
      onboarded_at = COALESCE(onboarded_at, now()),
      updated_at = now()
    WHERE id = ${workspaceId}
    RETURNING *
  `;
  if (!rows.length) throw new Error("Profile not found.");
  return mapProfile(rows[0]);
}
