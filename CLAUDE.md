# Job Copilot

Personal job-search automation, run locally from the terminal (WSL Ubuntu). It fetches postings, filters them, scores fit with Claude, drafts tailored materials, and shows everything in a local dashboard. It never applies to jobs automatically, and that should stay true.

The owner is not very experienced with dev tooling. Explain things in plain language, say what a command does before running it, and prefer small, reversible changes.

## How it works

1. `npm run fetch` pulls postings from direct ATS APIs (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters) and aggregators (Remotive, RemoteOK, Arbeitnow, Jooble, Adzuna). It filters by title, location and stack, dedupes, and stores results in SQLite. It prints a per-source table.
2. `npm run score` runs a cheap Haiku relevance screen first, then full Sonnet scoring of the survivors. Screened-out jobs are stored as score 0 / skip with a note.
3. `npm run tailor` drafts resume and cover letter text for jobs recommended as "apply".
4. `npm run dashboard` starts the Next.js dashboard to review everything.

Other commands: `discover` (find ATS boards for candidate companies), `add-job`, `fix-job`, `reset-scores`, `export-jobs`, `set-status`, `ai-check`.

## Layout

- `config/`: `companies.yaml`, `filters.yaml`, `profile.yaml`, `discovery-seeds.yaml`
- `src/db/`: `db.ts`, `schema.sql` (better-sqlite3)
- `src/fetchers/`: one file per source
- `src/cli/`: the commands above
- `src/ai.ts`: the single AI layer. Everything that calls a model goes through `runAi({ tier, prompt, maxTokens })`.
- `dashboard/`: Next.js app with its own `package.json` (better-sqlite3 is pinned in both places)

## AI backend

- Default: headless Claude Code (`claude -p`) on the user's subscription login. `AI_BACKEND=api` switches to the API, which needs `ANTHROPIC_API_KEY` and is billed per token.
- Headless calls use `--safe-mode`, not `--bare`. `--bare` cannot use subscription auth.
- `ai.ts` removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and related variables from the child process so a stray key can't redirect billing.
- Calls run in a scratch directory under the OS temp dir, so this file does not affect scoring.
- Models: screen = `claude-haiku-4-5-20251001`, score and tailor = `claude-sonnet-5`. Override with `AI_MODEL_SCREEN`, `AI_MODEL_SCORE`, `AI_MODEL_TAILOR`.
- Useful env vars: `AI_CONCURRENCY` (default 2), `SCORE_LIMIT` (cap jobs per run).
- On a usage limit or setup error the run stops cleanly with exit code 2 and leaves jobs unscored for the next run. The real limit-message wording is not confirmed yet, so `classifyError` in `ai.ts` may need adjusting the first time a real limit appears.
- `npm run ai-check` shows auth status. `npm run ai-check -- --ping` makes one tiny test call.

## Rules for changes

- Node 24, ESM TypeScript run with `tsx`. After editing dependencies, check both the root and `dashboard/`.
- Never commit `.env`, the database, or personal documents. The repo is public.
- Scoring prompt calibration was tuned carefully. Avoid changing it without discussing it first.
- `claude-mod/` is an optional Claude Code panel plugin that is currently shelved. Leave it alone unless asked.
