import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Recruitee's public offers API:
 *   https://<company>.recruitee.com/api/offers/
 */
export async function fetchRecruitee(company: string, subdomain: string): Promise<Job[]> {
  const url = `https://${subdomain}.recruitee.com/api/offers/`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[recruitee] ${company} (${subdomain}) failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { offers: any[] };

  return (data.offers ?? []).map((j) => {
    const description = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const location = j.location || (j.remote ? "Remote" : "");
    return {
      source: "recruitee",
      company,
      title: j.title,
      location,
      description,
      apply_url: j.careers_url,
      posted_at: j.created_at,
      dedup_key: makeDedupKey(company, j.title),
    } satisfies Job;
  });
}