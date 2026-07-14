import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

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

    const baseQuery = supabaseAdmin.from('all_orders').select('*', { count: 'exact' });

    let query = baseQuery;
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

    const { count, error: countError } = await query;
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    let dataQuery = supabaseAdmin.from('all_orders').select('*');

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

    const { data, error } = await dataQuery
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
