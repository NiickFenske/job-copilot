import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Remotive's public API, no auth required:
 *   https://remotive.com/api/remote-jobs?search=<keyword>
 */
export async function fetchRemotive(searchTerm: string): Promise<Job[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(searchTerm)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[remotive] search "${searchTerm}" failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { jobs: any[] };

  return (data.jobs ?? []).map((j) => {
    const description = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      source: "remotive",
      company: j.company_name,
      title: j.title,
      location: j.candidate_required_location ?? "Remote",
      description,
      apply_url: j.url,
      posted_at: j.publication_date,
      dedup_key: makeDedupKey(j.company_name, j.title),
    } satisfies Job;
  });
}
