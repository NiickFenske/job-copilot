import { makeDedupKey, type Job } from "../db/db.js";

/**
 * SmartRecruiters' public postings API - keyless, paginated:
 *   https://api.smartrecruiters.com/v1/companies/<identifier>/postings?offset=0&limit=100
 * <identifier> is the segment in jobs.smartrecruiters.com/<identifier>.
 *
 * Two quirks this works around:
 * 1. SmartRecruiters publishes the same posting once per language it's
 *    translated into - without deduping by their own "refNumber" field,
 *    one real opening can show up as several near-identical rows.
 * 2. The list endpoint doesn't always include a direct posting URL - when
 *    missing, the canonical https://jobs.smartrecruiters.com/<identifier>/<id>
 *    pattern is used instead, so apply_url is never left empty.
 */
export async function fetchSmartRecruiters(company: string, identifier: string): Promise<Job[]> {
  const jobs: Job[] = [];
  const seenRefNumbers = new Set<string>();
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = `https://api.smartrecruiters.com/v1/companies/${identifier}/postings?offset=${offset}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (offset === 0) console.warn(`[smartrecruiters] ${company} (${identifier}) failed: HTTP ${res.status}`);
      break;
    }

    const data = (await res.json().catch(() => null)) as any;
    const page: any[] = Array.isArray(data?.content) ? data.content : [];
    if (page.length === 0) break;

    for (const j of page) {
      const ref = j.refNumber ?? j.id;
      if (seenRefNumbers.has(ref)) continue; // same job, different language copy
      seenRefNumbers.add(ref);

      const loc = j.location ?? {};
      const place = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
      const location = loc.remote ? (place ? `Remote - ${place}` : "Remote") : place;

      jobs.push({
        source: "smartrecruiters",
        company,
        title: j.name,
        location,
        description: "", // list endpoint doesn't include the body; detail would cost one extra request per job
        apply_url: j.postingUrl ?? j.applyUrl ?? `https://jobs.smartrecruiters.com/${identifier}/${j.id}`,
        posted_at: j.releasedDate ?? j.createdOn,
        dedup_key: makeDedupKey(company, j.name),
      });
    }

    const totalFound = typeof data?.totalFound === "number" ? data.totalFound : offset + page.length;
    offset += limit;
    if (offset >= totalFound || page.length < limit) break;
  }

  return jobs;
}