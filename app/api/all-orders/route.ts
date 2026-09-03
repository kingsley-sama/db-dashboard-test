import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ALL_ORDERS_FILTER_COLUMNS,
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

// Text columns the search box matches against.
const SEARCH_COLUMNS = [
  'project_id',
  'order_id',
  'product',
  'product_name',
  'supplier',
  'order_number',
  'company_name',
];

// GET /api/all-orders - Fetch all_orders with pagination and search
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // APMs have no access to the All Orders module
    if (user.role === 'apm') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset, countOnly } = parseListParams(searchParams);
    const search = searchParams.get('search') || '';
    // Order status drill-down from the dashboard tiles / toolbar dropdown.
    const filterStatus = searchParams.get('status') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      ALL_ORDERS_FILTER_COLUMNS
    );

    // One filter chain for every shape of this request — the page of rows, the
    // total that comes back with it, and the count-only variant the dashboard
    // tiles ask for. They must agree or the total contradicts the rows on screen.
    const buildQuery = (options?: CountOptions) => {
      let query = supabaseAdmin.from('all_orders').select('*', options);

      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      if (filterStatus) {
        query = query.eq('order_status', filterStatus);
      }

      return applyColumnFilters(query, columnFilters, ALL_ORDERS_FILTER_COLUMNS);
    };

    // One round trip: the row query carries the total for the same filters.
    const result = await runListQuery({
      limit,
      offset,
      countOnly,
      buildQuery,
      order: (query) => query.order('created_at', { ascending: false }),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      data: result.rows,
      pagination: listPagination(page, limit, result.total),
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
