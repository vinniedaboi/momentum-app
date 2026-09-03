import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adminEmails, isAdminEmail } from "../lib/admin-emails.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** Runs a case with ADMIN_EMAILS set to `value`, then puts the environment back. */
function withEnv(value, body) {
  const before = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
  try {
    body();
  } finally {
    if (before === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = before;
  }
}

test("an unset allowlist admits nobody, not everybody", () => {
  // The failure that matters: a new environment where the variable was never
  // set must not hand the console to the first person who signs in.
  withEnv(undefined, () => {
    assert.deepEqual(adminEmails(), []);
    assert.equal(isAdminEmail("anyone@example.com"), false);
  });
  withEnv("", () => assert.equal(isAdminEmail("anyone@example.com"), false));
  // A list of nothing but separators is still a list of nobody.
  withEnv(" , ,, ", () => {
    assert.deepEqual(adminEmails(), []);
    assert.equal(isAdminEmail("anyone@example.com"), false);
  });
});

test("the list is read the way it gets typed", () => {
  withEnv("Owner@Example.com,  second@example.com ", () => {
    assert.deepEqual(adminEmails(), ["owner@example.com", "second@example.com"]);
    // Case and padding are how a person types an address, not a different one.
    assert.equal(isAdminEmail("owner@example.com"), true);
    assert.equal(isAdminEmail("  OWNER@example.com "), true);
    assert.equal(isAdminEmail("second@example.com"), true);
  });
});

test("nothing else gets in", () => {
  withEnv("owner@example.com", () => {
    assert.equal(isAdminEmail("someone@example.com"), false);
    // No substring or suffix matching: an address that merely contains an
    // operator's is somebody else's address.
    assert.equal(isAdminEmail("owner@example.com.attacker.test"), false);
    assert.equal(isAdminEmail("notowner@example.com"), false);
    assert.equal(isAdminEmail(null), false);
    assert.equal(isAdminEmail(undefined), false);
    assert.equal(isAdminEmail(""), false);
  });
});

test("the console is gated everywhere it can be reached", async () => {
  const [route, page, gate, endpoints] = await Promise.all([
    read("app/api/admin/route.ts"),
    read("app/admin/page.tsx"),
    read("lib/admin.ts"),
    read("app/data/endpoints.ts"),
  ]);

  // Two doors, and both of them locked: the page a browser asks for and the
  // endpoint its filters call. Either one left open is the whole leak.
  assert.match(route, /withAdmin\(/);
  assert.match(page, /getAdminSession\(\)/);
  assert.match(page, /notFound\(\)/);
  // 404 rather than 403 — a 403 confirms the console exists to anyone guessing.
  assert.match(gate, /status: 404/);
  assert.doesNotMatch(gate, /status: 403/);
  // Read only. A console that can change other people's rows is a much larger
  // promise than one that reports on them.
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  const adminCalls = endpoints.split("\n  admin: {")[1]?.split("\n  },")[0] ?? "";
  assert.ok(adminCalls, "the endpoints module should expose an admin block");
  assert.match(adminCalls, /api\.get/);
  assert.doesNotMatch(adminCalls, /api\.(post|patch|delete)/);
});

test("the cross-account query stays behind the gate, and stays quiet about content", async () => {
  const [adminDb, history] = await Promise.all([
    read("lib/admin-db.ts"),
    read("lib/history-db.ts"),
  ]);

  // This is the one module that reads every workspace at once. It says so, and
  // it must never grow a caller that is not behind withAdmin.
  assert.match(adminDb, /does \*not\* filter on\s*\n?\s*\*? ?`workspace_id`/);

  // What people write stays theirs: the three free-text columns the learner's
  // own feed shows are replaced here with a description of the action.
  assert.doesNotMatch(adminDb, /activity\.note/);
  assert.doesNotMatch(adminDb, /sessions\.note/);
  assert.doesNotMatch(adminDb, /tasks\.title/);
  assert.match(adminDb, /'Note added'/);
  assert.match(adminDb, /'Task completed'/);

  // Both feeds are assembled from the same four sources. An event kind added to
  // one and not the other is one the console silently stops reporting.
  for (const table of ["topic_activity", "study_sessions", "past_papers", "study_tasks"]) {
    assert.match(history, new RegExp(`public\\.${table}`), `history reads ${table}`);
    assert.match(adminDb, new RegExp(`public\\.${table}`), `the console reads ${table}`);
  }
});
