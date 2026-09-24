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
1. WORK AUTHORIZATION: the candidate's profile states their work authorization. Only
   trigger this check if the posting EXPLICITLY states an authorization/eligibility
   requirement in its own text (e.g. "must be authorized to work in the United States",
   "US citizens only"). Do NOT infer or assume a requirement from things like company
   size, being a "global" company, or having offices in other countries - those are not
   evidence of a stated requirement. If genuinely explicit, set recommendation to "skip"
   regardless of skill fit and quote or closely paraphrase the actual restricting text in
   your reasoning. If there's no explicit statement either way, do not treat this as a
   negative at all.
2. SALARY: the candidate's profile gives a salary_hard_floor_cad. If this posting states
   an explicit salary range AND its upper end is below that floor, set recommendation to
   "skip" regardless of skill fit. If no salary is posted at all, do NOT penalize the
   score or recommendation for that - treat it as neutral/unknown.

If the posting is missing key details (location, salary, full description, tech stack),
do not treat that incompleteness itself as a reason to skip, and do not fill the gap with
a pessimistic assumption. Score the fit based on whatever signal IS actually present (the
title, any responsibilities or requirements text that made it through) as if that were the
whole posting - a good title/responsibility match with missing salary/location should
still score well. Reserve low scores for genuine misalignment you can actually see (wrong
skills, wrong seniority, an explicit dealbreaker), not for your own uncertainty about
fields the posting simply didn't include. Note what's missing in your reasoning so the
person knows to check the original listing for those specifics, but don't let missing
data crater a score that the visible content otherwise supports.

Ground every judgment in the SPECIFIC text on both sides - the posting's actual listed
responsibilities/requirements (or whatever fragments are visible) versus the candidate's
actual profile bullets. Do not reason from generic assumptions about what a job title
"typically" requires (e.g. "Solutions Engineer roles typically need X") - if the posting
doesn't explicitly state a requirement, don't assume the role has it just because similar
titles elsewhere often do. Compare what's actually written against what's actually in the
profile, line by line where possible.

SENIORITY CALIBRATION: weigh the posting's stated seniority bar against the candidate's
actual career trajectory - their years of experience AND the actual seniority of titles
they've held, not just topic/technology overlap.
- If a posting explicitly requires a tier the candidate has never held (e.g. "Staff" or
  "Principal" when their title history tops out at Senior-adjacent scope), this is a
  serious, practical gap - similar in real-world impact to a hard requirement gap, since
  the candidate is very unlikely to be shortlisted regardless of tech-stack overlap. Score
  this in roughly the 20-35 range unless something unusual compensates, and use
  "consider" or "skip" rather than "apply".
- A "Senior" (or similar) requirement should only be scored as a strong match when the
  SPECIFIC skill areas the posting emphasizes as requiring that seniority are areas the
  candidate has genuinely deep, demonstrated experience in per their profile - not merely
  adjacent or general technology overlap. E.g. strong general JavaScript/TypeScript
  fundamentals do NOT make someone a strong senior match for a posting whose senior bar
  is specifically in a niche area (browser internals, SDK architecture, performance
  engineering) the candidate has no demonstrated depth in - that is a real gap to reflect
  in the score, not something general fundamentals should paper over.

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

Two worked examples of the calibration above, in practice:

EXAMPLE A (should score HIGH despite an incomplete posting): a posting titled "Solutions
Engineer" or "Technical Account Manager" with fragments mentioning "technical point of
contact for enterprise clients," "answering API questions," "troubleshooting integration
issues" - even with salary and location missing. If the candidate's profile shows years of
technical support work explicitly troubleshooting API/integration issues for customers and
"serving as a bridge between support and development," that is a direct, specific match to
what's actually written in the posting. This should score highly (roughly 70-85) - the
missing salary/location are just unknowns to flag, not reasons to doubt a fit this
concrete.

EXAMPLE B (should score LOW despite keyword overlap): a posting titled "Staff JavaScript
Developer" requiring "Web SDK architecture," "browser internals," "performance
optimization," aimed at an 8+ year specialist. If the candidate's profile shows general
JavaScript/TypeScript and frontend framework experience but no SDK-specific or
browser-internals work, and their title history never reached "Staff," this should score
low (roughly 20-35) despite the JavaScript keyword technically overlapping - the posting's
actual specialization and seniority bar are not demonstrated in the profile, and generic
language-familiarity doesn't substitute for that.

Before producing your final answer, briefly reason: what does the posting actually,
specifically ask for (or what fragments are visible); what specific profile evidence does
or doesn't support each of those; then decide the score based on that comparison, not on
assumptions about the job title category in general. Keep this reasoning short - 2-3
sentences, regardless of how many factors there are to weigh. The two worked examples
above are illustrations of the calibration logic only, not a length template - your own
per-job reasoning should be much shorter than those examples, since it only needs to state
your conclusion and its single most decisive factor, not walk through the full analysis.

After your brief reasoning, output the final JSON on its own, wrapped in a fenced code
block like this, with nothing after it:
\`\`\`json
{"fit_score": <0-100 integer>, "recommendation": "<apply|consider|skip>", "reasoning": "<2-4 sentences>", "salary_range": "<string>", "work_arrangement": "<Remote|Hybrid|Onsite|Unclear>", "summary": "<1-2 sentences>", "tech_stack": ["..."], "requirements": ["..."]}
\`\`\``;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5", // scoring requires real comparative judgment (matching specific posting fragments against specific resume evidence, resisting stereotypes about job titles) - this proved too subtle for the cheaper Haiku model to do reliably, so worth the higher per-job cost since this only runs against new postings each day, not the whole backlog
    max_tokens: 2048, // generous headroom for the reasoning-before-JSON step - too little here means the response gets cut off before ever reaching the JSON block, which surfaces as a confusing "invalid JSON" error rather than an obvious truncation
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `response was cut off (hit the ${2048}-token limit) before completing - the model's ` +
      `reasoning likely ran too long. This is a truncation issue, not a JSON formatting bug.`
    );
  }

  return JSON.parse(extractJson(raw)) as ScoreResult;
}

/**
 * The model now reasons in prose before emitting the final JSON (this improves
 * judgment quality - forcing pure-JSON-only output gives it no room to think).
 * Extract just the JSON: prefer a fenced ```json block if present, otherwise
 * fall back to the first '{' through the last '}' in the response.
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
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