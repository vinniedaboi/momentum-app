// Imports the past-paper catalogue CSV into the local D1 (Miniflare) database.
//
//   node scripts/import-catalogue.mjs [path/to/catalogue.csv]
//
// Re-running replaces the catalogue table contents; your attempts and per-paper
// notes live in other tables and are never touched.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const DEFAULT_CSV = "data/paper-catalogue.csv";

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

function findDatabaseFile() {
  const dir = resolve(D1_DIR);
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => ({ name, size: statSync(join(dir, name)).size }))
    .sort((a, b) => b.size - a.size);
  if (!candidates.length) throw new Error(`No D1 database found in ${dir}. Start the dev server once first.`);
  return join(dir, candidates[0].name);
}

function number(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

const csvPath = resolve(process.argv[2] ?? DEFAULT_CSV);
const raw = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const [header, ...lines] = parseCsv(raw);
const column = Object.fromEntries(header.map((name, index) => [name.trim(), index]));

const required = ["Board", "Qualification", "Subject", "Paper_Code", "Year", "Season", "Paper_or_Unit_Code"];
for (const name of required) {
  if (column[name] === undefined) throw new Error(`CSV is missing the ${name} column.`);
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

  records.push([
    id,
    text(get("Board")) ?? "",
    text(get("Qualification")) ?? "",
    text(get("Subject")) ?? "",
    syllabusCode,
    label,
    year,
    season,
    seasonCode,
    component,
    text(get("Variant")),
    paperUnitCode,
    stage,
    text(get("Difficulty")),
    number(get("Grade_A_Threshold")),
    number(get("Grade_B_Threshold")),
    number(get("Grade_C_Threshold")),
    text(get("QP_URL")),
    text(get("MS_URL")),
    text(get("Examiner_Report_URL")),
  ]);
}

const databaseFile = findDatabaseFile();
const db = new DatabaseSync(databaseFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS catalogue_papers (
    id TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    qualification TEXT NOT NULL,
    subject TEXT NOT NULL,
    syllabus_code TEXT NOT NULL,
    label TEXT NOT NULL,
    year INTEGER NOT NULL,
    season TEXT NOT NULL,
    season_code TEXT NOT NULL,
    component TEXT,
    variant TEXT,
    paper_unit_code TEXT NOT NULL,
    stage TEXT,
    difficulty TEXT,
    threshold_a REAL,
    threshold_b REAL,
    threshold_c REAL,
    qp_url TEXT,
    ms_url TEXT,
    er_url TEXT
  )
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_catalogue_qual_subject ON catalogue_papers(qualification, subject)");
db.exec("CREATE INDEX IF NOT EXISTS idx_catalogue_year ON catalogue_papers(year)");
db.exec("CREATE INDEX IF NOT EXISTS idx_catalogue_subject_year ON catalogue_papers(subject, year)");

const before = db.prepare("SELECT COUNT(*) AS total FROM catalogue_papers").get().total;

db.exec("BEGIN");
db.exec("DELETE FROM catalogue_papers");
const insert = db.prepare(`
  INSERT INTO catalogue_papers (
    id, board, qualification, subject, syllabus_code, label, year, season, season_code,
    component, variant, paper_unit_code, stage, difficulty,
    threshold_a, threshold_b, threshold_c, qp_url, ms_url, er_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const record of records) insert.run(...record);
db.exec("COMMIT");

const after = db.prepare("SELECT COUNT(*) AS total FROM catalogue_papers").get().total;
const byQualification = db.prepare(
  "SELECT qualification, COUNT(*) AS count FROM catalogue_papers GROUP BY qualification ORDER BY count DESC",
).all();
const withThresholds = db.prepare("SELECT COUNT(*) AS total FROM catalogue_papers WHERE threshold_a IS NOT NULL").get().total;
const withDifficulty = db.prepare("SELECT COUNT(*) AS total FROM catalogue_papers WHERE difficulty IS NOT NULL").get().total;
const withQp = db.prepare("SELECT COUNT(*) AS total FROM catalogue_papers WHERE qp_url IS NOT NULL").get().total;
db.close();

console.log(`Source      ${csvPath}`);
console.log(`Database    ${databaseFile}`);
console.log(`Replaced    ${before} rows -> ${after} rows${skipped ? ` (${skipped} skipped)` : ""}`);
for (const row of byQualification) console.log(`  ${row.count.toString().padStart(5)}  ${row.qualification}`);
console.log(`Thresholds  ${withThresholds}`);
console.log(`Difficulty  ${withDifficulty}`);
console.log(`QP links    ${withQp}`);
