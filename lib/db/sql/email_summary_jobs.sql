-- Job tracking table for the AI project brief feature (n8n email-summary workflow).
--
-- DEPRECATED: the app no longer reads or writes this table. Briefs now live in
-- public.brief_conversations — one row per (user, project) with every request and
-- response appended to an `entries` array (see brief_conversations.sql, which also
-- backfills the rows below). Kept only as the source for that backfill.
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
