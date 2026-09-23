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
import { passesFilters } from "../filters.js";
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
  for (const term of searchTerms) {
    try {
      const jobs = await fetchJooble(term, "Manitoba");
      if (jobs.length > 0) console.log(`  jooble "${term}": ${jobs.length} jobs`);
      results.push(...jobs);
    } catch (err) {
      console.warn(`  jooble "${term}": fetch failed -`, (err as Error).message);
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

  let kept = 0;
  let inserted = 0;
  for (const job of all) {
    if (!passesFilters(job)) continue;
    kept++;
    if (insertJobIfNew(job)) inserted++;
  }

  console.log(`${kept} passed filters, ${inserted} were new and inserted into the database.`);
  console.log(`Run "npm run score" next to have Claude score fit for the new jobs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});