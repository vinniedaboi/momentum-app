import type { Reminder } from "./reminders-db";
import { unsubscribeToken } from "./email";

/**
 * What a reminder actually says.
 *
 * Two rules shape all of it. The subject line carries the news, because a
 * subject that says "Momentum" only tells someone which app is asking for
 * attention, and one that says "9 topics are due today" tells them whether to
 * care. And every link lands on the thing it names, carrying `src=` so the
 * activity that follows can be traced back to the mail that caused it —
 * otherwise there is no way to learn whether any of this works.
 *
 * The HTML is deliberately plain: a table-free, single-column layout with inline
 * styles, which is the subset every mail client renders the same way. It is not
 * the app's stylesheet and should not grow into it.
 */

const BRAND = "#2f7d6c";
const INK = "#263b35";
const MUTED = "#687487";
const LINE = "#dbe5dd";

/**
 * Where the links in a reminder point.
 *
 * `REMINDER_SITE_URL` first, and its own variable rather than only
 * `NEXT_PUBLIC_SITE_URL`, because that one also fixes the origin Supabase puts
 * in a confirmation email — and an origin missing from Supabase's redirect
 * allowlist silently breaks every sign-up. Turning reminders on must not be
 * able to do that. `NEXT_PUBLIC_SITE_URL` is still read where it is already
 * set, so a deployment that has one correct answer only has to give it once.
 */
function origin() {
  const configured = (process.env.REMINDER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "")
    .trim().replace(/\/$/, "");
  return configured || "https://www.momentumstudies.com";
}

function link(path: string, source: string) {
  const url = new URL(path, `${origin()}/`);
  url.searchParams.set("src", source);
  return url.toString();
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string
  ));
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function subjectLine(reminder: Reminder) {
  if (reminder.kind === "activation") {
    const first = reminder.subjects[0];
    return first
      ? `Your ${first.subject} syllabus is waiting — start with one point`
      : "Start your first topic on Momentum";
  }
  // Whatever is most urgent leads. An exam this close outranks the queue.
  const soonest = reminder.exams[0];
  if (soonest && soonest.days <= 7) {
    return `${soonest.subject} ${soonest.title} in ${plural(soonest.days, "day")}`;
  }
  if (reminder.reviewsTotal) {
    return `${plural(reminder.reviewsTotal, "topic")} due for review today`;
  }
  if (reminder.tasks.length) {
    const overdue = reminder.tasks.filter((task) => task.overdue).length;
    return overdue ? `${plural(overdue, "task")} overdue` : `${plural(reminder.tasks.length, "task")} due today`;
  }
  return "Today on Momentum";
}

/** The body, as the lines it is made of — rendered to both HTML and plain text. */
type Block =
  | { type: "text"; body: string }
  | { type: "list"; heading: string; items: string[]; more: number; href: string; hrefLabel: string };

/** A spec point can run to a paragraph. A list of them has to stay scannable. */
const TITLE_MAX = 84;
/** More rows than this and the mail is a wall rather than a prompt. */
const LIST_MAX = 8;

function shorten(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
}

function blocks(reminder: Reminder): Block[] {
  const out: Block[] = [];

  if (reminder.kind === "activation") {
    const first = reminder.subjects[0];
    const total = reminder.subjects.reduce((sum, item) => sum + item.points, 0);
    out.push({
      type: "text",
      body: `You imported ${plural(reminder.subjects.length, "syllabus", "syllabuses")} into Momentum — `
        + `${total.toLocaleString("en-SG")} points in all — and none of them are marked yet. `
        + `Momentum only starts scheduling reviews once it knows where you are.`,
    });
    if (first?.firstCode) {
      out.push({
        type: "list",
        heading: `Start with ${first.subject}`,
        items: [shorten(`${first.firstCode} · ${first.firstTitle ?? ""}`)],
        more: 0,
        href: link("/", "activation"),
        hrefLabel: "Mark your first topic",
      });
    }
    out.push({
      type: "text",
      body: "It takes one tap. From then on Momentum works out what to bring back and when.",
    });
    return out;
  }

  if (reminder.exams.length) {
    out.push({
      type: "list",
      heading: "Coming up",
      items: reminder.exams.map((exam) => {
        const when = exam.days === 0 ? "today" : `in ${plural(exam.days, "day")}`;
        const gap = exam.uncovered ? ` · ${plural(exam.uncovered, "topic")} not started` : "";
        return `${exam.subject} ${exam.title} — ${when}${gap}`;
      }),
      more: 0,
      href: link("/", "exam"),
      hrefLabel: "Open the exam plan",
    });
  }

  if (reminder.reviews.length) {
    const shown = reminder.reviews.slice(0, LIST_MAX);
    out.push({
      type: "list",
      heading: "Due for review",
      items: shown.map((topic) => shorten(`${topic.subject} ${topic.code} · ${topic.title}`)),
      more: Math.max(0, reminder.reviewsTotal - shown.length),
      href: link("/", "review"),
      hrefLabel: "Open your review queue",
    });
  }

  if (reminder.tasks.length) {
    out.push({
      type: "list",
      heading: "Tasks",
      items: reminder.tasks.map((task) => (
        shorten(`${task.subject} · ${task.title}`) + (task.overdue ? " (overdue)" : "")
      )),
      more: 0,
      href: link("/", "task"),
      hrefLabel: "Open your tasks",
    });
  }

  return out;
}

export function renderText(reminder: Reminder) {
  const lines = [`Hi ${reminder.name},`, ""];
  for (const block of blocks(reminder)) {
    if (block.type === "text") {
      lines.push(block.body, "");
      continue;
    }
    lines.push(`${block.heading}:`);
    for (const item of block.items) lines.push(`  - ${item}`);
    if (block.more) lines.push(`  ...and ${block.more} more`);
    lines.push("", `${block.hrefLabel}: ${block.href}`, "");
  }
  lines.push(
    "---",
    `Stop these reminders: ${origin()}/api/reminders/stop?t=${unsubscribeToken(reminder.workspaceId)}`,
  );
  return lines.join("\n");
}

export function renderHtml(reminder: Reminder) {
  const parts: string[] = [];
  for (const block of blocks(reminder)) {
    if (block.type === "text") {
      parts.push(`<p style="margin:0 0 16px;color:${INK};font-size:15px;line-height:1.6">${escapeHtml(block.body)}</p>`);
      continue;
    }
    const items = block.items
      .map((item) => `<li style="margin:0 0 6px;color:${INK};font-size:14px;line-height:1.5">${escapeHtml(item)}</li>`)
      .join("")
      + (block.more
        ? `<li style="margin:0 0 6px;color:${MUTED};font-size:14px">and ${block.more} more</li>`
        : "");
    parts.push(
      `<p style="margin:24px 0 8px;color:${MUTED};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">`
      + `${escapeHtml(block.heading)}</p>`
      + `<ul style="margin:0 0 16px;padding-left:20px">${items}</ul>`
      + `<p style="margin:0 0 8px"><a href="${block.href}" style="display:inline-block;background:${BRAND};color:#ffffff;`
      + `text-decoration:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:700">`
      + `${escapeHtml(block.hrefLabel)}</a></p>`,
    );
  }

  const stop = `${origin()}/api/reminders/stop?t=${unsubscribeToken(reminder.workspaceId)}`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f1">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Segoe UI,sans-serif">
<p style="margin:0 0 24px;color:${BRAND};font-size:18px;font-weight:800">Momentum</p>
<p style="margin:0 0 16px;color:${INK};font-size:15px">Hi ${escapeHtml(reminder.name)},</p>
${parts.join("\n")}
<hr style="border:0;border-top:1px solid ${LINE};margin:32px 0 16px">
<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5">
You are getting this because reminders are on for your Momentum account.
<a href="${stop}" style="color:${MUTED}">Stop these reminders</a>.
</p>
</div></body></html>`;
}
