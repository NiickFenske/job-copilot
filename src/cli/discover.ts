import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import "dotenv/config";
import { detectAts } from "../discover-ats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Seed {
  name: string;
  domain: string;
}

async function main() {
  const seedsPath = path.resolve(__dirname, "../../config/discovery-seeds.yaml");
  const seeds = YAML.parse(fs.readFileSync(seedsPath, "utf-8")) as Seed[];

  console.log(`Checking ${seeds.length} companies for a recognizable ATS...\n`);

  const found: { name: string; ats: string; slug: string }[] = [];
  const notFound: string[] = [];

  for (const seed of seeds) {
    const match = await detectAts(seed.domain);
    if (match) {
      found.push({ name: seed.name, ats: match.ats, slug: match.slug });
      console.log(`  FOUND   ${seed.name.padEnd(20)} -> ${match.ats} / ${match.slug}`);
    } else {
      notFound.push(seed.name);
      console.log(`  --      ${seed.name.padEnd(20)} -> no known ATS detected`);
    }
  }

  // Write matches as a ready-to-review YAML block - NOT auto-merged into
  // companies.yaml, so you can eyeball each one before it's live.
  const outPath = path.resolve(__dirname, "../../config/discovered-companies.yaml");
  const lines = [
    "# Auto-discovered by \"npm run discover\" - REVIEW before copying into companies.yaml.",
    "# Each entry below was found by actually fetching that company's careers page and",
    "# spotting a known ATS link on it, so these should be real, but double check the",
    "# company name matches who you think it is (generic names can collide).",
    "",
    ...found.map((f) => `- name: "${f.name}"\n  ats: ${f.ats}\n  slug: "${f.slug}"`),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

  console.log(`\n${found.length} of ${seeds.length} companies matched a known ATS.`);
  console.log(`Results written to config/discovered-companies.yaml - review, then copy`);
  console.log(`entries you want into config/companies.yaml.`);
  if (notFound.length > 0) {
    console.log(`\nNo ATS detected for: ${notFound.join(", ")}`);
    console.log(`These likely don't use one of the 5 supported ATS platforms, or their`);
    console.log(`careers page lives at a path this script didn't try - check manually.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});