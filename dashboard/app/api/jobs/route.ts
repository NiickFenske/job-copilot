import Database from "better-sqlite3";
import path from "node:path";
import { NextResponse } from "next/server";

const DB_PATH = path.resolve(process.cwd(), "../data/jobs.sqlite3");

function getDb() {
  return new Database(DB_PATH, { readonly: false });
}

export async function GET() {
  const db = getDb();
  const jobs = db.prepare(`
    SELECT * FROM jobs
    ORDER BY (fit_score IS NULL), fit_score DESC, fetched_at DESC
  `).all();
  db.close();
  return NextResponse.json(jobs);
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  const db = getDb();
  db.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).run(status, id);
  db.close();
  return NextResponse.json({ ok: true });
}
