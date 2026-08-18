-- ============================================================================
-- Stale brief sweeper
-- ============================================================================
--
-- Nothing closes a brief that never reports back. The n8n workflow can die
-- mid-run (process restart, an unhandled node error past the error-workflow's
-- reach, a callback that 500s), and the entry then sits at 'processing'
-- forever: the UI polls it every 5 seconds indefinitely and the user is never
-- told it will not finish. Four entries have been in that state since 27 July.
--
-- This is the brief-side twin of fail_stale_project_intakes() in
-- project-intake-preview.sql, and follows it deliberately: only a status
-- changes, nothing is created or deleted, so running it can never destroy work.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fail_stale_briefs(p_timeout_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => p_timeout_minutes);
  v_count  integer;
BEGIN
  -- Count the entries (not the threads) being closed, so the return value means
  -- "briefs swept" the way the intake sweeper's does.
  SELECT count(*)
    INTO v_count
  FROM public.brief_conversations c,
       LATERAL jsonb_array_elements(c.entries) AS e(val)
  WHERE e.val ->> 'status' = 'processing'
    AND (e.val ->> 'created_at')::timestamptz < v_cutoff;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Rebuild each affected thread's array in one pass. jsonb_agg with ORDINALITY
  -- preserves entry order, which the conversation view depends on.
  WITH rebuilt AS (
    SELECT c.user_email,
           c.project_id,
           jsonb_agg(
             CASE
               WHEN e.val ->> 'status' = 'processing'
                AND (e.val ->> 'created_at')::timestamptz < v_cutoff
               THEN e.val || jsonb_build_object(
                      'status',       'error',
                      'error_code',   'BRIEF_TIMED_OUT',
                      'completed_at', to_jsonb(now()),
                      -- The UI renders result_payload.message under the error
                      -- code, so give it something a PM can act on rather than
                      -- leaving a bare code with no explanation.
                      'result_payload', jsonb_build_object(
                        'status',  'error',
                        'error',   'BRIEF_TIMED_OUT',
                        'message', format(
                          'This brief never reported back within %s minutes and was closed automatically. Nothing was saved for it — ask for another one.',
                          p_timeout_minutes
                        )
                      )
                    )
               ELSE e.val
             END
             ORDER BY e.ord
           ) AS entries,
           bool_or(
             e.val ->> 'status' = 'processing'
             AND (e.val ->> 'created_at')::timestamptz < v_cutoff
           ) AS touched
    FROM public.brief_conversations c,
         LATERAL jsonb_array_elements(c.entries) WITH ORDINALITY AS e(val, ord)
    GROUP BY c.user_email, c.project_id
  )
  UPDATE public.brief_conversations c
     SET entries    = r.entries,
         updated_at = now()
    FROM rebuilt r
   WHERE c.user_email = r.user_email
     AND c.project_id = r.project_id
     AND r.touched;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fail_stale_briefs(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fail_stale_briefs(integer) FROM PUBLIC, anon;

COMMIT;

-- Schedule alongside the intake sweeper. If pg_cron is unavailable, call it
-- from an n8n schedule trigger instead.
--
--   SELECT cron.schedule(
--     'fail-stale-briefs',
--     '*/10 * * * *',
--     $$SELECT public.fail_stale_briefs(30)$$
--   );

NOTIFY pgrst, 'reload schema';
