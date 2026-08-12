import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ALL_ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  buildSearchFilter,
  parseColumnFilters,
} from '@/lib/column-filters';

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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    // Order status drill-down from the dashboard tiles / toolbar dropdown.
    const filterStatus = searchParams.get('status') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      ALL_ORDERS_FILTER_COLUMNS
    );

    // One filter chain, applied identically to the count and the data query —
    // they must agree or the row total contradicts the rows on screen.
    const buildQuery = (options?: { count: 'exact'; head: true }) => {
      let query = supabaseAdmin.from('all_orders').select('*', options);

      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      if (filterStatus) {
        query = query.eq('order_status', filterStatus);
      }

      return applyColumnFilters(query, columnFilters, ALL_ORDERS_FILTER_COLUMNS);
    };

    const { count, error: countError } = await buildQuery({ count: 'exact', head: true });
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const { data, error } = await buildQuery()
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const flattenedData = data || [];

    return NextResponse.json({
      data: flattenedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
