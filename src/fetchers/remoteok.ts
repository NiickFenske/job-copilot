import { makeDedupKey, type Job } from "../db/db.js";

/**
 * RemoteOK's public JSON endpoint - no auth required. The first element of
 * the response array is a metadata/legal-notice object, not a job - skip it.
 */
export async function fetchRemoteOk(): Promise<Job[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "job-copilot (personal use, github.com placeholder)" },
  });
  if (!res.ok) {
    console.warn(`[remoteok] failed: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json() as any[];

  return data
    .filter((j) => j.id && j.position) // drop the leading metadata object
    .map((j) => {
      const description = String(j.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        source: "remoteok",
        company: j.company,
        title: j.position,
        location: j.location || "Remote",
        description,
        apply_url: j.url ?? `https://remoteok.com/l/${j.id}`,
        posted_at: j.date,
        dedup_key: makeDedupKey(j.company, j.position),
      } satisfies Job;
    });
}