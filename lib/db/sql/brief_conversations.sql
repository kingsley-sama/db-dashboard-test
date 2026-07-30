-- Conversation-style storage for the AI project brief feature.
--
-- Replaces the row-per-brief model of email_summary_jobs: there is now exactly
-- ONE row per (user, project), and every brief the user requests for that
-- project is appended to the `entries` jsonb array on that row. Opening a
-- project loads that single row and renders its entries chronologically, like a
-- ChatGPT/Claude thread.
--
-- Entry shape (one request + its response):
--   {
--     "job_id":         "uuid",                     -- n8n job id, unique per entry
--     "status":         "processing|success|error|stopped",
--     "error_code":     null,
--     "request":        { "project_id", "project_name", "text" },
--     "result_payload": { ...n8n callback payload... } | null,
--     "created_at":     "timestamptz",
--     "completed_at":   null
--   }
--
-- Run this file once against Supabase (SQL editor or psql). It is idempotent.

create table if not exists public.brief_conversations (
  user_email   text        not null,
  project_id   text        not null,
  project_name text,
  entries      jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_email, project_id)
);

-- Lets the callback find a thread by the job_id buried inside its entries array
-- (entries @> '[{"job_id": "..."}]').
create index if not exists brief_conversations_entries_idx
  on public.brief_conversations using gin (entries jsonb_path_ops);

create index if not exists brief_conversations_updated_idx
  on public.brief_conversations (user_email, updated_at desc);


-- ── Append a new entry ────────────────────────────────────────────────────────
-- Creates the thread on first use, otherwise appends. Doing the append inside
-- the database (rather than read-modify-write from the app) keeps two briefs
-- queued at the same time from clobbering each other.
create or replace function public.append_brief_entry(
  p_user_email   text,
  p_project_id   text,
  p_project_name text,
  p_entry        jsonb
)
returns public.brief_conversations
language sql
as $$
  insert into public.brief_conversations (user_email, project_id, project_name, entries)
  values (p_user_email, p_project_id, p_project_name, jsonb_build_array(p_entry))
  on conflict (user_email, project_id) do update
    set entries      = public.brief_conversations.entries || jsonb_build_array(p_entry),
        project_name = coalesce(excluded.project_name, public.brief_conversations.project_name),
        updated_at   = now()
  returning *;
$$;


-- ── Patch an existing entry in place ──────────────────────────────────────────
-- Merges p_patch into the entry with the given job_id. Used by the n8n callback
-- (no owner known) and by stop (owner enforced via p_user_email).
create or replace function public.update_brief_entry(
  p_job_id     text,
  p_patch      jsonb,
  p_user_email text default null
)
returns table (user_email text, project_id text, entry jsonb)
language plpgsql
as $$
declare
  v_user_email text;
  v_project_id text;
  v_entries    jsonb;
  v_idx        int;
begin
  select c.user_email, c.project_id, c.entries
    into v_user_email, v_project_id, v_entries
  from public.brief_conversations c
  where c.entries @> jsonb_build_array(jsonb_build_object('job_id', p_job_id))
    and (p_user_email is null or c.user_email = p_user_email)
  limit 1;

  if v_entries is null then
    return; -- no such job in any thread
  end if;

  select ord - 1 into v_idx
  from jsonb_array_elements(v_entries) with ordinality as e(val, ord)
  where e.val ->> 'job_id' = p_job_id
  limit 1;

  update public.brief_conversations c
     set entries    = jsonb_set(c.entries, array[v_idx::text], (c.entries -> v_idx) || p_patch),
         updated_at = now()
   where c.user_email = v_user_email
     and c.project_id = v_project_id
  returning c.user_email, c.project_id, c.entries -> v_idx
      into user_email, project_id, entry;

  return next;
end;
$$;


-- ── Delete a single entry ─────────────────────────────────────────────────────
-- Removes one request/response pair from the thread; if that empties the
-- thread, the row goes too so the sidebar doesn't show an empty conversation.
create or replace function public.delete_brief_entry(
  p_user_email text,
  p_job_id     text
)
returns boolean
language plpgsql
as $$
declare
  v_project_id text;
  v_remaining  jsonb;
begin
  select c.project_id,
         coalesce(
           (select jsonb_agg(e.val order by e.ord)
              from jsonb_array_elements(c.entries) with ordinality as e(val, ord)
             where e.val ->> 'job_id' is distinct from p_job_id),
           '[]'::jsonb
         )
    into v_project_id, v_remaining
  from public.brief_conversations c
  where c.user_email = p_user_email
    and c.entries @> jsonb_build_array(jsonb_build_object('job_id', p_job_id))
  limit 1;

  if v_project_id is null then
    return false;
  end if;

  if jsonb_array_length(v_remaining) = 0 then
    delete from public.brief_conversations
     where user_email = p_user_email and project_id = v_project_id;
  else
    update public.brief_conversations
       set entries = v_remaining, updated_at = now()
     where user_email = p_user_email and project_id = v_project_id;
  end if;

  return true;
end;
$$;


-- ── Backfill from the old row-per-brief table ─────────────────────────────────
-- Groups every existing job by (requested_by, project_id) into one thread so
-- history written before this change still renders. Safe to re-run: existing
-- threads are left untouched.
insert into public.brief_conversations (user_email, project_id, entries, created_at, updated_at)
select
  coalesce(j.requested_by, 'unknown'),
  j.project_id,
  jsonb_agg(
    jsonb_build_object(
      'job_id',         j.job_id::text,
      'status',         j.status,
      'error_code',     j.error_code,
      'request',        jsonb_build_object(
                          'project_id',   j.project_id,
                          -- payloads were stored either bare or wrapped in a
                          -- one-element array, depending on the n8n version
                          'project_name', case jsonb_typeof(j.result_payload)
                                            when 'array'  then j.result_payload -> 0 ->> 'project_name'
                                            when 'object' then j.result_payload ->> 'project_name'
                                          end,
                          'text',         null
                        ),
      'result_payload', j.result_payload,
      'created_at',     j.created_at,
      'completed_at',   j.completed_at
    )
    order by j.created_at
  ),
  min(j.created_at),
  max(coalesce(j.completed_at, j.created_at))
from public.email_summary_jobs j
group by coalesce(j.requested_by, 'unknown'), j.project_id
on conflict (user_email, project_id) do nothing;
