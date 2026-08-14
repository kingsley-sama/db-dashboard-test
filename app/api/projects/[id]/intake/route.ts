import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/project-access';

// [id] may be the numeric primary key (owner project table) or the business
// project_id like "18800-01" (the brief page, which only ever knows that one).
async function loadProject(id: string) {
  return supabaseAdmin
    .from('projects')
    .select('id, project_id, questionnaire_received, delivery_completion_date, project_manager')
    .eq(/^\d+$/.test(id) ? 'id' : 'project_id', id)
    .maybeSingle();
}

// GET /api/projects/[id]/intake - Current intake state for one project.
//
// Reports the lifecycle the PM cares about:
//   pending_questionnaire - project exists, questionnaire not received yet
//   processing            - intake triggered, workflow running
//   completed / failed    - as recorded by the workflow
//   not_started           - questionnaire is 'Yes' but no run was ever claimed
//                           (project was created with 'Yes', so the UPDATE
//                           trigger never had a transition to fire on)
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

    // Reading the state is not gated on assignment — any PM may see where a
    // project stands. `can_manage` is returned so the panel renders read-only
    // for everyone who cannot actually start intake, instead of offering
    // buttons that 403 on click.
    const access = getProjectAccess(user, project);
    if (!access.canView) {
      return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 });
    }

    const { data: run } = await supabaseAdmin
      .from('project_intake_runs')
      .select('status, attempts, orders, last_error, triggered_at, completed_at')
      .eq('project_id', project.project_id)
      .maybeSingle();

    const state = run
      ? run.status
      : project.questionnaire_received === 'Yes'
        ? 'not_started'
        : 'pending_questionnaire';

    return NextResponse.json(
      {
        state,
        intake: run ?? null,
        // The brief page mounts the panel without knowing the current flag, so
        // it is returned here rather than fetched separately.
        questionnaire_received: project.questionnaire_received,
        can_manage: access.canManage,
        manage_blocked_reason: access.reason
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects/[id]/intake - Start or retry intake by hand.
//
// Both paths are guarded inside Postgres and return false rather than firing a
// second time, so a double-click cannot produce duplicate ClickUp tasks or
// orders:
//   start - only when questionnaire_received = 'Yes' and no run exists yet
//   retry - only when the existing run is 'failed'; the ledger is kept, so the
//           workflow reuses the orders and tasks that already succeeded
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
    const body = await request.json().catch(() => ({}));
    const action = body?.action === 'retry' ? 'retry' : 'start';

    const { data: project, error } = await loadProject(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const access = getProjectAccess(user, project);
    if (!access.canManage) {
      return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 });
    }

    const rpc =
      action === 'retry' ? 'request_project_intake_retry' : 'start_project_intake';

    const { data: started, error: rpcError } = await supabaseAdmin.rpc(rpc, {
      p_project_id: project.project_id
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const { data: run } = await supabaseAdmin
      .from('project_intake_runs')
      .select('status, attempts, last_error, triggered_at, completed_at')
      .eq('project_id', project.project_id)
      .maybeSingle();

    return NextResponse.json(
      {
        started: started === true,
        action,
        intake: run ?? null,
        // Explains a false so the UI can say why nothing happened.
        reason:
          started === true
            ? null
            : action === 'retry'
              ? 'Only a failed intake can be retried'
              : project.questionnaire_received !== 'Yes'
                ? 'Questionnaire has not been received yet'
                : 'Intake has already been started for this project'
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
