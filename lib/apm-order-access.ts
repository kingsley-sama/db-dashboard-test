import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Which orders an APM may see.
//
// Base rule: APMs only see orders on live projects. A project counts as ended
// if either its delivery_completion_date or the order's own
// project_completion_date is set.
//
// Exception: once a project has a revision or extra order — an order_id ending
// in "-re" / "-ext" (optionally numbered, e.g. "14500-48-er-re_1",
// "18120-04-3dfp-ext_2") — every order on that project is visible again, even
// if the project is completed, so the APM can follow up on the whole job.
// ---------------------------------------------------------------------------

/** order_id suffix marking a revision or extra order. */
export const REOPENING_ORDER_ID = /-(re|ext)(_\d+)?$/i;
// Same pattern in POSIX syntax for PostgREST's imatch (case-insensitive ~*).
const REOPENING_ORDER_ID_SQL = '-(re|ext)(_[0-9]+)?$';

/** project_ids that have at least one revision/extra order. */
export async function getReopenedProjectIds(): Promise<string[]> {
  const ids = new Set<string>();
  const CHUNK = 1000;

  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('project_id')
      .filter('order_id', 'imatch', REOPENING_ORDER_ID_SQL)
      .not('project_id', 'is', null)
      .order('project_id', { ascending: true })
      .range(offset, offset + CHUNK - 1);

    if (error) throw new Error(error.message);
    for (const row of data || []) ids.add(String(row.project_id));
    if (!data || data.length < CHUNK) break;
  }

  return Array.from(ids);
}

// PostgREST `in.(...)` list; values are quoted so ids with commas or
// parentheses can't break out of the list.
function inList(ids: string[]) {
  return `(${ids.map((id) => `"${id.replace(/["\\]/g, '\\$&')}"`).join(',')})`;
}

/**
 * Restricts an orders query to what an APM may see. The query must select
 * `projects!inner(delivery_completion_date, ...)` so the embedded filter drops
 * rows rather than just nulling the embed.
 *
 * Visible = (project live AND order live) OR project reopened, written as
 * (project live OR reopened) AND (order live OR reopened).
 */
export function applyApmOrderGate<Q extends { or: any; is: any }>(
  query: Q,
  reopenedProjectIds: string[]
): Q {
  if (reopenedProjectIds.length === 0) {
    return query
      .is('projects.delivery_completion_date', null)
      .is('project_completion_date', null);
  }

  const reopened = inList(reopenedProjectIds);
  return query
    .or(`delivery_completion_date.is.null,project_id.in.${reopened}`, {
      referencedTable: 'projects',
    })
    .or(`project_completion_date.is.null,project_id.in.${reopened}`);
}

/** Single-order check for write paths. */
export async function canApmAccessOrder(order: {
  project_id?: string | null;
  project_completion_date?: string | null;
  delivery_completion_date?: string | null;
}): Promise<boolean> {
  if (!order.delivery_completion_date && !order.project_completion_date) return true;
  if (!order.project_id) return false;

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('project_id', order.project_id)
    .filter('order_id', 'imatch', REOPENING_ORDER_ID_SQL)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
