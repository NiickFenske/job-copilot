import { db } from "../db/db.js";

/**
 * Prints the jobs as JSON on stdout (nothing else - callers parse it). Used by
 * the Claude Code panel, which can't read the SQLite file itself.
 *
 * Usage: node --import tsx src/cli/export-jobs.ts [--limit 30] [--include-low]
 * Mirrors the dashboard: jobs scoring 5 or below are hidden unless --include-low.
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : fallback;
};

const LOW_SCORE_CUTOFF = 5;
const limit = Math.max(1, Math.min(200, value("--limit", 30)));
const includeLow = flag("--include-low");

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const today = localDay(new Date());

const rows = db
  .prepare(
    `SELECT id, title, company, location, apply_url, fit_score, recommendation, salary_range, work_arrangement, status, fetched_at
     FROM jobs
     ${includeLow ? "" : `WHERE fit_score IS NULL OR fit_score > ${LOW_SCORE_CUTOFF}`}
     ORDER BY (fit_score IS NULL), fit_score DESC, fetched_at DESC
     LIMIT ?`
  )
  .all(limit) as any[];

const counts = db
  .prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN fit_score IS NULL THEN 1 ELSE 0 END) AS unscored,
            SUM(CASE WHEN fit_score IS NOT NULL AND fit_score <= ${LOW_SCORE_CUTOFF} THEN 1 ELSE 0 END) AS hiddenLow
     FROM jobs`
  )
  .get() as { total: number; unscored: number | null; hiddenLow: number | null };

const jobs = rows.map((r) => ({ ...r, isNew: localDay(new Date(r.fetched_at)) === today }));

process.stdout.write(
  JSON.stringify({
    jobs,
    total: counts.total,
    unscored: counts.unscored ?? 0,
    hiddenLow: counts.hiddenLow ?? 0,
    newToday: (db.prepare("SELECT fetched_at FROM jobs").all() as any[]).filter((r) => localDay(new Date(r.fetched_at)) === today).length,
  })
);
