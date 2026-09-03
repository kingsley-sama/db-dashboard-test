import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  PROJECT_ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  buildSearchFilter,
  parseColumnFilters,
} from '@/lib/column-filters';
import {
  listPagination,
  parseListParams,
  runListQuery,
  type CountOptions,
} from '@/lib/list-query';

// Text columns of project_orders_view that the search box matches against.
// Several view columns (PM, project_status, project_type, construction_type,
// property_type, order_type, product_type, sale_type, pm_type) are Postgres
// enums and cannot be used with ilike, so they are deliberately excluded.
const SEARCH_COLUMNS = [
  'project_id',
  'project_name',
  'order_id',
  'order_number',
  'invoice_number',
  'product',
  'product_name',
  'supplier',
  'company_name',
  'client_contact_name',
  'project_manager',
  'sales_person',
  'client_rating',
];

// GET /api/project-orders — read-only feed of project_orders_view (projects
// left-joined to all_orders). There is no POST/PUT/DELETE: the view is a
// reporting surface, and writes belong on /api/projects and /api/orders.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // The view exposes order financials (net/gross sum, DB1, margin, ROI, cost),
    // so it follows the All Orders module: no APM access.
    if (user.role === 'apm') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset, countOnly } = parseListParams(searchParams);
    const search = searchParams.get('search') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      PROJECT_ORDERS_FILTER_COLUMNS
    );

    // One filter chain for every shape of this request — the page of rows, the
    // total that comes back with it, and the count-only variant the dashboard
    // tiles ask for. They must agree or the total contradicts the rows on screen.
    const buildQuery = (options?: CountOptions) => {
      let query = supabaseAdmin.from('project_orders_view').select('*', options);
      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      return applyColumnFilters(query, columnFilters, PROJECT_ORDERS_FILTER_COLUMNS);
    };

    // One round trip: the row query carries the total for the same filters.
    const result = await runListQuery({
      limit,
      offset,
      countOnly,
      buildQuery,
      order: (query) =>
        query
          .order('created_at', { ascending: false })
          .order('order_pk', { ascending: true }),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // `id` in the view is the *project* PK, so a project with several orders
    // yields several rows sharing one id. The table keys rows and tracks
    // selection by `id`, so give every row a unique composite key and keep the
    // originals under explicit names. Projects with no orders have a null
    // order_pk.
    const rows = result.rows.map((row: any) => ({
      ...row,
      id: `${row.id}-${row.order_pk ?? 'none'}`,
      project_pk: row.id,
    }));

    return NextResponse.json(
      {
        data: rows,
        pagination: listPagination(page, limit, result.total),
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
