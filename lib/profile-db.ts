import { getSql } from "./db";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  examBoard: string | null;
  qualification: string | null;
  targetYear: number | null;
  weeklyHoursTarget: number;
  timezone: string;
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
