export interface AtsMatch {
  ats: "greenhouse" | "lever" | "ashby" | "workable" | "recruitee";
  slug: string;
  foundOnUrl: string;
}

// Each pattern captures the board slug from a matching URL found anywhere in
// the page's HTML (an <a href>, <iframe src>, or a redirect target).
const ATS_PATTERNS: { ats: AtsMatch["ats"]; regex: RegExp }[] = [
  // Greenhouse's older embed-widget format puts the real slug in a query
  // param (?for=company), not the path. Some pages embed this URL
  // percent-encoded (e.g. inside a JS string or data attribute), so we match
  // both the plain and %3F/%3D-encoded forms. This MUST be checked before
  // the plain boards.greenhouse.io/<slug> pattern below, or that pattern
  // wrongly matches the literal word "embed" from the path instead.
  { ats: "greenhouse", regex: /greenhouse\.io\/embed\/job_board(?:\?|%3F)for(?:=|%3D)([a-zA-Z0-9_-]+)/i },
  // Safety net: even if some other encoding slips past the pattern above,
  // never let the generic pattern below capture the literal word "embed" as
  // a slug - that's always a sign we matched the widget path, not a real
  // company board, and a wrong "found" result is worse than an honest miss.
  { ats: "greenhouse", regex: /(?:boards|job-boards)\.greenhouse\.io\/(?!embed\b)([a-zA-Z0-9_-]+)/ },
  { ats: "lever", regex: /jobs(?:\.[a-z]+)?\.lever\.co\/([a-zA-Z0-9_-]+)/ },
  { ats: "ashby", regex: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/ },
  { ats: "workable", regex: /apply\.workable\.com\/([a-zA-Z0-9_-]+)/ },
  { ats: "recruitee", regex: /([a-zA-Z0-9_-]+)\.recruitee\.com/ },
];

// Common paths a "careers" link resolves to - tried in order, first hit wins.
const CANDIDATE_PATHS = ["/careers", "/jobs", "/about/careers", "/company/careers", "/company/jobs"];

/**
 * Tries each candidate careers-page path on the given domain and scans the
 * HTML for a known ATS signature. Returns the first match found, or null if
 * none of the paths responded or none contained a recognizable ATS link.
 */
export async function detectAts(domain: string): Promise<AtsMatch | null> {
  for (const path of CANDIDATE_PATHS) {
    const url = `https://${domain}${path}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (job-copilot personal use ATS detector)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();

      // The page itself may already have redirected to the ATS - check the
      // final URL first, then fall back to scanning the HTML body.
      const haystacks = [res.url, html];
      for (const hay of haystacks) {
        for (const { ats, regex } of ATS_PATTERNS) {
          const match = hay.match(regex);
          if (match) {
            return { ats, slug: match[1], foundOnUrl: url };
          }
        }
      }
    } catch {
      // network error / bad domain / timeout - just try the next path
      continue;
    }
  }
  return null;
}