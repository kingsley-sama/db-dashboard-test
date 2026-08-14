-- ============================================================================
-- Project intake: queue view + preview (dry-run) storage
-- ============================================================================
--
-- Companion to project-intake-separation.sql, which must be applied first
-- (this file references public.project_intake_runs).
--
-- Adds the two read surfaces the Orders dashboard needs:
--
--   project_intake_queue_view  - one row per project with its intake state
--                                resolved, so the dashboard can list and count
--                                without an anti-join in PostgREST.
--   project_intake_previews    - result of a DRY RUN of the intake workflow.
--                                Read-only by construction: nothing here is
--                                ever consulted by the real intake, and the
--                                dry run writes no orders and no ClickUp task.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Queue view
-- ---------------------------------------------------------------------------
-- intake_state collapses two sources into the lifecycle the PM sees:
--
--   pending_questionnaire - no run row, questionnaire not received
--   not_started           - no run row, questionnaire already 'Yes' (project was
--                           created with it set, so the UPDATE trigger never had
--                           a transition to fire on)
--   processing/completed/failed - straight from project_intake_runs
--
-- existing_order_count is what makes "Already exists" vs "Will be created"
-- answerable in the confirmation dialog: a project that already has orders is
-- one where intake has, in some form, already run.
CREATE OR REPLACE VIEW public.project_intake_queue_view AS
SELECT
  p.id,
  p.project_id,
  p.project_name,
  p.project_manager,
  p.project_type,
  p.project_status,
  p.client_contact_name,
  p.company_email,
  p.questionnaire_received,
  p.order_confirmation_date,
  p.path_to_files,
  p.delivery_completion_date,
  p.created_at,
  COALESCE(
    r.status,
    CASE
      WHEN p.questionnaire_received = 'Yes'::public.yes_no_values THEN 'not_started'
      ELSE 'pending_questionnaire'
    END
  ) AS intake_state,
  r.attempts,
  r.last_error,
  r.triggered_at,
  r.completed_at,
  (SELECT count(*) FROM public.orders o WHERE o.project_id = p.project_id)
    AS existing_order_count
FROM public.projects p
LEFT JOIN public.project_intake_runs r ON r.project_id = p.project_id;

-- ---------------------------------------------------------------------------
-- 2. Preview (dry-run) results
-- ---------------------------------------------------------------------------
-- One row per project, overwritten by each new dry run. `job_id` is what the
-- n8n dry-run branch echoes back to the callback, so a stale run that finishes
-- after a newer one was requested is discarded instead of overwriting it.
--
-- expected_orders is the output of the SAME nodes the real intake uses to
-- decide orders (Get Emails -> translate -> brief generator -> Order id
-- generation). The dry-run branch stops before claim_intake_order, so the
-- preview and the real run agree by construction rather than by a
-- reimplementation of the logic.
CREATE TABLE IF NOT EXISTS public.project_intake_previews (
  project_id      text PRIMARY KEY
                    REFERENCES public.projects(project_id) ON UPDATE CASCADE,
  job_id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  status          text        NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'completed', 'failed')),
  expected_orders jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_error      text,
  requested_by    text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS project_intake_previews_job_id_idx
  ON public.project_intake_previews (job_id);

ALTER TABLE public.project_intake_previews ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
-- Mirrors projects/project_intake_runs: RLS on, service_role only, so both are
-- reachable from the dashboard's supabaseAdmin client but not with the anon key
-- that ships to the browser.
GRANT SELECT ON public.project_intake_queue_view TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_intake_previews TO service_role;

-- The view runs with the privileges of its owner and is reachable by anyone
-- granted SELECT, so it must not leak to anon.
REVOKE ALL ON public.project_intake_queue_view FROM PUBLIC, anon;
REVOKE ALL ON public.project_intake_previews FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 4. Stale-run sweeper
-- ---------------------------------------------------------------------------
-- Nothing in the intake workflow calls fail_project_intake(), so a run that
-- crashes — or an n8n instance that dies mid-run — leaves status = 'processing'
-- forever. That is not a cosmetic problem: request_project_intake_retry() only
-- acts on a 'failed' run and start_project_intake() refuses when a run row
-- exists, so the project becomes permanently unstartable with no path out from
-- the UI.
--
-- An n8n error workflow only covers the cases where n8n is alive to report
-- them. This sweeper covers every case, including the process disappearing.
--
-- Nothing here can duplicate work: it only changes a status. The retry that
-- follows still reuses the run's ledger of orders and ClickUp tasks.
CREATE OR REPLACE FUNCTION public.fail_stale_project_intakes(
  p_timeout_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.project_intake_runs
     SET status     = 'failed',
         last_error = format(
           'Intake did not report back within %s minutes and was marked failed automatically. Retry is safe: anything the run already created is reused.',
           p_timeout_minutes
         )
   WHERE status = 'processing'
     AND triggered_at < now() - make_interval(mins => p_timeout_minutes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fail_stale_project_intakes(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fail_stale_project_intakes(integer) FROM PUBLIC, anon;

COMMIT;

-- Schedule the sweeper. Requires pg_cron; if it is not available, call
-- fail_stale_project_intakes() from an n8n schedule trigger instead.
--
--   SELECT cron.schedule(
--     'fail-stale-project-intakes',
--     '*/10 * * * *',
--     $$SELECT public.fail_stale_project_intakes(30)$$
--   );

-- PostgREST caches the schema; without this the new view and table answer 404
-- until the next restart.
NOTIFY pgrst, 'reload schema';
