import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Join orders: the project end date shown on the dashboard comes from the
    // orders table (orders.project_completion_date), not the projects table.
    let query = supabaseAdmin
      .from('projects')
      .select('*, orders(project_completion_date)', { count: 'exact' });

    // Apply search filter across multiple fields
    if (search) {
      query = query.or(
        `project_id.ilike.%${search}%,` +
        `project_name.ilike.%${search}%,` +
        `project_manager.ilike.%${search}%,` +
        `sales_person.ilike.%${search}%,` +
        `invoice_number.ilike.%${search}%,` +
        `client_contact_name.ilike.%${search}%,` +
        `company_email.ilike.%${search}%`
      );
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

    const { data, count, error } = await query
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
