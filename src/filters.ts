import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { Job } from "./db/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FilterConfig {
  title_include: string[];
  title_exclude: string[];
  location_allow_patterns: string[];
  remote_ok: boolean;
  stack_dealbreakers: string[];
  stack_core: string[];
}

function loadConfig(): FilterConfig {
  const raw = fs.readFileSync(path.resolve(__dirname, "../config/filters.yaml"), "utf-8");
  return YAML.parse(raw) as FilterConfig;
}

const config = loadConfig();

function includesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

export function titleIsAllowed(title: string): boolean {
  const hasInclude = includesAny(title, config.title_include);
  const hasExclude = includesAny(title, config.title_exclude);
  return hasInclude && !hasExclude;
}

export function locationIsAllowed(location: string): boolean {
  if (!location) return config.remote_ok; // no location given - assume remote-friendly listing
  const lower = location.toLowerCase();
  if (config.remote_ok && lower.includes("remote")) return true;
  return config.location_allow_patterns.some((pattern) =>
    new RegExp(pattern, "i").test(location)
  );
}

export function stackIsAllowed(description: string): boolean {
  if (!description) return true; // nothing to check against, don't reject blindly
  const lower = description.toLowerCase();
  const hasDealbreaker = config.stack_dealbreakers.some((d) => lower.includes(d.toLowerCase()));
  if (!hasDealbreaker) return true;
  const hasCore = config.stack_core.some((c) => lower.includes(c.toLowerCase()));
  return hasCore;
}

export function passesFilters(job: Job): boolean {
  return (
    titleIsAllowed(job.title) &&
    locationIsAllowed(job.location ?? "") &&
    stackIsAllowed(job.description ?? "")
  );
}
