import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Ashby's public job board API:
 *   https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true
 */
export async function fetchAshby(company: string, slug: string): Promise<Job[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[ashby] ${company} (${slug}) failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { jobs: any[] };

  return (data.jobs ?? []).map((j) => {
    const description = String(j.descriptionPlain ?? "").replace(/\s+/g, " ").trim();
    return {
      source: "ashby",
      company,
      title: j.title,
      location: j.location ?? "",
      description,
      apply_url: j.jobUrl ?? j.applyUrl,
      posted_at: j.publishedAt,
      dedup_key: makeDedupKey(company, j.title),
    } satisfies Job;
  });
}
