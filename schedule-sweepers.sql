-- ============================================================================
-- Schedule the stale-run sweepers
-- ============================================================================
--
-- Both sweepers existed but neither ever ran: project-intake-preview.sql and
-- brief-stale-sweeper.sql each left the pg_cron block commented out, and the
-- extension was never installed. The result is the "says processing, actually
-- dead" state — 4 briefs stuck since July, 4 intake runs stuck since 14 Aug.
--
-- A stuck intake is worse than cosmetic: start_project_intake() refuses when a
-- run row exists and request_project_intake_retry() only acts on 'failed', so
-- the project cannot be started or retried from the UI at all. Marking it
-- failed is what returns it to the PM's control.
--
-- This is the backstop, not the primary mechanism. The n8n error workflow
-- reports failures it can see; the sweeper covers what it cannot — the n8n
-- process dying outright, taking the error handler with it.
--
-- Safe to re-run: cron.schedule() upserts on job name.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Every 10 minutes, close anything that has been 'processing' for over 30.
-- Both functions only change a status; neither creates nor deletes anything,
-- and the intake ledger is preserved so a retry reuses the orders and ClickUp
-- tasks that already succeeded.
SELECT cron.schedule(
  'fail-stale-briefs',
  '*/10 * * * *',
  $$SELECT public.fail_stale_briefs(30)$$
);

SELECT cron.schedule(
  'fail-stale-project-intakes',
  '*/10 * * * *',
  $$SELECT public.fail_stale_project_intakes(30)$$
);

-- Verify:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
