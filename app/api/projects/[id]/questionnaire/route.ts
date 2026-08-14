import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/project-access';

// PATCH /api/projects/[id]/questionnaire - Set questionnaire_received.
//
// Deliberately separate from PUT /api/projects/[id], which stays owner-only:
// after handover the PM owns the questionnaire conversation, so a PM has to be
// able to record that it arrived without being handed edit rights over pricing,
// invoicing and dates. This route writes exactly one column.
//
// Being signed in is not enough: this write starts the intake automation, so
// getProjectAccess() also requires the caller to be the project's own PM (or an
// owner/admin).
//
// The 'No' -> 'Yes' transition is what starts the main project intake
// (trg_projects_questionnaire_received). This route only writes the flag — it
// never calls the automation itself, so the database stays the single place
// where intake can be started.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { questionnaire_received } = await request.json();

    if (questionnaire_received !== 'Yes' && questionnaire_received !== 'No') {
      return NextResponse.json(
        { error: "questionnaire_received must be 'Yes' or 'No'" },
        { status: 400 }
      );
    }

    // [id] may be the numeric primary key (owner project table) or the business
    // project_id like "18800-01" (the brief page, which only knows that one).
    const idColumn = /^\d+$/.test(id) ? 'id' : 'project_id';

    const { data: project, error: loadError } = await supabaseAdmin
      .from('projects')
      .select('id, project_id, questionnaire_received, delivery_completion_date, project_manager')
      .eq(idColumn, id)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const access = getProjectAccess(user, project);
    if (!access.canManage) {
      // The reason is specific ("Only Aliyu can start intake…") so the PM can
      // tell a permissions problem from a bug.
      return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 });
    }

    // No-op writes are skipped rather than sent to Postgres. Harmless either way
    // (the trigger guards on OLD/NEW itself), but it keeps updated_at honest.
    if (project.questionnaire_received === questionnaire_received) {
      const { data: run } = await supabaseAdmin
        .from('project_intake_runs')
        .select('status, attempts, last_error, triggered_at, completed_at')
        .eq('project_id', project.project_id)
        .maybeSingle();

      return NextResponse.json(
        { data: project, intake: run ?? null, changed: false },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ questionnaire_received })
      .eq(idColumn, id)
      .select('id, project_id, questionnaire_received')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Read the run row back so the UI can show "intake started" immediately.
    const { data: run } = await supabaseAdmin
      .from('project_intake_runs')
      .select('status, attempts, last_error, triggered_at, completed_at')
      .eq('project_id', project.project_id)
      .maybeSingle();

    return NextResponse.json({ data, intake: run ?? null, changed: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
