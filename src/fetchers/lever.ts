import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Lever's public postings API:
 *   https://api.lever.co/v0/postings/<slug>?mode=json
 */
export async function fetchLever(company: string, slug: string): Promise<Job[]> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[lever] ${company} (${slug}) failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as any[];

  return data.map((j) => {
    const description = String(j.descriptionPlain ?? j.description ?? "")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      source: "lever",
      company,
      title: j.text,
      location: j.categories?.location ?? "",
      description,
      apply_url: j.applyUrl ?? j.hostedUrl,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      dedup_key: makeDedupKey(company, j.text),
    } satisfies Job;
  });
}
