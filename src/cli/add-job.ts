import fs from "node:fs";
import "dotenv/config";
import { insertJobIfNew, makeDedupKey, type Job } from "../db/db.js";

/**
 * Reads a simple text file describing one job you found manually (e.g. by
 * browsing a JS-rendered careers page this pipeline can't auto-read) and
 * inserts it into the same database used by fetch/score/tailor/dashboard -
 * so it gets scored and tailored exactly like anything else, no copy-pasting
 * into a chat required.
 *
 * Expected file format - a few "Field: value" header lines, a blank line,
 * then the job description as free text:
 *
 *   Company: Acme Inc
 *   Title: Solutions Engineer
 *   Location: Remote
 *   Apply URL: https://acme.example/careers/123
 *
 *   Full job description text goes here, pasted straight off the page...
 */
function parseJobFile(filePath: string): Job {
  const raw = fs.readFileSync(filePath, "utf-8");
  const [headerBlock, ...rest] = raw.split(/\n\s*\n/); // split on first blank line
  const description = rest.join("\n\n").trim();

  const fields: Record<string, string> = {};
  for (const line of headerBlock.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
  }

  const company = fields["company"];
  const title = fields["title"];
  const apply_url = fields["apply url"] || fields["url"] || fields["link"];

  if (!company || !title || !apply_url) {
    throw new Error(
      `File is missing a required field. Need "Company:", "Title:", and "Apply URL:" as the first lines, ` +
      `then a blank line, then the description. Got fields: ${Object.keys(fields).join(", ") || "(none found)"}`
    );
  }

  return {
    source: "manual",
    company,
    title,
    location: fields["location"] ?? "",
    description,
    apply_url,
    dedup_key: makeDedupKey(company, title),
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run add-job -- path/to/job.txt");
    console.error("(the -- is required so npm passes the path through to this script)");
    process.exit(1);
  }

  const job = parseJobFile(filePath);
  const wasNew = insertJobIfNew(job);

  if (wasNew) {
    console.log(`Added: ${job.title} at ${job.company}`);
    console.log(`Run "npm run score" to have it fit-scored alongside everything else.`);
  } else {
    console.log(`Already in the database (same company + title as an existing entry) - skipped.`);
  }
}

main();