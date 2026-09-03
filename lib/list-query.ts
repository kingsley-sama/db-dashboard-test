// ---------------------------------------------------------------------------
// Shared paging for the list endpoints (/api/orders, /api/all-orders,
// /api/projects, /api/project-orders).
//
// All four serve the same shape — a page of rows plus the total for whatever
// filters are in force — and each used to get it with two round trips: a
// head-only `count: exact` query, then the same filter chain again for the
// rows. Both are scans of the same filtered set, and the search box re-runs
// them on every change, so half the database work behind a search went to
// counting something the row query reports for free: PostgREST returns the
// total in the Content-Range header of the row request itself.
// ---------------------------------------------------------------------------

/** Count options accepted by supabase-js `.select()`. */
export type CountOptions = { count?: 'exact'; head?: boolean };

export type ListParams = {
  page: number;
  limit: number;
  offset: number;
  /** Only the total was asked for; skip the row query entirely. */
  countOnly: boolean;
};

/**
 * Reads the paging params off a list request.
 *
 * `limit=0` asks for the count alone — the dashboard status tiles need four
 * totals per keystroke and none of the rows behind them.
 */
export function parseListParams(searchParams: URLSearchParams): ListParams {
  const parsedPage = parseInt(searchParams.get('page') || '1');
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedLimit = parseInt(searchParams.get('limit') || '500');
  const limit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 500;

  return { page, limit, offset: (page - 1) * limit, countOnly: limit === 0 };
}

export type ListResult =
  | { ok: true; rows: any[]; total: number }
  | { ok: false; error: string };

/**
 * Runs one list query and reports its rows alongside the total for the same
 * filters.
 *
 * `buildQuery` must apply an identical filter chain every time it is called, or
 * the total would contradict the rows on screen.
 */
export async function runListQuery({
  limit,
  offset,
  countOnly,
  buildQuery,
  order,
}: Omit<ListParams, 'page'> & {
  buildQuery: (options?: CountOptions) => any;
  /** Applies the sort. The page range is added after it. */
  order: (query: any) => any;
}): Promise<ListResult> {
  if (countOnly) {
    const { count, error } = await buildQuery({ count: 'exact', head: true });
    return error
      ? { ok: false, error: error.message }
      : { ok: true, rows: [], total: count || 0 };
  }

  const { data, count, error } = await order(buildQuery({ count: 'exact' })).range(
    offset,
    offset + limit - 1
  );

  // Asking for a range past the end of the result set is an error once an exact
  // count is requested (PGRST103), and that happens whenever rows disappear
  // under a page someone is still sitting on. Serve it as an empty page rather
  // than a failure — the total still tells the table where to go.
  if (error?.code === 'PGRST103') {
    const { count: total, error: countError } = await buildQuery({
      count: 'exact',
      head: true,
    });
    return countError
      ? { ok: false, error: countError.message }
      : { ok: true, rows: [], total: total || 0 };
  }
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, rows: data || [], total: count || 0 };
}

/** The pagination envelope every list endpoint returns. */
export const listPagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});
