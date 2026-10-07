import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * One place for every model call in the project.
 *
 * DEFAULT BACKEND - "claude-cli": runs Claude Code in headless mode (`claude -p`),
 * which uses the Claude subscription you're signed in with (`claude auth login`)
 * instead of API tokens. Set AI_BACKEND=api to go back to the Anthropic API.
 *
 * Three things here are easy to get wrong, and each one silently changes who
 * gets billed or how fast your subscription drains - so they're enforced in
 * code, not left as notes:
 *
 * 1. CREDENTIAL PRECEDENCE. If ANTHROPIC_API_KEY (or a few related variables)
 *    is set, Claude Code uses it INSTEAD of your subscription login. This
 *    project's .env sets one for the API backend, and dotenv puts it into
 *    every child process, so claudeEnv() removes those variables from the
 *    child's environment.
 * 2. NEVER USE --bare. It looks like the obvious way to slim down headless
 *    calls, but its help text says Anthropic auth is "strictly ANTHROPIC_API_KEY
 *    or apiKeyHelper (OAuth and keychain are never read)" - it can't use a
 *    subscription at all. --safe-mode is used instead: it turns off CLAUDE.md,
 *    skills, plugins, hooks and MCP servers while "auth... work[s] normally".
 * 3. PER-CALL OVERHEAD. Each call is a whole Claude Code process whose default
 *    system prompt and tool definitions would otherwise be sent every time, and
 *    those tokens count against your subscription limits. So tools are turned
 *    off (--tools ""), the default system prompt is replaced with a one-liner,
 *    and the process runs in an empty scratch directory (no project files to
 *    discover) with no session saved to disk.
 */

export type Tier = "screen" | "score" | "tailor";

/** The subscription's usage limit (or the API's rate limit) was hit: stop the run, don't retry every job. */
export class AiLimitError extends Error {}
/** Claude isn't installed / isn't signed in / is billing the wrong account: stop and tell the user how to fix it. */
export class AiSetupError extends Error {}

export interface AiResult {
  text: string;
  /** Claude Code's own estimate of what the call would cost at API rates (not necessarily what you're billed). */
  costUsd?: number;
}

const DEFAULT_MODELS: Record<Tier, string> = {
  screen: "claude-haiku-5-5", // cheap yes/no relevance screen
  score: "claude-sonnet-5", // nuanced fit scoring
  tailor: "claude-sonnet-5", // cover letters / resume bullets a human reads
};

export function modelFor(tier: Tier): string {
  return process.env[`AI_MODEL_${tier.toUpperCase()}`]?.trim() || DEFAULT_MODELS[tier];
}

export function backend(): "claude-cli" | "api" {
  return process.env.AI_BACKEND?.trim().toLowerCase() === "api" ? "api" : "claude-cli";
}

/**
 * Variables that make Claude Code bill an API account or a gateway instead of
 * your subscription login. CLAUDE_CODE_OAUTH_TOKEN is deliberately NOT here: it's
 * a subscription token (from `claude setup-token`), so it's what you'd want.
 */
export const STRIPPED_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

export function claudeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const name of STRIPPED_ENV) delete env[name];
  return env;
}

const SYSTEM_PROMPT =
  "You are a precise assistant used as a function inside a job-search tool. Follow the instructions in the user message exactly, and output only what they ask for.";

export function claudeArgs(model: string): string[] {
  return [
    "-p", // headless: read the prompt from stdin, print the result, exit
    "--output-format", "json", // one JSON envelope: { result, total_cost_usd, is_error, ... }
    "--safe-mode", // no CLAUDE.md/skills/plugins/hooks/MCP, but auth works normally (NOT --bare)
    "--tools", "", // no tools: no tool definitions in every request
    "--system-prompt", SYSTEM_PROMPT, // replaces Claude Code's long default system prompt
    "--model", model,
    "--no-session-persistence", // don't write a session file per call
  ];
}

function scratchDir(): string {
  const dir = path.join(os.tmpdir(), "job-copilot-claude");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Messages that mean "stop, you're out of allowance" vs "stop, this isn't set up right".
const LIMIT_PATTERN =
  /(usage|rate|session|weekly|5-hour|five-hour)[^.\n]{0,25}limit|limit (reached|exceeded|hit)|resets? (at|in|on)|too many requests|\b429\b|overloaded|quota/i;
const SETUP_PATTERN =
  /not logged in|please run[^.\n]*login|\/login|invalid (api key|credentials|bearer)|authentication|unauthori[sz]ed|\b401\b|credit balance|oauth token/i;

export function classifyError(message: string): Error {
  if (SETUP_PATTERN.test(message)) {
    return new AiSetupError(
      `${message}\n  -> Run "claude auth login" and sign in with your subscription. If the message mentions an API ` +
        `key or credit balance, something is billing an API account instead of your subscription.`
    );
  }
  if (LIMIT_PATTERN.test(message)) {
    return new AiLimitError(`${message}\n  -> Your subscription allowance is used up for now. Unscored jobs stay queued for the next run.`);
  }
  return new Error(message);
}

/** Turn what `claude -p --output-format json` printed into a result, or the right kind of error. */
export function parseClaudeOutput(stdout: string, stderr: string, exitCode: number | null): AiResult {
  let envelope: any = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      envelope = JSON.parse(trimmed);
    } catch {
      const lastLine = trimmed.split("\n").filter(Boolean).pop();
      try {
        envelope = lastLine ? JSON.parse(lastLine) : null;
      } catch {
        envelope = null;
      }
    }
  }

  const resultText = typeof envelope?.result === "string" ? envelope.result : "";
  const flaggedError =
    envelope?.is_error === true ||
    (typeof envelope?.subtype === "string" && envelope.subtype.startsWith("error")) ||
    (exitCode !== null && exitCode !== 0);

  if (!envelope || flaggedError) {
    const message = (resultText || stderr || stdout || `claude exited with code ${exitCode}`).trim().slice(0, 600);
    throw classifyError(message);
  }

  return { text: resultText, costUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : undefined };
}

function runClaude(prompt: string, model: string): Promise<AiResult> {
  const bin = process.env.CLAUDE_BIN?.trim() || "claude";
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 180_000;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, claudeArgs(model), {
      cwd: scratchDir(),
      env: claudeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude did not answer within ${Math.round(timeoutMs / 1000)}s (killed). Raise AI_TIMEOUT_MS if your machine is slow.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", () => {}); // the child may exit before reading everything; the exit handler reports why

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new AiSetupError(
              `Could not find the "${bin}" command. Install Claude Code (https://code.claude.com/docs/en/setup), ` +
                `run "claude auth login", or set CLAUDE_BIN to its full path.`
            )
          : err
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        resolve(parseClaudeOutput(stdout, stderr, code));
      } catch (err) {
        reject(err);
      }
    });

    child.stdin.end(prompt);
  });
}

async function runApi(prompt: string, model: string, maxTokens: number): Promise<AiResult> {
  // Imported lazily so the CLI backend never needs ANTHROPIC_API_KEY (the SDK
  // throws at construction time when the key is missing).
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `response was cut off (hit the ${maxTokens}-token limit) before completing - the model's reasoning ` +
        `likely ran too long. This is a truncation issue, not a JSON formatting bug.`
    );
  }
  const block = response.content.find((b) => b.type === "text");
  return { text: block && "text" in block ? block.text : "" };
}

export async function runAi(req: { tier: Tier; prompt: string; maxTokens?: number }): Promise<AiResult> {
  const model = modelFor(req.tier);
  if (backend() === "api") return runApi(req.prompt, model, req.maxTokens ?? 2048);
  return runClaude(req.prompt, model);
}

/** `claude auth status` with the billing-redirect variables removed, so it reports the login that headless calls will actually use. */
export function claudeAuthStatus(): Promise<Record<string, unknown>> {
  const bin = process.env.CLAUDE_BIN?.trim() || "claude";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["auth", "status"], { cwd: scratchDir(), env: claudeEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "ENOENT" ? new AiSetupError(`Could not find the "${bin}" command. Install Claude Code or set CLAUDE_BIN.`) : err)
    );
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error((stderr || stdout || "claude auth status printed nothing").trim().slice(0, 400)));
      }
    });
  });
}
