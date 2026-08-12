import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { ALL_ORDERS_FILTER_COLUMNS } from '@/lib/column-filters';
import { getFilterOptions } from '@/lib/filter-options';

// GET /api/all-orders/filter-options?column=PM — distinct values across the
// whole all_orders table, for the column dropdowns.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // APMs have no access to the All Orders module, same as the parent route.
  if (user.role === 'apm') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return getFilterOptions(request, {
    table: 'all_orders',
    meta: ALL_ORDERS_FILTER_COLUMNS,
  });
}
