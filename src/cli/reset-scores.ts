import { db } from "../db/db.js";

/**
 * Clears fit_score (and related fields) on every job, so the next
 * "npm run score" run picks all of them up again - useful after adding new
 * fields to the scoring output, so jobs scored before those fields existed
 * get backfilled instead of staying blank forever.
 */
function main() {
  const result = db.prepare(`
    UPDATE jobs SET fit_score = NULL, fit_reasoning = NULL, recommendation = NULL,
      salary_range = NULL, work_arrangement = NULL, summary = NULL,
      tech_stack = NULL, requirements = NULL
  `).run();

  console.log(`Cleared scoring data on ${result.changes} jobs.`);
  console.log(`Run "npm run score" to re-score everything with the current scoring logic.`);
  console.log(`This uses the cheap Haiku model, so re-scoring even a few hundred jobs costs very little.`);
}

main();