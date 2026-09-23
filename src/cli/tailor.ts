import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

import { getScoredUntailoredJobs, setTailored } from "../db/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic();

function loadProfile(): string {
  const profilePath = path.resolve(__dirname, "../../config/profile.yaml");
  return fs.readFileSync(profilePath, "utf-8");
}

async function draftMaterials(profileYaml: string, job: { title: string; company: string; description?: string }) {
  const prompt = `You are helping a job seeker prepare application materials for one specific job.
Base everything strictly on their real profile below - never invent experience, employers,
skills, or numbers they didn't provide.

CANDIDATE PROFILE (YAML):
${profileYaml}

JOB POSTING:
Company: ${job.company}
Title: ${job.title}
Description: ${job.description ?? "(no description provided)"}

Produce two things:
1. RESUME_BULLETS: 4-6 bullet points, reworded/reordered from the candidate's real
   experience to emphasize what this specific job cares about. Do not fabricate anything.
2. COVER_LETTER: a concise, specific cover letter (under 300 words), referencing real
   details from the job description and the candidate's real background. No generic filler.

Respond in this exact format, no extra commentary:
RESUME_BULLETS:
- ...
COVER_LETTER:
...`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5", // stronger model - cover letters/resume bullets are the thing a human (recruiter) actually reads, so writing quality matters here in a way it doesn't for scoring
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

async function main() {
  const profileYaml = loadProfile();
  const jobs = getScoredUntailoredJobs();

  if (jobs.length === 0) {
    console.log('No jobs marked "apply" without materials yet. Run "npm run score" first.');
    return;
  }

  const outDir = path.resolve(__dirname, "../../data/materials");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Drafting materials for ${jobs.length} jobs...`);
  for (const job of jobs) {
    try {
      const draft = await draftMaterials(profileYaml, job);
      const safeName = `${job.company}-${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const filePath = path.join(outDir, `${job.id}-${safeName}.md`);
      fs.writeFileSync(filePath, draft, "utf-8");

      // We store one file with both sections; dashboard links to it for review.
      setTailored(job.id!, filePath, filePath);
      console.log(`  wrote ${filePath}`);
    } catch (err) {
      console.warn(`  failed to draft materials for "${job.title}" at ${job.company}:`, (err as Error).message);
    }
  }

  console.log(`\nReview drafts in data/materials/ before using them - Claude can miss context`);
  console.log(`or misjudge tone, and everything should sound like you before you send it.`);
  console.log(`Run "npm run dashboard" to review jobs + materials + apply links together.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});