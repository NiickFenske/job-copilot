import { db } from "../db/db.js";

/** Usage: node --import tsx src/cli/set-status.ts <job_id> <status> - same statuses as the dashboard dropdown. */
const STATUSES = ["new", "applied", "interview", "rejected", "skipped"];
const [idArg, status] = process.argv.slice(2);
const id = Number(idArg);

if (!Number.isInteger(id) || !STATUSES.includes(status)) {
  console.error(`Usage: set-status <job_id> <${STATUSES.join("|")}>`);
  process.exit(1);
}
const result = db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(status, id);
if (result.changes === 0) {
  console.error(`No job with id ${id}.`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true, id, status }));
