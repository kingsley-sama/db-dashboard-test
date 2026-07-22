-- Job tracking table for the AI project brief feature (n8n email-summary workflow).
-- NOTE: this table already exists in Supabase (created 2026-07 during the n8n
-- integration); this file documents its shape. result_payload was added via
-- ALTER TABLE — it stores the full callback payload so the UI can render results.

create table if not exists public.email_summary_jobs (
  job_id uuid primary key,
  project_id text not null,
  status text not null, -- processing / success / error / stopped
  error_code text,
  requested_by text,
  callback_url text not null,
  result_payload jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);
