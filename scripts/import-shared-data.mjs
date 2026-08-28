// Loads the shared reference tables into Supabase Postgres.
//
//   node scripts/import-shared-data.mjs
//   node scripts/import-shared-data.mjs --catalogue data/paper-catalogue.csv
//
// Both tables are the same for every account, so this runs once per environment
// rather than per user. Re-running replaces the table contents; the per-user
// tables (attempts, paper notes) are never touched.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const DEFAULTS = {
  catalogue: "data/paper-catalogue.csv",
  versions: "data/syllabus-versions.csv",
};

const SEASON_CODES = {
  Spring: "F/M",
  Summer: "M/J",
  Winter: "O/N",
  January: "Jan",
  June: "Jun",
  October: "Oct",
};

// Which components count as AS, matching the app's stage convention.
const AS_COMPONENTS = {
  9709: ["1", "5"],
  9231: ["1", "3"],
  9702: ["1", "2", "3"],
  9618: ["1", "2"],
};

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadCsv(path) {
  const raw = readFileSync(resolve(path), "utf8").replace(/^﻿/, "");
  const [header, ...lines] = parseCsv(raw);
  const column = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  return { column, lines };
}

const number = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value) => String(value ?? "").trim() || null;
const boolean = (value) => String(value ?? "").trim().toLowerCase() === "true";

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** Reads DATABASE_URL from the environment, falling back to .env.local. */
function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(resolve(".env.local"), "utf8");
    const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    if (match?.[1]) return match[1];
  } catch {
    // fall through to the error below
  }
  throw new Error("DATABASE_URL is not set. Add it to .env.local or the environment.");
}

function catalogueRecords(path) {
  const { column, lines } = loadCsv(path);
  const required = ["Board", "Qualification", "Subject", "Paper_Code", "Year", "Season", "Paper_or_Unit_Code"];
  for (const name of required) {
    if (column[name] === undefined) throw new Error(`${path} is missing the ${name} column.`);
  }

  const seen = new Set();
  const records = [];
  let skipped = 0;

  for (const line of lines) {
    if (line.length <= 1) continue;
    const get = (name) => line[column[name]];
    const label = text(get("Paper_Code"));
    const year = number(get("Year"));
    const paperUnitCode = text(get("Paper_or_Unit_Code"));
    const season = text(get("Season"));
    // Edexcel rows carry no syllabus code; their unit code leads the paper label
    // (e.g. "WAC11 Jan 2024 Unit 1"), so fall back to that.
    const syllabusCode = text(get("Syllabus_Code"))
      ?? (label ? label.split(/\s+/)[0] : null)
      ?? text(get("Subject"));
    if (!syllabusCode || !year || !paperUnitCode || !season || !label) {
      skipped += 1;
      continue;
    }

    const seasonCode = SEASON_CODES[season] ?? season;
    const component = text(get("Component_or_Unit"));
    const asComponents = AS_COMPONENTS[syllabusCode];
    const stage = asComponents && component
      ? (asComponents.includes(component) ? "AS" : "A2")
      : null;

    let id = `${syllabusCode}-${seasonCode.replace("/", "").toLowerCase()}-${year}-${paperUnitCode}`;
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    seen.add(id);

    records.push({
      id,
      board: text(get("Board")) ?? "",
      qualification: text(get("Qualification")) ?? "",
      subject: text(get("Subject")) ?? "",
      syllabus_code: syllabusCode,
      label,
      year,
      season,
      season_code: seasonCode,
      component,
      variant: text(get("Variant")),
      paper_unit_code: paperUnitCode,
      stage,
      difficulty: text(get("Difficulty")),
      threshold_a: number(get("Grade_A_Threshold")),
      threshold_b: number(get("Grade_B_Threshold")),
      threshold_c: number(get("Grade_C_Threshold")),
      qp_url: text(get("QP_URL")),
      ms_url: text(get("MS_URL")),
      er_url: text(get("Examiner_Report_URL")),
    });
  }

  return { records, skipped };
}

function versionRecords(path) {
  const { column, lines } = loadCsv(path);
  if (column.Record_ID === undefined) throw new Error(`${path} is missing the Record_ID column.`);

  const records = [];
  for (const line of lines) {
    if (line.length <= 1) continue;
    const get = (name) => line[column[name]];
    const recordId = text(get("Record_ID"));
    if (!recordId) continue;
    records.push({
      record_id: recordId,
      board: text(get("Exam_Board")) ?? "",
      qualification: text(get("Qualification")) ?? "",
      subject: text(get("Subject_Name")) ?? "",
      syllabus_code: text(get("Syllabus_Code")) ?? "",
      year_from: number(get("Exam_Year_From")),
      year_to: number(get("Exam_Year_To")),
      is_current: boolean(get("Is_Current_In_2026")),
      is_latest: boolean(get("Is_Latest_Published_Version")),
      pdf_url: text(get("Syllabus_PDF_URL")),
      page_url: text(get("Syllabus_Page_URL")),
      notes: text(get("Availability_Notes")),
    });
  }
  return records;
}

async function replaceTable(sql, table, records, columns) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM ${tx(table)}`;
    // Each row binds one parameter per column; 500 keeps every statement well
    // under the 65535-parameter wire limit.
    for (let start = 0; start < records.length; start += 500) {
      const chunk = records.slice(start, start + 500);
      if (!chunk.length) continue;
      await tx`INSERT INTO ${tx(table)} ${tx(chunk, ...columns)}`;
    }
  });
}

const sql = postgres(connectionString(), { prepare: false, max: 1, connect_timeout: 30 });

try {
  const versions = versionRecords(readArg("versions", DEFAULTS.versions));
  await replaceTable(sql, "syllabus_versions", versions, [
    "record_id", "board", "qualification", "subject", "syllabus_code",
    "year_from", "year_to", "is_current", "is_latest", "pdf_url", "page_url", "notes",
  ]);
  console.log(`syllabus_versions: ${versions.length} rows`);

  const { records, skipped } = catalogueRecords(readArg("catalogue", DEFAULTS.catalogue));
  await replaceTable(sql, "catalogue_papers", records, [
    "id", "board", "qualification", "subject", "syllabus_code", "label", "year",
    "season", "season_code", "component", "variant", "paper_unit_code", "stage",
    "difficulty", "threshold_a", "threshold_b", "threshold_c", "qp_url", "ms_url", "er_url",
  ]);
  console.log(`catalogue_papers: ${records.length} rows${skipped ? ` (${skipped} incomplete rows skipped)` : ""}`);
} finally {
  await sql.end();
}
