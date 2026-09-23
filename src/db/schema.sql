CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,            -- 'greenhouse' | 'lever' | 'ashby' | 'remotive' | 'adzuna'
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  description TEXT,
  apply_url TEXT NOT NULL,         -- the direct link you'd click to apply - this is the whole point
  posted_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- dedup key: same company + normalized title should not be re-inserted
  dedup_key TEXT NOT NULL UNIQUE,

  -- filled in by the scoring step
  fit_score INTEGER,               -- 0-100
  fit_reasoning TEXT,              -- gaps / strengths / risk factors from Claude
  recommendation TEXT,             -- 'apply' | 'consider' | 'skip'
  salary_range TEXT,               -- e.g. "$70,000-$90,000 CAD", or "Not listed"
  work_arrangement TEXT,           -- 'Remote' | 'Hybrid' | 'Onsite' | 'Unclear'
  summary TEXT,                    -- 1-2 sentence plain description of the role
  tech_stack TEXT,                 -- JSON array of strings, e.g. ["React","TypeScript"]
  requirements TEXT,               -- JSON array of short requirement strings

  -- filled in by the tailoring step
  tailored_resume_path TEXT,
  cover_letter_path TEXT,

  -- your own tracking, edited from the dashboard
  status TEXT NOT NULL DEFAULT 'new'  -- 'new' | 'applied' | 'interview' | 'rejected' | 'skipped'
);

CREATE INDEX IF NOT EXISTS idx_jobs_fit_score ON jobs (fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);