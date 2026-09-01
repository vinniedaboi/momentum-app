// Sends today's reminder for one account to one address, and logs nothing.
//
//   node --import ./scripts/ts-resolve.mjs --env-file=.env.local \
//     scripts/send-test-reminder.mjs --to you@example.com
//   ... --to you@example.com --as someone@else.com   # build theirs, send to you
//   ... --to you@example.com --print                 # render it, send nothing
//
// The daily run refuses to write twice to the same learner on the same day, and
// that refusal is a row in notification_log. This deliberately skips writing
// one, so a test send never uses up the real send that is due later — and never
// leaves a row claiming a learner was written to when they were not.
//
// Use it before any change to the copy. The dry run in the route says what would
// be sent; only a real inbox says how it looks in one.

import { remindersFor } from "../lib/reminders-db.ts";
import { renderHtml, renderText, subjectLine } from "../lib/reminder-mail.ts";
import { sendMail } from "../lib/email.ts";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const to = arg("to");
const as = arg("as");
const printOnly = process.argv.includes("--print");

if (!to) {
  console.error("Pass --to <address>. Nothing is sent without one.");
  process.exit(1);
}

const timezone = process.env.REMINDER_TIMEZONE || "Asia/Singapore";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

const reminders = await remindersFor(today);
if (!reminders.length) {
  console.log(`Nothing due on ${today}. Every account is either up to date or suppressed.`);
  process.exit(0);
}

// Whose mail to build. Default to the address being sent to, so the usual case
// is "show me my own"; --as builds someone else's to check how theirs reads.
const wanted = (as || to).toLowerCase();
const reminder = reminders.find((item) => item.email.toLowerCase() === wanted) ?? reminders[0];
if (reminder.email.toLowerCase() !== wanted) {
  console.log(`No reminder is due for ${wanted} today — showing ${reminder.kind} instead.\n`);
}

console.log(`subject: ${subjectLine(reminder)}`);
console.log(`kind:    ${reminder.kind}   items: ${reminder.items}`);
console.log("-".repeat(72));
console.log(renderText(reminder));
console.log("-".repeat(72));

if (printOnly) {
  console.log("--print: nothing sent.");
  process.exit(0);
}

const messageId = await sendMail({
  to,
  toName: reminder.name,
  subject: subjectLine(reminder),
  html: renderHtml(reminder),
  text: renderText(reminder),
  tag: `test-${reminder.kind}`,
});

console.log(`Sent to ${to}. Brevo message id: ${messageId ?? "(none returned)"}`);
console.log("Nothing was written to notification_log, so today's real run is unaffected.");
process.exit(0);
