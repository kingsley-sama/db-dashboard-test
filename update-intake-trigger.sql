-- Update the project intake automation payload.
-- Apply after project-intake-separation.sql and project-intake-preview.sql.
-- The proposals table supplies company_email, proposal_date, and path_to_files.
-- proposal_date is sent as start_date; projects.order_confirmation_date is the
-- fallback when a proposal field is missing.

BEGIN;

CREATE OR REPLACE VIEW public.project_intake_queue_view AS
SELECT
  p.id,
  p.project_id,
  p.project_name,
  p.project_manager,
  p.project_type,
  p.project_status,
  p.client_contact_name,
  COALESCE(proposal_inputs.email_address, p.company_email) AS company_email,
  p.questionnaire_received,
  COALESCE(proposal_inputs.start_date, p.order_confirmation_date) AS order_confirmation_date,
  COALESCE(proposal_inputs.path_to_files, p.path_to_files) AS path_to_files,
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
LEFT JOIN LATERAL (
  SELECT pr.company_email AS email_address,
         pr.proposal_date AS start_date,
         pr.path_to_files
  FROM public.proposals pr
  WHERE pr.project_id = p.project_id
  LIMIT 1
) proposal_inputs ON true
LEFT JOIN public.project_intake_runs r ON r.project_id = p.project_id;

CREATE OR REPLACE FUNCTION public.trg_projects_questionnaire_received_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  v_url text := 'https://n8n.exposeprofi.de/webhook/b7c1f402-intake-v2-0000-000000000001';
  v_proposal record;
BEGIN
  IF NEW.questionnaire_received IS DISTINCT FROM 'Yes'::public.yes_no_values THEN
    RETURN NEW;
  END IF;
  IF OLD.questionnaire_received IS NOT DISTINCT FROM 'Yes'::public.yes_no_values THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.project_intake_runs (project_id, status, triggered_at)
  VALUES (NEW.project_id, 'processing', now())
  ON CONFLICT (project_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT pr.company_email AS email_address,
         pr.proposal_date AS start_date,
         pr.path_to_files
    INTO v_proposal
  FROM public.proposals pr
  WHERE pr.project_id = NEW.project_id
  LIMIT 1;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', COALESCE(v_proposal.email_address, NEW.company_email),
      'start_date',    COALESCE(v_proposal.start_date, NEW.order_confirmation_date),
      'project_id',    NEW.project_id,
      'path_to_files', COALESCE(v_proposal.path_to_files, NEW.path_to_files)
    )
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_project_intake_retry(p_project_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_proposal record;
  v_url text := 'https://n8n.exposeprofi.de/webhook/b7c1f402-intake-v2-0000-000000000001';
BEGIN
  UPDATE public.project_intake_runs
     SET status = 'processing', attempts = attempts + 1, triggered_at = now()
   WHERE project_id = p_project_id
     AND status = 'failed';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE project_id = p_project_id;
  SELECT pr.company_email AS email_address,
         pr.proposal_date AS start_date,
         pr.path_to_files
    INTO v_proposal
  FROM public.proposals pr
  WHERE pr.project_id = p_project_id
  LIMIT 1;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', COALESCE(v_proposal.email_address, v_project.company_email),
      'start_date',    COALESCE(v_proposal.start_date, v_project.order_confirmation_date),
      'project_id',    v_project.project_id,
      'path_to_files', COALESCE(v_proposal.path_to_files, v_project.path_to_files)
    )
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_project_intake(p_project_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_proposal record;
  v_url text := 'https://n8n.exposeprofi.de/webhook/b7c1f402-intake-v2-0000-000000000001';
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

  SELECT pr.company_email AS email_address,
         pr.proposal_date AS start_date,
         pr.path_to_files
    INTO v_proposal
  FROM public.proposals pr
  WHERE pr.project_id = p_project_id
  LIMIT 1;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'email_address', COALESCE(v_proposal.email_address, v_project.company_email),
      'start_date',    COALESCE(v_proposal.start_date, v_project.order_confirmation_date),
      'project_id',    v_project.project_id,
      'path_to_files', COALESCE(v_proposal.path_to_files, v_project.path_to_files)
    )
  );

  RETURN true;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
