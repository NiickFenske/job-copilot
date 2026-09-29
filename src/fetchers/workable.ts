import { makeDedupKey, type Job } from "../db/db.js";

/**
 * Workable's official docs describe the public jobs endpoint as
 *   https://www.workable.com/api/accounts/<subdomain>?details=true
 * (top-level keys: name, description, jobs). The apply-site widget endpoint is
 * kept as a fallback. Tried in order; the first one that returns jobs wins.
 *
 * Earlier versions only tried the widget endpoint and silently returned zero
 * jobs for every company - so when an endpoint answers OK but gives no jobs,
 * this now logs the response's top-level keys, letting you tell "this company
 * genuinely has no openings" apart from "the response wasn't shaped as expected".
 */
const ENDPOINTS: ((subdomain: string) => string)[] = [
  (s) => `https://www.workable.com/api/accounts/${s}?details=true`,
  (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}?details=true`,
];

const stripHtml = (html: unknown) =>
  String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function fetchWorkable(company: string, subdomain: string): Promise<Job[]> {
  for (const buildUrl of ENDPOINTS) {
    const url = buildUrl(subdomain);

    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch {
      continue; // network error - try the next endpoint
    }
    if (!res.ok) continue;

    const data = (await res.json().catch(() => null)) as any;
    const rawJobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];

    if (rawJobs.length === 0) {
      console.warn(
        `[workable] ${company} (${subdomain}): ${new URL(url).host} answered OK but returned no jobs ` +
        `(top-level keys: ${data && typeof data === "object" ? Object.keys(data).join(", ") || "none" : "response was not JSON"})`
      );
      continue;
    }

    const jobs: Job[] = [];
    for (const j of rawJobs) {
      const applyUrl = j.application_url ?? j.url ?? j.shortlink;
      if (!j.title || !applyUrl) continue; // apply_url is required downstream

      // Field names differ between Workable's endpoints (state vs region,
      // telecommuting vs remote vs workplace_type), so accept any of them.
      const first = Array.isArray(j.locations) ? j.locations[0] : undefined;
      const place = [j.city ?? first?.city, j.state ?? j.region ?? first?.region, j.country ?? first?.country]
        .filter(Boolean)
        .join(", ");
      const isRemote = j.telecommuting === true || j.remote === true || j.workplace_type === "remote";
      const location = isRemote ? (place ? `Remote - ${place}` : "Remote") : place;

      jobs.push({
        source: "workable",
        company,
        title: j.title,
        location,
        description: stripHtml([j.description, j.requirements, j.benefits].filter(Boolean).join(" ")),
        apply_url: applyUrl,
        posted_at: j.published_on ?? j.created_at,
        dedup_key: makeDedupKey(company, j.title),
      });
    }
    return jobs;
  }
  return [];
}