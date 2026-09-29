import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import "dotenv/config";

import { fetchGreenhouse } from "../fetchers/greenhouse.js";
import { fetchLever } from "../fetchers/lever.js";
import { fetchAshby } from "../fetchers/ashby.js";
import { fetchWorkable } from "../fetchers/workable.js";
import { fetchRecruitee } from "../fetchers/recruitee.js";
import { fetchRemotive } from "../fetchers/remotive.js";
import { fetchRemoteOk } from "../fetchers/remoteok.js";
import { fetchArbeitnow } from "../fetchers/arbeitnow.js";
import { fetchJooble } from "../fetchers/jooble.js";
import { fetchAdzuna } from "../fetchers/adzuna.js";
import { titleIsAllowed, locationIsAllowed, stackIsAllowed } from "../filters.js";
import { insertJobIfNew, type Job } from "../db/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CompanyEntry {
  name: string;
  ats: "greenhouse" | "lever" | "ashby" | "workable" | "recruitee";
  slug: string;
}

async function fetchAllCompanies(): Promise<Job[]> {
  const raw = fs.readFileSync(path.resolve(__dirname, "../../config/companies.yaml"), "utf-8");
  const companies = YAML.parse(raw) as CompanyEntry[];

  const results: Job[] = [];
  for (const c of companies) {
    try {
      let jobs: Job[] = [];
      if (c.ats === "greenhouse") jobs = await fetchGreenhouse(c.name, c.slug);
      else if (c.ats === "lever") jobs = await fetchLever(c.name, c.slug);
      else if (c.ats === "ashby") jobs = await fetchAshby(c.name, c.slug);
      else if (c.ats === "workable") jobs = await fetchWorkable(c.name, c.slug);
      else if (c.ats === "recruitee") jobs = await fetchRecruitee(c.name, c.slug);
      results.push(...jobs);
      console.log(`  ${c.name}: ${jobs.length} jobs`);
    } catch (err) {
      // one company failing shouldn't kill the whole run
      console.warn(`  ${c.name}: fetch failed -`, (err as Error).message);
    }
  }
  return results;
}

async function fetchAllAggregators(): Promise<Job[]> {
  // Extend this with more search terms as you need it.
  const searchTerms = ["javascript developer", "frontend engineer", "shopify"];
  const results: Job[] = [];
  for (const term of searchTerms) {
    try {
      const jobs = await fetchRemotive(term);
      results.push(...jobs);
      console.log(`  remotive "${term}": ${jobs.length} jobs`);
    } catch (err) {
      console.warn(`  remotive "${term}": fetch failed -`, (err as Error).message);
    }
  }

  try {
    const jobs = await fetchRemoteOk();
    results.push(...jobs);
    console.log(`  remoteok: ${jobs.length} jobs`);
  } catch (err) {
    console.warn(`  remoteok: fetch failed -`, (err as Error).message);
  }

  try {
    const jobs = await fetchArbeitnow();
    results.push(...jobs);
    console.log(`  arbeitnow: ${jobs.length} jobs`);
  } catch (err) {
    console.warn(`  arbeitnow: fetch failed -`, (err as Error).message);
  }

  // Jooble and Adzuna are optional - they need free API keys (see .env.example).
  // Their fetchers silently return [] if the keys aren't set, so these calls
  // are always safe to leave in even before you've signed up.
  // Search both "Remote" and "Manitoba" for each term - remote is the stated
  // primary preference, Manitoba covers local/hybrid roles. Searching only
  // "Manitoba" (as this used to do) would silently miss remote postings that
  // don't happen to mention Manitoba by name anywhere in their text.
  const joobleLocations = ["Remote", "Manitoba"];
  for (const term of searchTerms) {
    for (const location of joobleLocations) {
      try {
        const jobs = await fetchJooble(term, location);
        if (jobs.length > 0) console.log(`  jooble "${term}" (${location}): ${jobs.length} jobs`);
        results.push(...jobs);
      } catch (err) {
        console.warn(`  jooble "${term}" (${location}): fetch failed -`, (err as Error).message);
      }
    }

    try {
      const jobs = await fetchAdzuna(term, "");
      if (jobs.length > 0) console.log(`  adzuna "${term}": ${jobs.length} jobs`);
      results.push(...jobs);
    } catch (err) {
      console.warn(`  adzuna "${term}": fetch failed -`, (err as Error).message);
    }
  }

  return results;
}

async function main() {
  console.log("Fetching from companies.yaml...");
  const companyJobs = await fetchAllCompanies();

  console.log("Fetching from aggregators...");
  const aggregatorJobs = await fetchAllAggregators();

  const all = [...companyJobs, ...aggregatorJobs];
  console.log(`\nFetched ${all.length} total postings before filtering.`);

  // Per-source tracking: how many each source returned, how many survived
  // filtering (and why the rest didn't), and how many were genuinely new.
  // Without this, one summary number hides which sources are actually
  // contributing - and which are silently being filtered down to nothing.
  const stats: Record<string, { fetched: number; passed: number; inserted: number; badTitle: number; badLocation: number; badStack: number }> = {};
  const statFor = (source: string) =>
    (stats[source] ??= { fetched: 0, passed: 0, inserted: 0, badTitle: 0, badLocation: 0, badStack: 0 });

  for (const job of all) {
    const s = statFor(job.source);
    s.fetched++;

    if (!titleIsAllowed(job.title)) { s.badTitle++; continue; }
    if (!locationIsAllowed(job.location ?? "")) { s.badLocation++; continue; }
    if (!stackIsAllowed(job.description ?? "")) { s.badStack++; continue; }

    s.passed++;
    if (insertJobIfNew(job)) s.inserted++;
  }

  console.log("\nPer-source breakdown:");
  console.log("  source       fetched  passed  new  | dropped: title  location  stack");
  for (const [source, s] of Object.entries(stats).sort((a, b) => b[1].fetched - a[1].fetched)) {
    console.log(
      `  ${source.padEnd(12)} ${String(s.fetched).padStart(7)}  ${String(s.passed).padStart(6)}  ${String(s.inserted).padStart(3)}  |          ${String(s.badTitle).padStart(5)}  ${String(s.badLocation).padStart(8)}  ${String(s.badStack).padStart(5)}`
    );
  }

  const totalPassed = Object.values(stats).reduce((n, s) => n + s.passed, 0);
  const totalInserted = Object.values(stats).reduce((n, s) => n + s.inserted, 0);
  console.log(`\n${totalPassed} passed filters, ${totalInserted} were new and inserted into the database.`);
  console.log(`Run "npm run score" next to have Claude score fit for the new jobs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});