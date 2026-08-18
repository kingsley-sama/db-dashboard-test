-- ============================================================================
-- Teams context gathering
-- ============================================================================
--
-- Completes the four tables that were created directly in Supabase during the
-- August experiment (messages, unclassified_messages, teams_thread_index,
-- sync_state) so that a Teams channel becomes a second context source next to
-- the PM mailboxes, feeding the same AI brief.
--
-- Attribution rule this file encodes:
--
--   1. tag        - the message text contains a project_id. Explicit wins over
--                   everything else, including the thread it sits in.
--   2. inherited  - no tag, but the message is a reply in a thread whose ROOT
--                   was attributed. This is the "please use threads" path.
--   3. llm        - neither of the above; a model guesses, and the guess is
--                   kept with its confidence so a brief can filter it out.
--   4. none       - nothing resolved it -> unclassified_messages, where it can
--                   still be promoted later once the thread is attributed.
--
-- The decision lives in ingest_teams_message() rather than in n8n, for the same
-- reason claim_intake_order() does: it makes the ingest idempotent, keeps the
-- rule in one place, and lets a re-poll replay safely.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. teams_thread_index: one row per (project, thread root) PAIR
-- ---------------------------------------------------------------------------
-- The composite primary key (project_id, root_id) is DELIBERATE and must stay.
-- "Project Brief - Teams Thread Indexer" extracts every /\d{5}-\d{2}/ match in a
-- root message and inserts one row per id, so a single thread that mentions two
-- projects is indexed under both. Collapsing the key to root_id would make the
-- second insert a PK violation and break that workflow on its next 15-minute run.
--
-- What is genuinely missing is an index for the OTHER direction. "Purge Root
-- Rows" deletes by root_id every cycle, and with project_id as the leading
-- column of the only index that delete can never use it.
CREATE INDEX IF NOT EXISTS teams_thread_index_root_idx
  ON public.teams_thread_index (root_id);

-- Reverse lookup: "every thread for this project", which is what the brief runs.
CREATE INDEX IF NOT EXISTS teams_thread_index_project_idx
  ON public.teams_thread_index (project_id, created_at DESC);

-- NOTE: no FK to projects here, on purpose. Extract Project IDs regex-matches
-- any 5-2 digit pattern in free text, so a message mentioning "12345-99" would
-- insert a row for a project that does not exist. Under an FK that insert raises
-- and the whole indexer run fails. Validate in the workflow first (filter ids
-- against projects before insert); the FK can be added once that is in place.

-- created_at is NOT NULL with no default, so any insert that omits it fails.
-- n8n has the Graph createdDateTime, but the manual/backfill paths don't.
ALTER TABLE public.teams_thread_index
  ALTER COLUMN created_at SET DEFAULT now();

-- Which channel the thread lives in. Everything so far assumes the single
-- "PM channel"; recording it now means a second channel later is a data change
-- rather than a migration. Parsed out of the web_url the index already stores.
ALTER TABLE public.teams_thread_index
  ADD COLUMN IF NOT EXISTS team_id    text,
  ADD COLUMN IF NOT EXISTS channel_id text;

-- How the root itself was attributed. A root can only be 'tag' or 'llm' — it has
-- no parent to inherit from — but keeping the same vocabulary as messages means
-- one filter works across both tables.
ALTER TABLE public.teams_thread_index
  ADD COLUMN IF NOT EXISTS project_id_source text;
ALTER TABLE public.teams_thread_index
  DROP CONSTRAINT IF EXISTS teams_thread_index_project_id_source_check;
ALTER TABLE public.teams_thread_index
  ADD CONSTRAINT teams_thread_index_project_id_source_check
  CHECK (project_id_source IS NULL OR project_id_source IN ('tag', 'llm', 'manual'));

-- ---------------------------------------------------------------------------
-- 2. messages: the per-message store
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS team_id    text,
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS web_url    text,
  -- Graph reports edits and soft deletes on re-poll; without these an edited
  -- message silently keeps its original body in the brief.
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Same FK reasoning as the thread index: an attributed message must point at a
-- project that exists, or it belongs in unclassified_messages instead.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_project_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON UPDATE CASCADE;

-- NOTE: no FK from messages.thread_id to teams_thread_index.root_id — root_id is
-- not unique there (a thread can be indexed under several projects), so it
-- cannot be an FK target. ingest_teams_message() enforces the relationship.

-- An attributed message must say how it was attributed, and an unattributed one
-- must not claim a source. The existing CHECK allowed both halves to disagree.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_project_id_source_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_project_id_source_check
  CHECK (
    (project_id IS NULL     AND project_id_source IS NULL) OR
    (project_id IS NOT NULL AND project_id_source IN ('tag', 'inherited', 'llm', 'manual'))
  );

-- The brief's actual query: every message for one project, oldest first. The
-- two existing single-column indexes each answer half of it.
CREATE INDEX IF NOT EXISTS messages_project_sent_idx
  ON public.messages (project_id, sent_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. unclassified_messages: the dead letter, with a way back
-- ---------------------------------------------------------------------------
-- As it stands a parked message can never be recovered: it stores no thread_id,
-- so when the thread it belongs to is later attributed there is no way to find
-- the replies that arrived before the attribution. That is the common case for
-- "PM forgot to tag, then said which project in the next message".
ALTER TABLE public.unclassified_messages
  ADD COLUMN IF NOT EXISTS thread_id    text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS team_id      text,
  ADD COLUMN IF NOT EXISTS channel_id   text,
  ADD COLUMN IF NOT EXISTS web_url      text,
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz;

CREATE INDEX IF NOT EXISTS unclassified_thread_idx
  ON public.unclassified_messages (thread_id)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Poller cursor
-- ---------------------------------------------------------------------------
-- sync_state is a single row pinned by CHECK (id = 1) holding one timestamp. It
-- cannot express a per-channel cursor, and a timestamp cursor loses edits that
-- land with an older sentDateTime than the last poll. Graph delta queries hand
-- back an opaque deltaLink for exactly this reason.
--
-- Nothing reads sync_state (0 code references, cursor frozen since 2026-06-24),
-- so it is replaced rather than migrated. Dropped at the end of this file.
CREATE TABLE IF NOT EXISTS public.context_sync_cursors (
  source_key     text PRIMARY KEY,          -- e.g. 'teams:<team_id>/<channel_id>'
  delta_link     text,                      -- Graph @odata.deltaLink, when available
  last_polled_at timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.context_sync_cursors;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.context_sync_cursors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.context_sync_cursors ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Ingest: one call per message, decides its own attribution
-- ---------------------------------------------------------------------------
-- n8n hands over a raw Graph message plus whatever project_id it managed to
-- parse out of the body. Everything else is decided here.
--
-- Idempotent by message_id: a re-poll updates the stored copy (bodies get
-- edited) instead of erroring or duplicating.
DROP FUNCTION IF EXISTS public.ingest_teams_message(
  text, text, text, text, text, timestamptz, text, text, double precision, text, text, text);
CREATE OR REPLACE FUNCTION public.ingest_teams_message(
  p_message_id   text,
  p_thread_id    text,           -- root message id; equals p_message_id for a root
  p_sender_name  text,
  p_sender_email text,
  p_content      text,
  p_sent_at      timestamptz,
  p_tagged_project_id text DEFAULT NULL,   -- parsed from the message text
  p_llm_project_id    text DEFAULT NULL,   -- model's guess, if n8n ran one
  p_llm_confidence    double precision DEFAULT NULL,
  p_team_id      text DEFAULT NULL,
  p_channel_id   text DEFAULT NULL,
  p_web_url      text DEFAULT NULL
)
-- OUT names are deliberately prefixed. plpgsql substitutes variables into SQL
-- statements INCLUDING the ON CONFLICT target, so an OUT param called
-- project_id makes "ON CONFLICT (project_id, root_id)" ambiguous and the
-- function fails at runtime on its first call.
RETURNS TABLE (resolved_project_id text, attribution_source text, parked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_project_id text;
  v_source     text;
  v_is_root    boolean := (p_thread_id IS NULL OR p_thread_id = p_message_id);
  v_root_id    text    := coalesce(p_thread_id, p_message_id);
BEGIN
  IF p_message_id IS NULL OR btrim(p_message_id) = '' THEN
    RAISE EXCEPTION 'ingest_teams_message: message_id is required';
  END IF;

  -- Serialise concurrent ingests of the same thread so two replies arriving at
  -- once can't both decide they are the one creating the index row.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_root_id, 0));

  -- (1) Explicit tag wins, but only if it names a real project. A typo'd id is
  --     treated as no tag at all rather than silently attaching the message to
  --     nothing — it falls through to inheritance, then to the dead letter.
  IF p_tagged_project_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.projects WHERE projects.project_id = p_tagged_project_id)
  THEN
    v_project_id := p_tagged_project_id;
    v_source     := 'tag';

  -- (2) Inheritance: a reply picks up whatever its root was attributed to.
  ELSIF NOT v_is_root THEN
    -- OPEN QUESTION: a root that mentions two project ids is indexed under BOTH
    -- (see section 1). messages.project_id holds only one, so a reply in such a
    -- thread cannot inherit both. This takes the earliest-created match to stay
    -- deterministic; the alternative is to widen messages to (message_id,
    -- project_id) and mirror the thread index. Decide before going live.
    SELECT t.project_id INTO v_project_id
    FROM public.teams_thread_index t
    WHERE t.root_id = v_root_id
    ORDER BY t.project_id
    LIMIT 1;

    IF v_project_id IS NOT NULL THEN
      v_source := 'inherited';
    END IF;
  END IF;

  -- (3) Model guess, only when nothing above resolved it.
  IF v_project_id IS NULL
     AND p_llm_project_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.projects WHERE projects.project_id = p_llm_project_id)
  THEN
    v_project_id := p_llm_project_id;
    v_source     := 'llm';
  END IF;

  -- (4) Nothing resolved it: park it, keeping the thread_id so it can be
  --     promoted if the thread is attributed later.
  IF v_project_id IS NULL THEN
    INSERT INTO public.unclassified_messages AS u (
      message_id, thread_id, content, sender_name, sender_email,
      sent_at, team_id, channel_id, web_url, note
    )
    VALUES (
      p_message_id, v_root_id, p_content, p_sender_name, p_sender_email,
      p_sent_at, p_team_id, p_channel_id, p_web_url,
      CASE WHEN v_is_root
           THEN 'Root message with no project id in its text.'
           ELSE 'Reply in a thread whose root has not been attributed.'
      END
    )
    ON CONFLICT (message_id) DO UPDATE
      SET content = excluded.content,
          web_url = coalesce(excluded.web_url, u.web_url);

    RETURN QUERY SELECT NULL::text, NULL::text, true;
    RETURN;
  END IF;

  -- A root that resolved to a project becomes the thread's attribution, which is
  -- what every later reply inherits from. Never downgrade an existing entry: a
  -- root already attributed by tag must not be overwritten by an llm guess.
  IF v_is_root THEN
    INSERT INTO public.teams_thread_index AS t (
      project_id, root_id, created_at, author, preview,
      web_url, team_id, channel_id, project_id_source
    )
    VALUES (
      v_project_id, v_root_id, coalesce(p_sent_at, now()), p_sender_name,
      left(coalesce(p_content, ''), 280), p_web_url, p_team_id, p_channel_id, v_source
    )
    ON CONFLICT (project_id, root_id) DO UPDATE
      SET preview    = coalesce(excluded.preview, t.preview),
          web_url    = coalesce(excluded.web_url, t.web_url),
          project_id = CASE WHEN t.project_id_source = 'llm' AND excluded.project_id_source <> 'llm'
                            THEN excluded.project_id ELSE t.project_id END,
          project_id_source = CASE WHEN t.project_id_source = 'llm' AND excluded.project_id_source <> 'llm'
                            THEN excluded.project_id_source ELSE t.project_id_source END;
  END IF;

  INSERT INTO public.messages AS m (
    message_id, thread_id, project_id, project_id_source,
    sender_name, sender_email, content, sent_at,
    llm_confidence, team_id, channel_id, web_url
  )
  VALUES (
    p_message_id, v_root_id, v_project_id, v_source,
    p_sender_name, p_sender_email, p_content, p_sent_at,
    CASE WHEN v_source = 'llm' THEN p_llm_confidence END,
    p_team_id, p_channel_id, p_web_url
  )
  ON CONFLICT (message_id) DO UPDATE
    SET content    = excluded.content,
        edited_at  = CASE WHEN m.content IS DISTINCT FROM excluded.content
                          THEN now() ELSE m.edited_at END,
        project_id = excluded.project_id,
        project_id_source = excluded.project_id_source,
        web_url    = coalesce(excluded.web_url, m.web_url);

  -- This message may have attributed a thread whose earlier replies are parked.
  IF v_is_root THEN
    PERFORM public.resolve_unclassified_for_thread(v_root_id);
  END IF;

  RETURN QUERY SELECT v_project_id, v_source, false;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Promote parked messages once their thread is attributed
-- ---------------------------------------------------------------------------
-- Called automatically when a root is attributed, and available on its own for
-- the manual "this thread is project X" action in the dashboard.
CREATE OR REPLACE FUNCTION public.resolve_unclassified_for_thread(p_root_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_project_id text;
  v_count      integer;
BEGIN
  SELECT t.project_id INTO v_project_id
  FROM public.teams_thread_index t
  WHERE t.root_id = p_root_id
  ORDER BY t.project_id
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH promoted AS (
    SELECT u.* FROM public.unclassified_messages u
    WHERE u.thread_id = p_root_id AND u.resolved_at IS NULL
  ), moved AS (
    INSERT INTO public.messages AS m (
      message_id, thread_id, project_id, project_id_source,
      sender_name, sender_email, content, sent_at,
      team_id, channel_id, web_url
    )
    SELECT p.message_id, p_root_id, v_project_id, 'inherited',
           p.sender_name, p.sender_email, p.content, p.sent_at,
           p.team_id, p.channel_id, p.web_url
    FROM promoted p
    ON CONFLICT (message_id) DO NOTHING
    RETURNING m.message_id
  )
  UPDATE public.unclassified_messages u
     SET resolved_at = now(),
         note = coalesce(u.note, '') || format(' Promoted to %s on thread attribution.', v_project_id)
   WHERE u.thread_id = p_root_id AND u.resolved_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. What the brief reads
-- ---------------------------------------------------------------------------
-- The Teams half of a project brief: every attributed message in order, with
-- low-confidence guesses excluded by default so an llm mis-attribution can't
-- quietly poison a brief.
CREATE OR REPLACE FUNCTION public.project_teams_context(
  p_project_id     text,
  p_min_confidence double precision DEFAULT 0.7
)
RETURNS TABLE (
  message_id text, thread_id text, sender_name text, sender_email text,
  content text, sent_at timestamptz, project_id_source text,
  llm_confidence double precision, web_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT m.message_id, m.thread_id, m.sender_name, m.sender_email,
         m.content, m.sent_at, m.project_id_source, m.llm_confidence, m.web_url
  FROM public.messages m
  WHERE m.project_id = p_project_id
    AND m.deleted_at IS NULL
    AND (m.project_id_source <> 'llm'
         OR coalesce(m.llm_confidence, 0) >= p_min_confidence)
  ORDER BY m.sent_at;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Brief entries record which source produced them
-- ---------------------------------------------------------------------------
-- brief_conversations stays one row per (user, project); the discriminator goes
-- on the entry, because the same project thread can hold an email brief from
-- Monday and a Teams brief from Tuesday. append_brief_entry() takes the entry as
-- jsonb, so it carries `source` with no signature change and no new function.
--
-- Every entry written before this migration came from the mailbox workflow.
UPDATE public.brief_conversations c
   SET entries = (
         SELECT jsonb_agg(
                  CASE WHEN e.val ? 'source' THEN e.val
                       ELSE e.val || '{"source":"email"}'::jsonb END
                  ORDER BY e.ord)
         FROM jsonb_array_elements(c.entries) WITH ORDINALITY AS e(val, ord)
       )
 WHERE NOT (c.entries @> '[{"source":"email"}]'::jsonb)
   AND jsonb_array_length(c.entries) > 0;

-- The existing GIN index on entries (jsonb_path_ops) already answers
-- entries @> '[{"source":"teams"}]', so no new index is needed.

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
-- Mirrors projects / project_intake_runs: RLS on, service_role only, so the
-- tables are reachable from supabaseAdmin and from n8n but never with the anon
-- key that ships to the browser. Without these PostgREST answers 404.
ALTER TABLE public.teams_thread_index ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unclassified_messages  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams_thread_index     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.context_sync_cursors   TO service_role;

GRANT EXECUTE ON FUNCTION public.ingest_teams_message(text, text, text, text, text, timestamptz, text, text, double precision, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_unclassified_for_thread(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_teams_context(text, double precision) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ingest_teams_message(text, text, text, text, text, timestamptz, text, text, double precision, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_unclassified_for_thread(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.project_teams_context(text, double precision) FROM PUBLIC, anon;

REVOKE ALL ON public.messages              FROM PUBLIC, anon;
REVOKE ALL ON public.unclassified_messages FROM PUBLIC, anon;
REVOKE ALL ON public.teams_thread_index    FROM PUBLIC, anon;
REVOKE ALL ON public.context_sync_cursors  FROM PUBLIC, anon;

COMMIT;

-- ---------------------------------------------------------------------------
-- 10. Retire the old cursor
-- ---------------------------------------------------------------------------
-- Outside the transaction so a failed drop cannot roll back the migration.
-- Uncomment once context_sync_cursors is confirmed in use.
-- DROP TABLE IF EXISTS public.sync_state;

-- PostgREST caches the schema; without this the new table and RPCs answer 404
-- until the next restart.
NOTIFY pgrst, 'reload schema';
