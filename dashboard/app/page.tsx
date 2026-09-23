"use client";

import { useEffect, useState } from "react";

interface Job {
  id: number;
  company: string;
  title: string;
  location: string;
  apply_url: string;
  fit_score: number | null;
  recommendation: string | null;
  fit_reasoning: string | null;
  salary_range: string | null;
  work_arrangement: string | null;
  summary: string | null;
  tech_stack: string | null;      // JSON-stringified array
  requirements: string | null;    // JSON-stringified array
  tailored_resume_path: string | null;
  cover_letter_path: string | null;
  status: string;
  fetched_at: string;
}

const STATUS_OPTIONS = ["new", "applied", "interview", "rejected", "skipped"];
const LOW_SCORE_CUTOFF = 5;
const LAST_VIEWED_KEY = "job-copilot:last-viewed-at";

function scoreColor(score: number | null) {
  if (score === null) return "#8b949e";
  if (score >= 75) return "#3fb950";
  if (score >= 50) return "#d29922";
  return "#f85149";
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function JobCard({ job, onUpdateStatus }: { job: Job; onUpdateStatus: (id: number, status: string) => void }) {
  const techStack = parseJsonArray(job.tech_stack);
  const requirements = parseJsonArray(job.requirements);

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: "#e6edf3" }}>{job.title}</div>
          <div style={{ color: "#8b949e" }}>{job.company} &middot; {job.location}</div>
        </div>
        <div
          style={{
            fontWeight: 700,
            fontSize: 20,
            color: scoreColor(job.fit_score),
            minWidth: 48,
            textAlign: "right",
          }}
        >
          {job.fit_score ?? "—"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 13, color: "#9198a1", flexWrap: "wrap" }}>
        <span><strong style={{ color: "#c9d1d9" }}>Salary:</strong> {job.salary_range || "Not listed"}</span>
        <span><strong style={{ color: "#c9d1d9" }}>Arrangement:</strong> {job.work_arrangement || "Unclear"}</span>
      </div>

      {job.summary && (
        <p style={{ fontSize: 14, color: "#c9d1d9", marginTop: 10, marginBottom: 8 }}>{job.summary}</p>
      )}

      {techStack.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {techStack.map((tech) => (
            <span
              key={tech}
              style={{
                background: "#1f2937",
                color: "#9ecbff",
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid #30363d",
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {requirements.length > 0 && (
        <ul style={{ fontSize: 13, color: "#9198a1", margin: "8px 0", paddingLeft: 20 }}>
          {requirements.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {job.fit_reasoning && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 13, color: "#8b949e", cursor: "pointer" }}>Why this score?</summary>
          <p style={{ fontSize: 13, color: "#9198a1", marginTop: 6 }}>{job.fit_reasoning}</p>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "#238636",
            color: "white",
            padding: "6px 14px",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Open apply page ↗
        </a>

        {job.tailored_resume_path && (
          <span style={{ fontSize: 13, color: "#8b949e" }}>
            Tailored materials: {job.tailored_resume_path.split("/").pop()}
          </span>
        )}

        <select
          value={job.status}
          onChange={(e) => onUpdateStatus(job.id, e.target.value)}
          style={{
            marginLeft: "auto",
            padding: 4,
            borderRadius: 4,
            background: "#21262d",
            color: "#e6edf3",
            border: "1px solid #30363d",
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLowScores, setShowLowScores] = useState(false);
  const [lastViewedAt, setLastViewedAt] = useState<string | null>(null);
  const [newSectionDismissed, setNewSectionDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/jobs").then((r) => r.json()).then((data) => {
      setJobs(data);
      setLoading(false);
    });

    // Read the last-viewed timestamp BEFORE overwriting it, so this load
    // still shows what's new since your last visit. First-ever visit has no
    // stored value - treat everything as "already seen" rather than dumping
    // your whole backlog into the "new" section.
    try {
      const stored = localStorage.getItem(LAST_VIEWED_KEY);
      setLastViewedAt(stored ?? new Date().toISOString());
      localStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString());
    } catch {
      // localStorage unavailable (private browsing etc.) - just skip the
      // "new since last visit" feature gracefully, nothing else breaks
      setLastViewedAt(new Date().toISOString());
    }
  }, []);

  async function updateStatus(id: number, status: string) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  if (loading) return <div style={{ padding: 32, color: "#e6edf3" }}>Loading...</div>;

  const newJobs = lastViewedAt && !newSectionDismissed
    ? jobs.filter((j) => j.fetched_at > lastViewedAt)
    : [];

  const lowScoreCount = jobs.filter((j) => j.fit_score !== null && j.fit_score <= LOW_SCORE_CUTOFF).length;
  const visibleJobs = (showLowScores ? jobs : jobs.filter((j) => j.fit_score === null || j.fit_score > LOW_SCORE_CUTOFF))
    .filter((j) => !newJobs.includes(j)); // don't show new jobs twice - they get their own section above

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ color: "#e6edf3" }}>Job Copilot</h1>
      <p style={{ color: "#8b949e" }}>
        {jobs.length} jobs tracked. Sorted by fit score. Nothing here auto-applies -
        click through and submit yourself.
        {lowScoreCount > 0 && (
          <>
            {" "}
            <button
              onClick={() => setShowLowScores((v) => !v)}
              style={{ background: "none", border: "none", color: "#58a6ff", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}
            >
              {showLowScores ? `Hide ${lowScoreCount} low-scoring jobs` : `Show ${lowScoreCount} hidden low-scoring jobs (≤${LOW_SCORE_CUTOFF})`}
            </button>
          </>
        )}
      </p>

      {newJobs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ color: "#e6edf3", fontSize: 18, margin: 0 }}>
              🆕 New since your last visit ({newJobs.length})
            </h2>
            <button
              onClick={() => setNewSectionDismissed(true)}
              style={{ background: "none", border: "none", color: "#58a6ff", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
            >
              Dismiss, fold into main list
            </button>
          </div>
          {newJobs
            .sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1))
            .map((job) => <JobCard key={job.id} job={job} onUpdateStatus={updateStatus} />)}
          <div style={{ color: "#8b949e", fontSize: 13, margin: "16px 0", borderTop: "1px solid #30363d", paddingTop: 16 }}>
            Rest of your tracked jobs below
          </div>
        </div>
      )}

      {visibleJobs.map((job) => <JobCard key={job.id} job={job} onUpdateStatus={updateStatus} />)}
    </main>
  );
}