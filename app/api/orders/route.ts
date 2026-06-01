import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const filterType = searchParams.get('filterType') || '';
    const filterPM = searchParams.get('filterPM') || '';
    const filterPmType = searchParams.get('filterPmType') || '';

    // Build query with filters - join with projects for delivery_completion_date and project_name
    let query = supabaseAdmin.from('orders').select('*, projects(delivery_completion_date, project_name, client_contact_name, company_email)', { count: 'exact' });

    // Apply search filter across multiple fields
    if (search) {
      query = query.or(
        `project_id.ilike.%${search}%,` +
        `order_id.ilike.%${search}%,` +
        `product.ilike.%${search}%,` +
        `product_name.ilike.%${search}%,` +
        `supplier.ilike.%${search}%,` +
        `order_number.ilike.%${search}%,` +
        `company_name.ilike.%${search}%`
      );
    }

    // Apply order type filter
    if (filterType) {
      query = query.eq('order_type', filterType);
    }

    // Apply PM filter
    if (filterPM) {
      query = query.eq('PM', filterPM);
    }

    // Apply PM type filter
    if (filterPmType) {
      query = query.eq('pm_type', filterPmType);
    }

    // Get total count with filters applied
    const { count, error: countError } = await query;

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Fetch paginated data with filters - join with projects for delivery_completion_date and project_name
    let dataQuery = supabaseAdmin.from('orders').select('*, projects(delivery_completion_date, project_name, client_contact_name, company_email)');

    // Apply same filters to data query
    if (search) {
      dataQuery = dataQuery.or(
        `project_id.ilike.%${search}%,` +
        `order_id.ilike.%${search}%,` +
        `product.ilike.%${search}%,` +
        `product_name.ilike.%${search}%,` +
        `supplier.ilike.%${search}%,` +
        `order_number.ilike.%${search}%,` +
        `company_name.ilike.%${search}%`
      );
    }

    if (filterType) {
      dataQuery = dataQuery.eq('order_type', filterType);
    }

    if (filterPM) {
      dataQuery = dataQuery.eq('PM', filterPM);
    }

    if (filterPmType) {
      dataQuery = dataQuery.eq('pm_type', filterPmType);
    }

    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten projects fields into each order row
    const flattenedData = (data || []).map((order: any) => {
      const { projects, ...rest } = order;
      return {
        ...rest,
        delivery_completion_date: projects?.delivery_completion_date || null,
        project_name: projects?.project_name || null,
        customer_name: projects?.client_contact_name || null,
        customer_email: projects?.company_email || null,
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

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

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
