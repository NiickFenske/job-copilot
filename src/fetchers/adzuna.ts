import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Adzuna's public search API - free app_id + app_key required (register at
 * developer.adzuna.com). Supports per-country endpoints; "ca" for Canada.
 */
export async function fetchAdzuna(what: string, where: string): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return []; // silently skip if not configured - it's optional

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what,
    where,
    results_per_page: "50",
  });
  const url = `https://api.adzuna.com/v1/api/jobs/ca/search/1?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[adzuna] "${what}" in "${where}" failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as { results: any[] };

  return (data.results ?? []).map((j) => {
    const description = String(j.description ?? "").replace(/\s+/g, " ").trim();
    return {
      source: "adzuna",
      company: j.company?.display_name || "Unknown",
      title: j.title,
      location: j.location?.display_name || "",
      description,
      apply_url: j.redirect_url,
      posted_at: j.created,
      dedup_key: makeDedupKey(j.company?.display_name || j.redirect_url, j.title),
    } satisfies Job;
  });
}