# Job Copilot

A personal job search pipeline: fetch open roles, filter them, score fit
against your real background with Claude, draft tailored resume bullets and
cover letters, and review everything in a local dashboard with a direct
one-click link to the actual apply page.

**This does not auto-apply for you.** It never fills out or submits
application forms. It gets you to the front door — the "Apply" button on
the company's own site — with the right materials in hand, then you take it
from there. That's intentional: most ATS platforms actively block
automated form submission and it can hurt more than help with recruiters.

## How it works

1. **Fetch** (`npm run fetch`) — pulls jobs from company ATS APIs
   (Greenhouse, Lever, Ashby — all public, unauthenticated endpoints meant
   for embedding careers pages) plus Remotive as an aggregator. Filters by
   `config/filters.yaml` and dedupes into `data/jobs.sqlite3`.
2. **Score** (`npm run score`) — sends each new job + your `config/profile.yaml`
   to Claude, which returns a 0–100 fit score, an apply/consider/skip
   recommendation, and specific reasoning (gaps, strengths, risk factors).
3. **Tailor** (`npm run tailor`) — for everything scored "apply", drafts
   resume bullets and a cover letter grounded strictly in your real profile
   (no fabricated experience), saved to `data/materials/` for you to review
   and edit before using.
4. **Dashboard** (`npm run dashboard`) — a local Next.js app at
   `localhost:3000` showing every job sorted by fit score, with the direct
   apply link, your tailored materials, and a status dropdown
   (new/applied/interview/rejected/skipped) so you can track your pipeline.

## Setup

```bash
npm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY

cp config/profile.example.yaml config/profile.yaml
# edit config/profile.yaml with YOUR real background - be specific and quantify

cd dashboard && npm install && cd ..
```

### Before your first run, edit:

- **`config/companies.yaml`** — replace the example entry with companies
  you actually want to target. Find each company's ATS by looking at their
  careers page URL (`boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`,
  `jobs.ashbyhq.com/<slug>`).
- **`config/filters.yaml`** — location patterns, title include/exclude
  keywords, and stack dealbreakers/core. Ships with generic examples;
  tune to your actual search.

## Usage

```bash
npm run fetch       # step 1, free
npm run score       # step 2, costs a small amount per job (Claude API)
npm run tailor      # step 3, costs a small amount per job
npm run dashboard   # step 4, opens localhost:3000
```

Re-running `fetch` only ever inserts genuinely new postings (deduped by
company + normalized title). Re-running `score`/`tailor` only processes
jobs that don't have results yet, so you never re-pay for the same job.

## Extending it

- **More ATS platforms**: follow `src/fetchers/greenhouse.ts` as a template —
  each fetcher just needs to return an array of `Job` objects with a real
  `apply_url`.
- **Adzuna**: add an `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` to `.env` and write a
  fetcher hitting `api.adzuna.com/v1/api/jobs/<country>/search/1`.
- **Scheduling**: once you trust a run, add a cron entry, e.g.
  `0 7 * * * cd /path/to/job-copilot && npm run fetch && npm run score`.

## Notes on scope

- LinkedIn/Indeed are deliberately not included — scraping them violates
  their ToS and both actively detect and block it, which risks your
  account. Company ATS APIs and aggregators like Remotive/Adzuna are
  public, sanctioned ways to get the same postings.
- Nothing here submits an application on your behalf. The dashboard's
  "Open apply page" link takes you to the real posting; you click Apply
  yourself.
