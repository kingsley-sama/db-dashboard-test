import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  buildSearchFilter,
  needsInnerJoin,
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

// GET /api/orders - Fetch all orders with pagination and search
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pagination and search parameters from query string
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset, countOnly } = parseListParams(searchParams);
    const search = searchParams.get('search') || '';
    const filterType = searchParams.get('filterType') || '';
    const filterPM = searchParams.get('filterPM') || '';
    const filterPmType = searchParams.get('filterPmType') || '';
    // Order status drill-down from the dashboard tiles / toolbar dropdown.
    const filterStatus = searchParams.get('status') || '';
    // Per-column header filters. Unknown columns are dropped by the whitelist.
    const columnFilters = parseColumnFilters(
      searchParams.get('columnFilters'),
      ORDERS_FILTER_COLUMNS
    );

    // APMs must not see orders belonging to completed projects: switch the
    // projects join to an inner join and require no completion date. (This also
    // hides orders with no matching project row from APMs.)
    const isApm = user.role === 'apm';
    // customer_name/customer_email/project_name are served from the joined
    // project row, and PostgREST only *drops* rows on an embedded filter when
    // the join is inner — otherwise it just nulls the embed and the row stays.
    const filtersProject = needsInnerJoin(columnFilters, ORDERS_FILTER_COLUMNS, 'projects');
    const projectJoin =
      isApm || filtersProject
        ? 'projects!inner(delivery_completion_date, project_name, client_contact_name, company_email)'
        : 'projects(delivery_completion_date, project_name, client_contact_name, company_email)';

    // One filter chain for every shape of this request — the page of rows, the
    // total that comes back with it, and the count-only variant the dashboard
    // tiles ask for. They must agree or the total contradicts the rows on screen.
    const buildQuery = (options?: CountOptions) => {
      let query = supabaseAdmin
        .from('orders')
        .select(`*, ${projectJoin}`, options);

      // Role gating first: user-supplied filters may only narrow this further.
      if (isApm) {
        // The end date lives in two places that can disagree: the project's
        // delivery_completion_date and the order's own project_completion_date.
        // A project counts as ended if either is set.
        query = query
          .is('projects.delivery_completion_date', null)
          .is('project_completion_date', null);
      }

      if (search) {
        query = query.or(buildSearchFilter(SEARCH_COLUMNS, search));
      }
      if (filterType) {
        query = query.eq('order_type', filterType);
      }
      if (filterPM) {
        query = query.eq('PM', filterPM);
      }
      if (filterPmType) {
        query = query.eq('pm_type', filterPmType);
      }
      if (filterStatus) {
        query = query.eq('order_status', filterStatus);
      }

      return applyColumnFilters(query, columnFilters, ORDERS_FILTER_COLUMNS);
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

    // Flatten projects fields into each order row. The first-delivery date is
    // NOT flattened: it now comes from the order's own
    // date_first_delivery_complete column, picked up by the `*` select. The
    // project's delivery_completion_date is still joined, but only to gate APM
    // access below.
    const flattenedData = result.rows.map((order: any) => {
      const { projects, ...rest } = order;
      return {
        ...rest,
        project_name: projects?.project_name || null,
        customer_name: projects?.client_contact_name || null,
        customer_email: projects?.company_email || null,
      };
    });

    return NextResponse.json({ 
      data: flattenedData,
      pagination: listPagination(page, limit, result.total)
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // questionnaire_received is a project-level field: the
    // autofill_order_fields_from_project trigger copies it from the project onto
    // the order on insert. Sync it to the project first so the value the PM
    // entered actually sticks (otherwise the trigger would overwrite it).
    const { questionnaire_received, project_id } = body;
    if (questionnaire_received != null && questionnaire_received !== '' && project_id) {
      const { error: projectError } = await supabaseAdmin
        .from('projects')
        .update({ questionnaire_received })
        .eq('project_id', project_id);

      if (projectError) {
        return NextResponse.json({ error: `Failed to update project: ${projectError.message}` }, { status: 500 });
      }
    }

    // Insert order using admin client
    const { data, error } = await supabaseAdmin
      .from('orders')
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
