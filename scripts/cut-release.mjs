/**
 * Turns the CHANGELOG's `Unreleased` section into a dated release.
 *
 * This is the `version` lifecycle script, so it runs from `npm version minor`
 * in the moment between npm writing the new number to package.json and npm
 * making the commit — which is why it can edit the changelog and have the edit
 * land in that same commit and tag.
 *
 *   npm version minor          1.1.0 -> 1.2.0, commits, tags v1.2.0
 *   node scripts/cut-release.mjs --check    reports without writing
 *
 * It refuses to cut a release with nothing under Unreleased. A tagged version
 * that says nothing shipped is worse than no tag at all.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHANGELOG = fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../package.json", import.meta.url));

// Horizontal space only: `\s*$` would run past the blank line under the heading
// and leave a new release butted against its first bullet.
const UNRELEASED = /^## Unreleased[^\S\r\n]*$/m;
/** `## 1.1.0 — 30 August 2026`, capturing the number. */
const RELEASED = /^## (\d+\.\d+\.\d+)[^\S\r\n]+—/m;
const PLACEHOLDER = "*Nothing yet.*";

/** 30 August 2026 — the form the headings already use. */
function releaseDate(now) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(now);
}

/** Everything between the Unreleased heading and the next release. */
export function unreleasedBody(changelog) {
  const start = changelog.match(UNRELEASED);
  if (!start) throw new Error("CHANGELOG.md has no `## Unreleased` heading.");
  const after = changelog.slice(start.index + start[0].length);
  const next = after.match(RELEASED);
  const body = next ? after.slice(0, next.index) : after;
  return body.replace(/^\s*---\s*$/gm, "").trim();
}

/** Throws unless someone has written what this release gives a user. */
export function requireNotes(changelog) {
  const body = unreleasedBody(changelog);
  if (!body || body === PLACEHOLDER) {
    throw new Error(
      "Nothing under `## Unreleased` in CHANGELOG.md, so there is nothing to release.\n"
      + "Write what changed for a user first, then run npm version again.",
    );
  }
  return body;
}

export function cutRelease(changelog, version, date) {
  requireNotes(changelog);
  return changelog.replace(
    UNRELEASED,
    `## Unreleased\n\n${PLACEHOLDER}\n\n---\n\n## ${version} — ${date}`,
  );
}

/** The newest released version the file names, which the tests hold to package.json. */
export function latestRelease(changelog) {
  return changelog.match(RELEASED)?.[1] ?? null;
}

// Run directly, rather than imported by the tests that cover the functions above.
if (process.argv[1]?.endsWith("cut-release.mjs")) {
  const changelog = readFileSync(CHANGELOG, "utf8");
  const { version } = JSON.parse(readFileSync(PACKAGE, "utf8"));

  if (process.argv.includes("--check")) {
    const body = unreleasedBody(changelog);
    const pending = !body || body === PLACEHOLDER ? "nothing" : `${body.split("\n").length} lines`;
    console.log(`package.json ${version} · newest release ${latestRelease(changelog)} · unreleased: ${pending}`);
  } else if (process.argv.includes("--verify")) {
    // Runs as `preversion`, before npm writes the new number anywhere. Failing
    // in the `version` hook instead leaves package.json bumped, uncommitted and
    // untagged, which is a worse place to be than simply refusing.
    requireNotes(changelog);
    console.log(`Ready to release from ${version}.`);
  } else {
    writeFileSync(CHANGELOG, cutRelease(changelog, version, releaseDate(new Date())), "utf8");
    console.log(`CHANGELOG.md: Unreleased is now ${version}`);
  }
}
