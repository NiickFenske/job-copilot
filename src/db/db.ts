import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/jobs.sqlite3");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Migration: add columns that didn't exist in earlier versions of this schema,
// so an existing database (with jobs already fetched/scored) picks them up
// without losing any data. SQLite has no "ADD COLUMN IF NOT EXISTS", so we
// just attempt each one and ignore the "duplicate column" error if it's
// already there.
const migrations = [
  "ALTER TABLE jobs ADD COLUMN salary_range TEXT",
  "ALTER TABLE jobs ADD COLUMN work_arrangement TEXT",
  "ALTER TABLE jobs ADD COLUMN summary TEXT",
  "ALTER TABLE jobs ADD COLUMN tech_stack TEXT",
  "ALTER TABLE jobs ADD COLUMN requirements TEXT",
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!(err as Error).message.includes("duplicate column")) throw err;
  }
}

export interface Job {
  id?: number;
  source: string;
  company: string;
  title: string;
  location?: string;
  description?: string;
  apply_url: string;
  posted_at?: string;
  dedup_key: string;
  fit_score?: number;
  fit_reasoning?: string;
  recommendation?: string;
  salary_range?: string;
  work_arrangement?: string;
  summary?: string;
  tech_stack?: string;      // JSON-stringified array
  requirements?: string;    // JSON-stringified array
  tailored_resume_path?: string;
  cover_letter_path?: string;
  status?: string;
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO jobs (source, company, title, location, description, apply_url, posted_at, dedup_key)
  VALUES (@source, @company, @title, @location, @description, @apply_url, @posted_at, @dedup_key)
`);

/** Insert a job if we haven't seen this company+title before. Returns true if it was new. */
export function insertJobIfNew(job: Job): boolean {
  // better-sqlite3 requires every named parameter to be present (undefined is
  // not allowed even for optional columns), so fill in nulls explicitly.
  const params = {
    location: null,
    description: null,
    posted_at: null,
    ...job,
  };
  const result = insertStmt.run(params);
  return result.changes > 0;
}

export function makeDedupKey(company: string, title: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").trim();
  return `${norm(company)}::${norm(title)}`;
}

export function getUnscoredJobs(): Job[] {
  return db.prepare(`SELECT * FROM jobs WHERE fit_score IS NULL`).all() as Job[];
}

export function setScore(
  id: number,
  fit_score: number,
  fit_reasoning: string,
  recommendation: string,
  extra: { salary_range: string; work_arrangement: string; summary: string; tech_stack: string[]; requirements: string[] }
) {
  db.prepare(`
    UPDATE jobs SET fit_score = ?, fit_reasoning = ?, recommendation = ?,
      salary_range = ?, work_arrangement = ?, summary = ?, tech_stack = ?, requirements = ?
    WHERE id = ?
  `).run(
    fit_score,
    fit_reasoning,
    recommendation,
    extra.salary_range,
    extra.work_arrangement,
    extra.summary,
    JSON.stringify(extra.tech_stack),
    JSON.stringify(extra.requirements),
    id
  );
}

export function getScoredUntailoredJobs(): Job[] {
  return db.prepare(`
    SELECT * FROM jobs
    WHERE fit_score IS NOT NULL
      AND recommendation = 'apply'
      AND tailored_resume_path IS NULL
  `).all() as Job[];
}

export function setTailored(id: number, resumePath: string, coverLetterPath: string) {
  db.prepare(`UPDATE jobs SET tailored_resume_path = ?, cover_letter_path = ? WHERE id = ?`)
    .run(resumePath, coverLetterPath, id);
}