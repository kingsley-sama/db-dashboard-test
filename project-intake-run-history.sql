-- Project intake: per-run history
--
-- Plan item 12 asks for result_payload to hold an ARRAY of runs rather than a
-- single result, so re-running intake for a project does not overwrite what the
-- previous run produced.
--
-- `project_intake_runs` is NOT the right place for that. Its PRIMARY KEY
-- (project_id) is load-bearing: the trigger's exactly-once claim is
--     INSERT ... ON CONFLICT (project_id) DO NOTHING
-- which is what stops a No->Yes->No->Yes toggle from running intake twice and
-- duplicating ClickUp tasks and orders. Making it multi-row would silently
-- remove that protection.
--
-- So: `project_intake_runs` stays the claim ledger (one row per project, the
-- current state), and this file adds a history table with one row per attempt.
-- Additive only — no existing column, constraint, or signature changes
-- incompatibly.
--
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. History table: one row per intake attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_intake_run_history (
  run_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     text        NOT NULL
                             REFERENCES public.projects (project_id) ON UPDATE CASCADE,
  attempt        integer     NOT NULL DEFAULT 1,
  status         text        NOT NULL DEFAULT 'processing'
                             CHECK (status IN ('processing', 'completed', 'failed')),
  result_payload jsonb,
  last_error     text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS project_intake_run_history_project_idx
  ON public.project_intake_run_history (project_id, started_at DESC);

-- At most one open run per project. This is the history-table equivalent of the
-- claim ledger's PK, and it means open_intake_run() cannot double-open.
CREATE UNIQUE INDEX IF NOT EXISTS project_intake_run_history_one_open_idx
  ON public.project_intake_run_history (project_id)
  WHERE status = 'processing';

ALTER TABLE public.project_intake_run_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Backfill: existing ledger rows become their project's first history row
-- ---------------------------------------------------------------------------
INSERT INTO public.project_intake_run_history
  (project_id, attempt, status, last_error, started_at, completed_at)
SELECT r.project_id, GREATEST(r.attempts, 1), r.status, r.last_error,
       r.triggered_at, r.completed_at
FROM public.project_intake_runs r
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_intake_run_history h
  WHERE h.project_id = r.project_id
);

-- ---------------------------------------------------------------------------
-- 3. Open a run
-- ---------------------------------------------------------------------------
-- Called wherever a run begins. Returns the run_id of the open run, reusing an
-- already-open one so a replayed webhook does not open a second.
CREATE OR REPLACE FUNCTION public.open_intake_run(p_project_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_run_id  uuid;
  v_attempt integer;
BEGIN
  SELECT run_id INTO v_run_id
  FROM public.project_intake_run_history
  WHERE project_id = p_project_id AND status = 'processing'
  LIMIT 1;

  IF v_run_id IS NOT NULL THEN
    RETURN v_run_id;
  END IF;

  SELECT COALESCE(MAX(attempt), 0) + 1 INTO v_attempt
  FROM public.project_intake_run_history
  WHERE project_id = p_project_id;

  INSERT INTO public.project_intake_run_history (project_id, attempt, status)
  VALUES (p_project_id, v_attempt, 'processing')
  RETURNING run_id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Close the open run when intake finishes
-- ---------------------------------------------------------------------------
-- The optional payload argument defaults to NULL, so every existing caller of
-- complete_project_intake(text) / fail_project_intake(text, text) keeps working
-- unchanged.
-- Drop the 1-arg original first: adding a defaulted argument would create an
-- OVERLOAD, and complete_project_intake('x') would then fail as ambiguous.
DROP FUNCTION IF EXISTS public.complete_project_intake(text);

CREATE OR REPLACE FUNCTION public.complete_project_intake(
  p_project_id text,
  p_result     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.project_intake_runs
     SET status = 'completed', completed_at = now(), last_error = NULL
   WHERE project_id = p_project_id;

  UPDATE public.project_intake_run_history
     SET status = 'completed', completed_at = now(), last_error = NULL,
         result_payload = COALESCE(p_result, result_payload)
   WHERE project_id = p_project_id AND status = 'processing';
END;
$function$;

-- Same reasoning as above: drop the 2-arg original before widening it.
DROP FUNCTION IF EXISTS public.fail_project_intake(text, text);

CREATE OR REPLACE FUNCTION public.fail_project_intake(
  p_project_id text,
  p_error      text,
  p_result     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.project_intake_runs
     SET status = 'failed', last_error = p_error
   WHERE project_id = p_project_id;

  UPDATE public.project_intake_run_history
     SET status = 'failed', completed_at = now(), last_error = p_error,
         result_payload = COALESCE(p_result, result_payload)
   WHERE project_id = p_project_id AND status = 'processing';
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Open a history row wherever a run starts
-- ---------------------------------------------------------------------------
-- claim_intake_order() already self-heals the ledger row for a replayed
-- webhook; do the same for history so a run always has somewhere to report.
CREATE OR REPLACE FUNCTION public.open_intake_run_for_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.open_intake_run(NEW.project_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_intake_runs_open_history ON public.project_intake_runs;
CREATE TRIGGER trg_intake_runs_open_history
  AFTER INSERT ON public.project_intake_runs
  FOR EACH ROW EXECUTE FUNCTION public.open_intake_run_for_history();

-- ---------------------------------------------------------------------------
-- 6. Retry opens a fresh attempt
-- ---------------------------------------------------------------------------
-- request_project_intake_retry() resets the ledger row to 'processing'; the
-- history table should gain a NEW attempt rather than reopening the old one.
CREATE OR REPLACE FUNCTION public.reopen_intake_run_on_retry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    PERFORM public.open_intake_run(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_intake_runs_reopen_history ON public.project_intake_runs;
CREATE TRIGGER trg_intake_runs_reopen_history
  AFTER UPDATE OF status ON public.project_intake_runs
  FOR EACH ROW EXECUTE FUNCTION public.reopen_intake_run_on_retry();

-- ---------------------------------------------------------------------------
-- 7. Read model: the array shape plan item 12 describes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.project_intake_results AS
SELECT
  project_id,
  jsonb_agg(
    jsonb_build_object(
      'run_id',     run_id,
      'attempt',    attempt,
      'status',     status,
      'created_at', started_at,
      'result',     COALESCE(result_payload, '{}'::jsonb)
    )
    ORDER BY started_at
  ) AS result_payload
FROM public.project_intake_run_history
GROUP BY project_id;
