import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cutRelease, latestRelease, unreleasedBody } from "../scripts/cut-release.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the released version is the one the package claims", async () => {
  // A tag that disagrees with package.json is worse than no tag: an
  // announcement then names a version nothing in the app answers to.
  const [changelog, manifest] = await Promise.all([read("CHANGELOG.md"), read("package.json")]);
  assert.equal(latestRelease(changelog), JSON.parse(manifest).version);
});

test("there is always somewhere to write the next change", async () => {
  const changelog = await read("CHANGELOG.md");
  assert.match(changelog, /^## Unreleased\s*$/m);
  // Cutting a release has to leave the file ready for the one after it.
  assert.match(cutRelease(changelog.replace("*Nothing yet.*", "- A thing"), "9.9.9", "1 January 2027"),
               /^## Unreleased\s*$/m);
});

test("a release is dated and takes the unreleased notes with it", () => {
  const changelog = [
    "## Unreleased", "", "- Chapters on the board fold away", "", "---", "",
    "## 1.0.0 — 28 August 2026", "", "- Momentum ships", "",
  ].join("\n");

  const cut = cutRelease(changelog, "1.1.0", "30 August 2026");

  assert.match(cut, /## 1\.1\.0 — 30 August 2026/);
  assert.ok(cut.indexOf("Chapters on the board fold away") > cut.indexOf("## 1.1.0"),
            "the notes should sit under their new version");
  assert.ok(cut.indexOf("## 1.1.0") < cut.indexOf("## 1.0.0"), "newest release first");
  assert.equal(latestRelease(cut), "1.1.0");
  // A heading butted against its first bullet is what a greedy \s* gives you.
  assert.match(cut, /## 1\.1\.0 — 30 August 2026\n\n- Chapters/);
  assert.equal(unreleasedBody(cut), "*Nothing yet.*");
});

test("a version nobody can describe does not get cut", () => {
  const empty = ["## Unreleased", "", "*Nothing yet.*", "", "---", "", "## 1.0.0 — 28 August 2026", ""].join("\n");
  assert.throws(() => cutRelease(empty, "1.1.0", "30 August 2026"), /nothing to release/);
  assert.throws(() => cutRelease("# No headings here", "1.1.0", "30 August 2026"), /no `## Unreleased`/);
});

test("the unreleased notes stop at the release below them", () => {
  const changelog = [
    "## Unreleased", "", "- Only this", "", "---", "",
    "## 1.0.0 — 28 August 2026", "", "- Not this", "",
  ].join("\n");
  assert.equal(unreleasedBody(changelog), "- Only this");
});

test("the changelog is written for someone announcing it", async () => {
  const changelog = await read("CHANGELOG.md");
  // Each release leads with a sentence that can be lifted into a post.
  const releases = changelog.split(/^## (?=\d)/m).slice(1);
  assert.ok(releases.length >= 2, "expected the shipped releases to be listed");
  for (const release of releases) {
    const [heading] = release.split("\n");
    assert.match(release, /\*\*[^*]+\*\*/, `${heading} should lead with a headline`);
  }
});
