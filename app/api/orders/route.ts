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

    // Build query with filters
    let query = supabaseAdmin.from('orders').select('*', { count: 'exact' });

    // Apply search filter across multiple fields
    if (search) {
      query = query.or(
        `project_id.ilike.%${search}%,` +
        `order_id.ilike.%${search}%,` +
        `product.ilike.%${search}%,` +
        `product_name.ilike.%${search}%,` +
        `supplier.ilike.%${search}%,` +
        `order_number.ilike.%${search}%`
      );
    }

    // Apply order type filter
    if (filterType) {
      query = query.eq('order_type', filterType);
    }

    // Get total count with filters applied
    const { count, error: countError } = await query;

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Fetch paginated data with filters
    let dataQuery = supabaseAdmin.from('orders').select('*');

    // Apply same filters to data query
    if (search) {
      dataQuery = dataQuery.or(
        `project_id.ilike.%${search}%,` +
        `order_id.ilike.%${search}%,` +
        `product.ilike.%${search}%,` +
        `product_name.ilike.%${search}%,` +
        `supplier.ilike.%${search}%,` +
        `order_number.ilike.%${search}%`
      );
    }

    if (filterType) {
      dataQuery = dataQuery.eq('order_type', filterType);
    }

    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      data,
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
