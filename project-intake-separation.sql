-- ============================================================================
-- Project intake separation
-- ============================================================================
--
-- Splits two events that were previously one:
--
--   "Mark as Ready"            -> create the projects row            (no automation)
--   questionnaire_received Yes -> run the main project intake        (automation)
--
-- Before this migration the intake fired from `on_new_row` (AFTER INSERT ON
-- projects), so a project could not exist without immediately starting intake.
-- The questionnaire is handled by the PM *after* handover, so the trigger moves
-- to the No/NULL -> Yes transition on UPDATE.
--
-- `questionnaire_received` already exists as public.yes_no_values ('Yes'/'No');
-- it is reused as-is rather than replaced with a boolean.
--
-- Idempotency: project_intake_runs holds one row per project. The row is the
-- exactly-once claim (INSERT ... ON CONFLICT DO NOTHING) and the per-product
-- ledger of orders and ClickUp tasks created by the run, so a retry reuses what
-- already succeeded instead of creating duplicates.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Intake run ledger / status
-- ---------------------------------------------------------------------------
-- `orders` maps product_name -> what this run already created, e.g.
--   {"Interior rendering": {"order_pk": 812, "order_id": "18800-01-ir",
--                           "clickup_task_id": "86d0…", "clickup_url": "https://…"}}
-- Keying on product_name is scoped to the run, so it never collides with a
-- legitimate second order for the same product added manually later.
CREATE TABLE IF NOT EXISTS public.project_intake_runs (
  project_id   text PRIMARY KEY
                 REFERENCES public.projects(project_id) ON UPDATE CASCADE,
  status       text        NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'completed', 'failed')),
  attempts     integer     NOT NULL DEFAULT 1,
  orders       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_error   text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at   timestamptz
);

CREATE INDEX IF NOT EXISTS project_intake_runs_status_idx
  ON public.project_intake_runs (status);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.project_intake_runs;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.project_intake_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_intake_runs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Backfill: everything already intaken is recorded as completed
-- ---------------------------------------------------------------------------
-- 1,665 projects already carry questionnaire_received = 'Yes' with orders and
-- ClickUp tasks created under the old flow. Marking them completed means a
-- later accidental No -> Yes toggle cannot re-run intake and duplicate their
-- records. A deliberate re-run goes through request_project_intake_retry().
INSERT INTO public.project_intake_runs (project_id, status, triggered_at, completed_at)
SELECT p.project_id, 'completed', p.created_at, p.created_at
FROM public.projects p
WHERE p.questionnaire_received = 'Yes'::public.yes_no_values
ON CONFLICT (project_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Intake trigger: fires only on the No/NULL -> Yes transition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_projects_questionnaire_received_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  -- Same endpoint and payload the old on_new_row trigger used, so the
  -- new-row-webhook edge function and the n8n intake workflow are unchanged.
  v_url text := 'https://butloczcoaudnwwkdkib.supabase.co/functions/v1/new-row-webhook';
BEGIN
  -- Only a real transition into 'Yes' starts intake. An UPDATE that merely
  -- mentions the column, or that changes unrelated project fields while
  -- questionnaire_received stays 'Yes', falls through untouched.
  IF NEW.questionnaire_received IS DISTINCT FROM 'Yes'::public.yes_no_values THEN
    RETURN NEW;
  END IF;
  IF OLD.questionnaire_received IS NOT DISTINCT FROM 'Yes'::public.yes_no_values THEN
    RETURN NEW;
  END IF;

  -- Exactly-once claim. If a run row already exists (previous intake, or the
  -- backfill above) nothing is inserted, FOUND is false, and no webhook fires.
  INSERT INTO public.project_intake_runs (project_id, status, triggered_at)
  VALUES (NEW.project_id, 'processing', now())
  ON CONFLICT (project_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', NEW.company_email,
      'start_date',    NEW.order_confirmation_date,
      'project_id',    NEW.project_id,
      'path_to_files', NEW.path_to_files
    )
  );

  RETURN NEW;
END;
$function$;

-- AFTER UPDATE OF narrows firing to statements that touch the column; the
-- OLD/NEW guard above still does the real work.
DROP TRIGGER IF EXISTS trg_projects_questionnaire_received ON public.projects;
CREATE TRIGGER trg_projects_questionnaire_received
  AFTER UPDATE OF questionnaire_received ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.trg_projects_questionnaire_received_fn();

-- ---------------------------------------------------------------------------
-- 4. Project creation no longer starts intake
-- ---------------------------------------------------------------------------
-- The function itself is left in place so this is a one-statement rollback:
--   CREATE TRIGGER on_new_row AFTER INSERT ON public.projects
--     FOR EACH ROW EXECUTE FUNCTION public.notify_new_row();
DROP TRIGGER IF EXISTS on_new_row ON public.projects;

-- ---------------------------------------------------------------------------
-- 5. Idempotent order claim
-- ---------------------------------------------------------------------------
-- Called by n8n once per product before the ClickUp task is created. Returns
-- the order row plus whatever ClickUp task this run already recorded, so the
-- workflow can skip creation on a retry.
--
-- The order row is claimed *before* the ClickUp call because it is the ledger
-- that makes the ClickUp call idempotent; click_up_task_link is filled in by
-- record_intake_clickup() immediately afterwards.
CREATE OR REPLACE FUNCTION public.claim_intake_order(
  p_project_id   text,
  p_product_name text,
  p_product_type public.product_type DEFAULT 'Standard'
)
RETURNS TABLE (
  order_pk        bigint,
  order_id        text,
  clickup_task_id text,
  clickup_url     text,
  reused          boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_entry    jsonb;
  v_order_pk bigint;
  v_order_id text;
BEGIN
  IF p_project_id IS NULL OR btrim(p_project_id) = '' THEN
    RAISE EXCEPTION 'claim_intake_order: project_id is required';
  END IF;
  IF p_product_name IS NULL OR btrim(p_product_name) = '' THEN
    RAISE EXCEPTION 'claim_intake_order: product_name is required';
  END IF;

  -- Serialise concurrent claims for the same product of the same project.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_project_id || '|' || p_product_name, 0)
  );

  -- Ensure a run row exists even if intake was started manually rather than by
  -- the trigger (e.g. a replayed webhook).
  INSERT INTO public.project_intake_runs (project_id, status)
  VALUES (p_project_id, 'processing')
  ON CONFLICT (project_id) DO NOTHING;

  SELECT r.orders -> p_product_name
    INTO v_entry
  FROM public.project_intake_runs r
  WHERE r.project_id = p_project_id;

  -- Already claimed by an earlier attempt: hand back what exists, but only if
  -- the order row is still there (it may have been deleted deliberately).
  IF v_entry IS NOT NULL THEN
    SELECT o.id, o.order_id
      INTO v_order_pk, v_order_id
    FROM public.orders o
    WHERE o.id = (v_entry ->> 'order_pk')::bigint;

    IF v_order_pk IS NOT NULL THEN
      RETURN QUERY SELECT
        v_order_pk,
        v_order_id,
        v_entry ->> 'clickup_task_id',
        v_entry ->> 'clickup_url',
        true;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.orders (project_id, product_name, product_type)
  VALUES (p_project_id, p_product_name, p_product_type)
  RETURNING id, orders.order_id INTO v_order_pk, v_order_id;

  UPDATE public.project_intake_runs r
     SET orders = r.orders || jsonb_build_object(
           p_product_name,
           jsonb_build_object('order_pk', v_order_pk, 'order_id', v_order_id)
         )
   WHERE r.project_id = p_project_id;

  RETURN QUERY SELECT v_order_pk, v_order_id, NULL::text, NULL::text, false;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Record the ClickUp task against the claimed order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_intake_clickup(
  p_project_id     text,
  p_product_name   text,
  p_clickup_task_id text,
  p_clickup_url    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_pk bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_project_id || '|' || p_product_name, 0)
  );

  SELECT (r.orders -> p_product_name ->> 'order_pk')::bigint
    INTO v_order_pk
  FROM public.project_intake_runs r
  WHERE r.project_id = p_project_id;

  IF v_order_pk IS NULL THEN
    RAISE EXCEPTION
      'record_intake_clickup: no claimed order for project % / product %',
      p_project_id, p_product_name;
  END IF;

  UPDATE public.orders
     SET click_up_task_link = p_clickup_url
   WHERE id = v_order_pk;

  UPDATE public.project_intake_runs r
     SET orders = jsonb_set(
           r.orders,
           ARRAY[p_product_name],
           (r.orders -> p_product_name)
             || jsonb_build_object(
                  'clickup_task_id', p_clickup_task_id,
                  'clickup_url',     p_clickup_url
                )
         )
   WHERE r.project_id = p_project_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Run status transitions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_project_intake(p_project_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.project_intake_runs
     SET status = 'completed', completed_at = now(), last_error = NULL
   WHERE project_id = p_project_id;
$function$;

CREATE OR REPLACE FUNCTION public.fail_project_intake(
  p_project_id text,
  p_error      text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.project_intake_runs
     SET status = 'failed', last_error = p_error
   WHERE project_id = p_project_id;
$function$;

-- Deliberate re-run after a failure. Only a failed run can be retried, so this
-- can never duplicate a completed intake; the ledger is kept, so the retry
-- reuses the orders and ClickUp tasks that already succeeded.
CREATE OR REPLACE FUNCTION public.request_project_intake_retry(p_project_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_url text := 'https://butloczcoaudnwwkdkib.supabase.co/functions/v1/new-row-webhook';
BEGIN
  UPDATE public.project_intake_runs
     SET status = 'processing', attempts = attempts + 1, triggered_at = now()
   WHERE project_id = p_project_id
     AND status = 'failed';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE project_id = p_project_id;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', v_project.company_email,
      'start_date',    v_project.order_confirmation_date,
      'project_id',    v_project.project_id,
      'path_to_files', v_project.path_to_files
    )
  );

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Manual kickoff for projects the transition trigger can never fire for
-- ---------------------------------------------------------------------------
-- The trigger is UPDATE-only, so a project created with questionnaire_received
-- already 'Yes' (Lidia had the questionnaire in hand at "Mark as Ready") would
-- otherwise sit forever with no intake. Project creation still does not start
-- automation on its own — a human presses "Start intake" in the dashboard.
--
-- Returns false when intake has already been claimed, so it can never produce a
-- second run for a project that is processing or completed.
CREATE OR REPLACE FUNCTION public.start_project_intake(p_project_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_url text := 'https://butloczcoaudnwwkdkib.supabase.co/functions/v1/new-row-webhook';
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE project_id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'start_project_intake: unknown project %', p_project_id;
  END IF;

  IF v_project.questionnaire_received IS DISTINCT FROM 'Yes'::public.yes_no_values THEN
    RETURN false;
  END IF;

  INSERT INTO public.project_intake_runs (project_id, status, triggered_at)
  VALUES (p_project_id, 'processing', now())
  ON CONFLICT (project_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', v_project.company_email,
      'start_date',    v_project.order_confirmation_date,
      'project_id',    v_project.project_id,
      'path_to_files', v_project.path_to_files
    )
  );

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
-- Mirrors public.projects: RLS is on and only service_role is granted, so the
-- table is reachable from the dashboard's supabaseAdmin client and from n8n,
-- but not with the anon key. A new table inherits none of this by default —
-- without these grants PostgREST answers "permission denied".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_intake_runs TO service_role;

-- The RPCs are SECURITY DEFINER; EXECUTE is what PostgREST checks before it
-- will expose them under /rest/v1/rpc/.
GRANT EXECUTE ON FUNCTION public.claim_intake_order(text, text, public.product_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_intake_clickup(text, text, text, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_project_intake(text)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_project_intake(text, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.request_project_intake_retry(text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.start_project_intake(text)                          TO service_role;

-- These are the only ways intake can be started, so they must not be callable
-- with the anon key that ships to the browser.
REVOKE EXECUTE ON FUNCTION public.request_project_intake_retry(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.start_project_intake(text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_intake_order(text, text, public.product_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_intake_clickup(text, text, text, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_project_intake(text)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fail_project_intake(text, text)                     FROM PUBLIC, anon;

COMMIT;

-- PostgREST caches the schema; without this the new table and RPCs answer 404
-- until the next restart.
NOTIFY pgrst, 'reload schema';
