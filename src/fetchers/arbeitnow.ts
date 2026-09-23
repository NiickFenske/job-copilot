import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Arbeitnow's public, keyless job board API. Aggregates from several ATS
 * platforms (Greenhouse, SmartRecruiters, Team Tailor, Recruitee, etc).
 * Skews European, but worth including - remote-tagged postings are often
 * open to candidates anywhere.
 */
export async function fetchArbeitnow(): Promise<Job[]> {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) {
    console.warn(`[arbeitnow] failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { data: any[] };

  return (data.data ?? []).map((j) => {
    const description = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      source: "arbeitnow",
      company: j.company_name,
      title: j.title,
      location: j.location || (j.remote ? "Remote" : ""),
      description,
      apply_url: j.url,
      posted_at: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
      dedup_key: makeDedupKey(j.company_name, j.title),
    } satisfies Job;
  });
}