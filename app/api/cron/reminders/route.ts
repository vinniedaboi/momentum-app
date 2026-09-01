import { timingSafeEqual } from "node:crypto";
import { sendMail } from "../../../../lib/email";
import { renderHtml, renderText, subjectLine } from "../../../../lib/reminder-mail";
import { recordSend, remindersFor } from "../../../../lib/reminders-db";

export const runtime = "nodejs";
// Sending is one HTTP call per learner, done in series to stay inside Brevo's
// rate limit. Sixty seconds is ample at this size and is the ceiling anyway.
export const maxDuration = 60;

/**
 * The daily reminder run.
 *
 * Scheduled by vercel.json, which calls this once a day. It is a GET because
 * that is what Vercel Cron issues, and it is authorised by a shared secret
 * rather than a session: there is no user behind it, and the route reads every
 * workspace, so it must not be reachable by anyone who merely knows the URL.
 *
 * The date is computed here, not per learner. Every account is Asia/Singapore
 * today, so one run at 00:00 UTC lands at 08:00 for all of them. When that
 * stops being true the schedule becomes hourly and this reads
 * `profiles.timezone` — which is why that column is already there.
 */
const TIMEZONE = process.env.REMINDER_TIMEZONE || "Asia/Singapore";

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const offered = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Today where the learners are, as YYYY-MM-DD. */
function todayIn(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const today = todayIn(TIMEZONE);
  // A dry run builds every mail and sends none, which is how to look at what
  // today would say before letting it out.
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  let sent = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  try {
    const reminders = await remindersFor(today);

    for (const reminder of reminders) {
      // Claim the send before making it. Losing the race here means another run
      // already has this one, and the mail must not go out twice.
      if (!dryRun) {
        const claimed = await recordSend({
          workspaceId: reminder.workspaceId,
          kind: reminder.kind,
          sentOn: today,
          items: reminder.items,
          messageId: null,
        });
        if (!claimed) {
          skipped.push(reminder.workspaceId);
          continue;
        }
      }

      try {
        if (!dryRun) {
          await sendMail({
            to: reminder.email,
            toName: reminder.name,
            subject: subjectLine(reminder),
            html: renderHtml(reminder),
            text: renderText(reminder),
            tag: reminder.kind,
          });
        }
        sent += 1;
      } catch (error) {
        // The log row stays. A learner who missed one day's mail because the
        // provider was down is better served by tomorrow's than by a retry
        // loop that might send four.
        console.error("reminder send failed", reminder.workspaceId, error);
        failed.push(reminder.workspaceId);
      }
    }

    return Response.json({
      today,
      dryRun,
      candidates: reminders.length,
      sent,
      skipped: skipped.length,
      failed: failed.length,
      ...(dryRun ? { preview: reminders.map((item) => ({
        kind: item.kind, items: item.items, subject: subjectLine(item),
      })) } : {}),
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The reminder run failed." }, { status: 500 });
  }
}
