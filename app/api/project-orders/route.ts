import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  PROJECT_ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  buildSearchFilter,
  parseColumnFilters,
} from '@/lib/column-filters';

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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      PROJECT_ORDERS_FILTER_COLUMNS
    );

    // One filter chain, applied identically to the count and the data query —
    // they must agree or the row total contradicts the rows on screen.
    const buildQuery = (columns: string, options?: { count: 'exact'; head: true }) => {
      let query = supabaseAdmin.from('project_orders_view').select(columns, options);
      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      return applyColumnFilters(query, columnFilters, PROJECT_ORDERS_FILTER_COLUMNS);
    };

    const { count, error: countError } = await buildQuery('id', {
      count: 'exact',
      head: true,
    });
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const { data, error } = await buildQuery('*')
      .order('created_at', { ascending: false })
      .order('order_pk', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // `id` in the view is the *project* PK, so a project with several orders
    // yields several rows sharing one id. The table keys rows and tracks
    // selection by `id`, so give every row a unique composite key and keep the
    // originals under explicit names. Projects with no orders have a null
    // order_pk.
    const rows = (data || []).map((row: any) => ({
      ...row,
      id: `${row.id}-${row.order_pk ?? 'none'}`,
      project_pk: row.id,
    }));

    return NextResponse.json(
      {
        data: rows,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
