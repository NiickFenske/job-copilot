import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

import { getUnscoredJobs, setScore } from "../db/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

function loadProfile(): string {
  const profilePath = path.resolve(__dirname, "../../config/profile.yaml");
  if (!fs.existsSync(profilePath)) {
    throw new Error(
      "config/profile.yaml not found. Copy config/profile.example.yaml to config/profile.yaml and fill in your real background first."
    );
  }
  return fs.readFileSync(profilePath, "utf-8");
}

interface ScoreResult {
  fit_score: number;
  recommendation: "apply" | "consider" | "skip";
  reasoning: string;
  salary_range: string;
  work_arrangement: string;
  summary: string;
  tech_stack: string[];
  requirements: string[];
}

async function scoreJob(profileYaml: string, job: { title: string; company: string; description?: string }): Promise<ScoreResult> {
  const prompt = `You are helping a job seeker evaluate a single job posting against their real background.

CANDIDATE PROFILE (YAML):
${profileYaml}

JOB POSTING:
Company: ${job.company}
Title: ${job.title}
Description: ${job.description ?? "(no description provided)"}

Score this candidate's fit for this specific job from 0-100, considering their actual
experience and skills against what the job asks for. Be honest and specific - don't
inflate the score to be encouraging. Note concrete gaps, transferable strengths, and
any risk factors (e.g. under-qualified, over-qualified, stack mismatch).

Two hard eligibility checks - apply these before scoring skill fit:
1. WORK AUTHORIZATION: the candidate's profile states their work authorization. If this
   posting explicitly requires authorization to work somewhere they are not eligible
   (e.g. a US-only posting for a Canada-only candidate), set recommendation to "skip"
   regardless of skill fit, and say why in the reasoning.
2. SALARY: the candidate's profile gives a salary_hard_floor_cad. If this posting states
   an explicit salary range AND its upper end is below that floor, set recommendation to
   "skip" regardless of skill fit. If no salary is posted at all, do NOT penalize the
   score or recommendation for that - treat it as neutral/unknown.

Also extract, straight from the posting, in your own words (do not copy long verbatim
passages):
- salary_range: the exact salary/compensation figures if the posting states them (e.g.
  "$70,000-$90,000 CAD"). If none are stated anywhere in the posting, use exactly the
  string "Not listed" - never guess or estimate a number that isn't in the text.
- work_arrangement: one of exactly "Remote", "Hybrid", "Onsite", or "Unclear" - pick
  "Unclear" rather than guessing if the posting doesn't say.
- summary: 1-2 plain sentences on what this role actually does day to day.
- tech_stack: an array of specific technologies/tools/languages the posting mentions
  (e.g. ["React", "TypeScript", "Shopify Liquid"]). Empty array if none are named.
- requirements: an array of 3-6 short phrases (not full sentences, not verbatim copies)
  capturing the posting's main qualifications/requirements.

Keep every field concise - this keeps the total response short and reliable. reasoning
and summary should be genuinely brief (1-2 sentences each, not 3-4), and requirement
phrases should be a few words each, not full clauses.

Respond ONLY with JSON matching this exact shape, no other text:
{"fit_score": <0-100 integer>, "recommendation": "<apply|consider|skip>", "reasoning": "<2-4 sentences>", "salary_range": "<string>", "work_arrangement": "<Remote|Hybrid|Onsite|Unclear>", "summary": "<1-2 sentences>", "tech_stack": ["..."], "requirements": ["..."]}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001", // cheap/fast model - fit scoring is a mechanical classification task, not creative writing, so a smaller model does this well for a fraction of the cost
    max_tokens: 1024, // the response now includes salary/tech-stack/requirements arrays on top of the original fields - 500 was enough for the old shorter shape but truncates this one mid-string
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as ScoreResult;
}

async function main() {
  const profileYaml = loadProfile();
  const jobs = getUnscoredJobs();

  if (jobs.length === 0) {
    console.log("No unscored jobs found. Run \"npm run fetch\" first.");
    return;
  }

  console.log(`Scoring ${jobs.length} jobs...`);
  for (const job of jobs) {
    try {
      const result = await scoreJob(profileYaml, job);
      setScore(job.id!, result.fit_score, result.reasoning, result.recommendation, {
        salary_range: result.salary_range,
        work_arrangement: result.work_arrangement,
        summary: result.summary,
        tech_stack: result.tech_stack,
        requirements: result.requirements,
      });
      console.log(`  [${result.fit_score}] ${result.recommendation.padEnd(8)} ${job.company} - ${job.title}`);
    } catch (err) {
      console.warn(`  failed to score "${job.title}" at ${job.company}:`, (err as Error).message);
    }
  }

  console.log(`\nDone. Run "npm run tailor" to draft resumes/cover letters for the "apply" recommendations,`);
  console.log(`or "npm run dashboard" to review everything in the browser.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});