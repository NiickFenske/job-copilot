import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Jooble's official API - free API key required (register in under a minute
 * at jooble.org/api/about). POST request, key is part of the URL path.
 */
export async function fetchJooble(keywords: string, location: string): Promise<Job[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) return []; // silently skip if not configured - it's optional

  const res = await fetch(`https://jooble.org/api/${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, location }),
  });
  if (!res.ok) {
    console.warn(`[jooble] "${keywords}" in "${location}" failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { jobs: any[] };

  return (data.jobs ?? []).map((j) => {
    const description = String(j.snippet ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      source: "jooble",
      company: j.company || "Unknown",
      title: j.title,
      location: j.location,
      description,
      apply_url: j.link,
      posted_at: j.updated,
      dedup_key: makeDedupKey(j.company || j.link, j.title),
    } satisfies Job;
  });
}