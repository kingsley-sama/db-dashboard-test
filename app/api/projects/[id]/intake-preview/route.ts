import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/project-access';

// Read-only preview of what starting intake would do.
//
// STRICTLY NO WRITES TO BUSINESS TABLES. This route never inserts an order,
// never creates a ClickUp task, and never sets questionnaire_received. The only
// row it writes is project_intake_previews, which is preview bookkeeping and is
// never read by the real intake.
//
// Where the numbers come from
// ---------------------------
// Two different kinds of fact are shown, and they must not be confused:
//
//   Deterministic (this route, straight from Postgres): project fields, the
//   orders that ALREADY exist, the intake run state, whether path_to_files and
//   order_confirmation_date are present.
//
//   Predicted (the dry run): the orders intake WOULD create. These are decided
//   by an LLM reading the client's email thread inside the n8n workflow — there
//   is no order-generation logic in this app or in Postgres to call. Rather than
//   reimplement that (which would drift from the real run), POST re-runs the
//   real workflow's own nodes in dry-run mode and stores what they compute.
//   Until that returns, expected_orders is empty and `orders_source` says why.

async function loadProject(id: string) {
  return supabaseAdmin
    .from('project_intake_queue_view')
    .select('*')
    .eq(/^\d+$/.test(id) ? 'id' : 'project_id', id)
    .maybeSingle();
}

// Fields the intake workflow actually consumes. A missing value here is a real
// problem, not a style issue — these are the inputs to the webhook payload
// built by trg_projects_questionnaire_received_fn().
function buildWarnings(project: any) {
  const warnings: { field: string; message: string; blocking: boolean }[] = [];

  if (!project.company_email) {
    warnings.push({
      field: 'company_email',
      message:
        'No company email on the project. Intake fetches the client email thread by sender address and will find nothing to work from.',
      blocking: true
    });
  }

  if (!project.order_confirmation_date) {
    warnings.push({
      field: 'order_confirmation_date',
      message:
        'No order confirmation date. It is sent as the email search start date; without it the mailbox query is malformed and intake fails.',
      blocking: true
    });
  }

  if (!project.path_to_files) {
    warnings.push({
      field: 'path_to_files',
      message:
        'No path to files. The brief and ClickUp task are still created, but no project files are attached to them.',
      blocking: false
    });
  }

  if (Number(project.existing_order_count) > 0) {
    warnings.push({
      field: 'orders',
      message: `This project already has ${project.existing_order_count} order(s). Intake will reuse anything its ledger already recorded, but orders added by hand are not part of that ledger.`,
      blocking: false
    });
  }

  return warnings;
}

// GET /api/projects/[id]/intake-preview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { data: project, error } = await loadProject(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const access = getProjectAccess(user, project);
    if (!access.canView) {
      return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 });
    }

    // Orders that already exist. These are shown as "Already exists" so the PM
    // can tell them apart from what intake would add.
    const { data: existingOrders } = await supabaseAdmin
      .from('orders')
      .select('id, order_id, product_name, product_type, quantity, due_delivery_date, click_up_task_link')
      .eq('project_id', project.project_id)
      .order('id', { ascending: true });

    const { data: preview } = await supabaseAdmin
      .from('project_intake_previews')
      .select('job_id, status, expected_orders, last_error, requested_at, completed_at')
      .eq('project_id', project.project_id)
      .maybeSingle();

    // A dry run that never calls back would otherwise leave the dialog polling
    // forever. Reported as failed after the timeout rather than written back —
    // the row stays as it is, so a late callback is still accepted.
    const PREVIEW_TIMEOUT_MS = 10 * 60 * 1000;
    const previewStale =
      preview?.status === 'processing' &&
      Date.now() - new Date(preview.requested_at).getTime() > PREVIEW_TIMEOUT_MS;

    // The dry run is optional: the dialog is useful without it, so its absence
    // is a state to render, not an error.
    const ordersSource = !preview
      ? 'not_requested'
      : previewStale
        ? 'failed'
        : preview.status === 'completed'
          ? 'dry_run'
          : preview.status;

    const warnings = buildWarnings(project);

    return NextResponse.json(
      {
        project: {
          id: project.id,
          project_id: project.project_id,
          project_name: project.project_name,
          project_manager: project.project_manager,
          project_type: project.project_type,
          project_status: project.project_status,
          client_contact_name: project.client_contact_name,
          company_email: project.company_email,
          questionnaire_received: project.questionnaire_received,
          order_confirmation_date: project.order_confirmation_date,
          path_to_files: project.path_to_files,
          created_at: project.created_at
        },
        intake_state: project.intake_state,
        intake: {
          attempts: project.attempts,
          last_error: project.last_error,
          triggered_at: project.triggered_at,
          completed_at: project.completed_at
        },
        // What intake will do, described only in terms of what the current
        // workflow actually performs. It creates orders, one ClickUp task per
        // order carrying the generated brief, and attaches project files to
        // those tasks. It does not create feedback tags or any other record.
        expected_outputs: [
          { key: 'brief', label: 'Project brief generated from the client email thread' },
          { key: 'orders', label: 'One order per product identified in the thread' },
          { key: 'clickup', label: 'One ClickUp task per order, containing the brief' },
          {
            key: 'files',
            label: project.path_to_files
              ? 'Project files attached to each ClickUp task'
              : 'No files attached (no path to files set)',
            skipped: !project.path_to_files
          }
        ],
        existing_orders: existingOrders ?? [],
        expected_orders: preview?.status === 'completed' ? preview.expected_orders : [],
        orders_source: ordersSource,
        preview_job: preview
          ? {
              job_id: preview.job_id,
              status: previewStale ? 'failed' : preview.status,
              last_error: previewStale
                ? 'The preview did not report back in time.'
                : preview.last_error,
              requested_at: preview.requested_at,
              completed_at: preview.completed_at
            }
          : null,
        warnings,
        can_manage: access.canManage,
        manage_blocked_reason: access.reason
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects/[id]/intake-preview - run the dry run.
//
// Calls the intake workflow with dry_run: true. That branch runs the same
// email-fetch, translation, brief-generation and order-naming nodes as the real
// intake, then stops before claim_intake_order and posts the computed list back
// to /api/projects/intake-preview/callback. No orders, no ClickUp task, no
// questionnaire change, no project_intake_runs row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { data: project, error } = await loadProject(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const access = getProjectAccess(user, project);
    if (!access.canManage) {
      return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 });
    }

    const webhookUrl = process.env.N8N_INTAKE_DRY_RUN_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        {
          error:
            'N8N_INTAKE_DRY_RUN_WEBHOOK_URL is not configured. The order preview needs the intake workflow’s dry-run branch; everything else in this dialog works without it.'
        },
        { status: 501 }
      );
    }

    // Claim the row first so the job_id exists before the workflow can call
    // back. Overwriting resets any previous preview for this project — the
    // callback matches on job_id, so a slow earlier run is discarded.
    const jobId = crypto.randomUUID();
    const { error: claimError } = await supabaseAdmin
      .from('project_intake_previews')
      .upsert(
        {
          project_id: project.project_id,
          job_id: jobId,
          status: 'processing',
          expected_orders: [],
          last_error: null,
          requested_by: user.email,
          requested_at: new Date().toISOString(),
          completed_at: null
        },
        { onConflict: 'project_id' }
      );

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    // Same https-callback requirement as /api/project-brief: n8n rejects a
    // non-https callback URL.
    let baseUrl = process.env.BASE_URL || '';
    if (!baseUrl.startsWith('https://')) {
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      if (host && !host.includes('localhost') && proto === 'https') {
        baseUrl = `https://${host}`;
      }
    }
    if (!baseUrl.startsWith('https://')) {
      return NextResponse.json(
        {
          error:
            'Cannot build an https:// callback URL. Set BASE_URL to the public https URL of this app, or use an https tunnel when testing locally.'
        },
        { status: 500 }
      );
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dry_run: true,
        job_id: jobId,
        project_id: project.project_id,
        email_address: project.company_email,
        start_date: project.order_confirmation_date,
        path_to_files: project.path_to_files,
        callback_url: `${baseUrl.replace(/\/$/, '')}/api/projects/intake-preview/callback`,
        requested_by: user.email
      })
    });

    if (!response.ok) {
      const text = await response.text();
      await supabaseAdmin
        .from('project_intake_previews')
        .update({
          status: 'failed',
          last_error: `Dry run could not be started (${response.status}): ${text}`,
          completed_at: new Date().toISOString()
        })
        .eq('job_id', jobId);

      return NextResponse.json(
        { error: `Dry run could not be started (${response.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json({ job_id: jobId, status: 'processing' }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
