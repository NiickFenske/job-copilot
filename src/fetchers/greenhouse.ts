import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Greenhouse exposes a public, unauthenticated JSON endpoint per company,
 * meant for embedding on their own careers page:
 *   https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
 * This is the same data their careers page renders - no auth, no scraping
 * of rendered HTML required.
 */
export async function fetchGreenhouse(company: string, slug: string): Promise<Job[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[greenhouse] ${company} (${slug}) failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { jobs: any[] };

  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    // content is HTML; strip tags for a plain-text description used in scoring
    const description = String(j.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      source: "greenhouse",
      company,
      title: j.title,
      location,
      description,
      apply_url: j.absolute_url, // <- the direct apply link
      posted_at: j.updated_at,
      dedup_key: makeDedupKey(company, j.title),
    } satisfies Job;
  });
}
