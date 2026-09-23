import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Workable's public widget API:
 *   https://apply.workable.com/api/v1/widget/accounts/<subdomain>?details=true
 */
export async function fetchWorkable(company: string, subdomain: string): Promise<Job[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${subdomain}?details=true`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[workable] ${company} (${subdomain}) failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { jobs: any[] };

  return (data.jobs ?? []).map((j) => {
    const description = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const location = [j.city, j.region, j.country].filter(Boolean).join(", ") || (j.remote ? "Remote" : "");
    return {
      source: "workable",
      company,
      title: j.title,
      location,
      description,
      apply_url: j.url ?? j.application_url,
      posted_at: j.published_on,
      dedup_key: makeDedupKey(company, j.title),
    } satisfies Job;
  });
}