import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/project-access';

// GET /api/projects/intake-queue - the Project Intake section of the Orders
// dashboard: lifecycle counts plus the list of projects a PM can act on.
//
// Reads project_intake_queue_view, which resolves each project's intake_state
// from project_intake_runs (see project-intake-preview.sql). Counts are exact
// (head + count) rather than derived from the returned page, matching how the
// order status tiles are counted.
//
// The failed list is a work queue, not a data table — it is capped rather than
// paginated. Every other state is only ever shown as a count.
const LIST_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?project_id=18800-01 — single-project lookup for the search box. Returns
    // the same decorated row shape as the lists below, so the UI renders a hit
    // with the component it already uses, and 404s when there is no such
    // project rather than returning an empty list the caller has to interpret.
    const lookup = request.nextUrl.searchParams.get('project_id')?.trim();
    if (lookup) {
      // Case-insensitive but still an EXACT match: ilike treats % and _ as
      // wildcards, so a typed "1733%" would match many rows and make
      // maybeSingle() fail. Escaping them keeps this a lookup, not a search.
      const escaped = lookup.replace(/([\\%_])/g, '\\$1');

      let query = supabaseAdmin
        .from('project_intake_queue_view')
        .select('*')
        .ilike('project_id', escaped)
        .maybeSingle();

      const { data: row, error: lookupError } = await query;
      if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json(
          { error: `No project found with ID "${lookup}".` },
          { status: 404 }
        );
      }

      const access = getProjectAccess(user, row);
      // An APM looking up a completed project gets the same answer as for a
      // project that does not exist, so the lookup cannot be used to probe for
      // records the role is not allowed to see.
      if (!access.canView) {
        return NextResponse.json(
          { error: `No project found with ID "${lookup}".` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          project: {
            ...row,
            can_manage: access.canManage,
            manage_blocked_reason: access.reason
          }
        },
        { status: 200 }
      );
    }

    const countFor = async (state: string) => {
      let query = supabaseAdmin
        .from('project_intake_queue_view')
        .select('project_id', { count: 'exact', head: true })
        .eq('intake_state', state);

      // Same rule as the rest of the app: APMs never see completed projects.
      if (user.role === 'apm') {
        query = query.is('delivery_completion_date', null);
      }

      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [pending, notStarted, processing, completed, failed] = await Promise.all([
      countFor('pending_questionnaire'),
      countFor('not_started'),
      countFor('processing'),
      countFor('completed'),
      countFor('failed')
    ]);

    // Projects waiting for a questionnaire are counted but not listed: the PM
    // reaches a specific project through the ?project_id lookup above, so
    // enumerating hundreds of them served no purpose.
    //
    // Runs that are in flight, recently finished, or failed ARE listed. This is
    // the operational view — "is the automation working, and on what?" — which
    // no other screen answers.
    const listFor = async (state: string, orderColumn: string) => {
      let query = supabaseAdmin
        .from('project_intake_queue_view')
        .select('*')
        .eq('intake_state', state);

      if (user.role === 'apm') {
        query = query.is('delivery_completion_date', null);
      }

      const { data, error: listError } = await query
        .order(orderColumn, { ascending: false, nullsFirst: false })
        .limit(LIST_LIMIT);

      if (listError) throw new Error(listError.message);
      return data ?? [];
    };

    const [processingRows, failedRows, completedRows] = await Promise.all([
      listFor('processing', 'triggered_at'),
      listFor('failed', 'triggered_at'),
      listFor('completed', 'completed_at')
    ]);

    // can_manage is decided per row so the UI renders the same project as
    // actionable or read-only depending on who is looking at it, instead of
    // offering a button that 403s on click.
    const decorate = (rows: any[] | null) =>
      (rows ?? []).map((row) => {
        const access = getProjectAccess(user, row);
        return { ...row, can_manage: access.canManage, manage_blocked_reason: access.reason };
      });

    return NextResponse.json(
      {
        counts: {
          pending_questionnaire: pending,
          not_started: notStarted,
          processing,
          completed,
          failed,
          // What the "Waiting" tile shows: both states a PM can act on.
          waiting: pending + notStarted
        },
        processing_runs: decorate(processingRows),
        failed: decorate(failedRows),
        // A short tail only — enough to show the automation is producing
        // results, not a history page.
        recent_completed: decorate(completedRows).slice(0, 5),
        // How long a run may sit in 'processing' before the UI calls it stalled.
        // Matches the default passed to fail_stale_project_intakes().
        stale_after_minutes: 30,
        limit: LIST_LIMIT
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
