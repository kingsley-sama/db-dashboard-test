import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  PROJECTS_FILTER_COLUMNS,
  applyColumnFilters,
  buildSearchFilter,
  needsInnerJoin,
  parseColumnFilters,
} from '@/lib/column-filters';

// Text columns the search box matches against.
const SEARCH_COLUMNS = [
  'project_id',
  'project_name',
  'project_manager',
  'sales_person',
  'invoice_number',
  'client_contact_name',
  'company_email',
];

// GET /api/projects - Fetch all projects with pagination and search (owner only)
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated and is an owner
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get pagination and search parameters from query string
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const filterPM = searchParams.get('filterPM') || '';
    const filterPmType = searchParams.get('filterPmType') || '';
    const filterStatus = searchParams.get('filterStatus') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      PROJECTS_FILTER_COLUMNS
    );

    // Join orders: the project end date shown on the dashboard comes from the
    // orders table (orders.project_completion_date), not the projects table.
    // PostgREST nulls an embed rather than dropping the row, so filtering on an
    // order column only narrows the result set once the join is `!inner`.
    const ordersEmbed = needsInnerJoin(columnFilters, PROJECTS_FILTER_COLUMNS, 'orders')
      ? 'orders!inner(project_completion_date)'
      : 'orders(project_completion_date)';

    // One filter chain, applied identically to the count and the data query —
    // they must agree or the row total contradicts the rows on screen.
    const buildQuery = (options?: { count: 'exact'; head: true }) => {
      let query = supabaseAdmin.from('projects').select(`*, ${ordersEmbed}`, options);

      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      if (filterPM) {
        query = query.eq('project_manager', filterPM);
      }
      if (filterPmType) {
        query = query.eq('pm_type', filterPmType);
      }
      if (filterStatus) {
        query = query.eq('project_status', filterStatus);
      }

      return applyColumnFilters(query, columnFilters, PROJECTS_FILTER_COLUMNS);
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

    // Replace projects.project_completion_date with the latest one set on the
    // project's orders (a project can have several orders).
    const flattenedData = (data || []).map((project: any) => {
      const { orders, ...rest } = project;
      const orderDates = (orders || [])
        .map((o: any) => o.project_completion_date)
        .filter(Boolean)
        .sort();
      return {
        ...rest,
        project_completion_date: orderDates[orderDates.length - 1] || null,
      };
    });

    return NextResponse.json({
      data: flattenedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects - Create a new project (owner only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert([body])
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
