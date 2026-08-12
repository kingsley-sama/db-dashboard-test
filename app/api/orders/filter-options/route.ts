import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { ORDERS_FILTER_COLUMNS } from '@/lib/column-filters';
import { getFilterOptions } from '@/lib/filter-options';

// Columns APMs never see in the table; they must not be able to enumerate their
// values here either.
const APM_HIDDEN_COLUMNS = ['net_sum', 'profit_margin'];

// GET /api/orders/filter-options?column=PM — distinct values across all orders,
// so the column dropdowns aren't limited to the rows currently loaded.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isApm = user.role === 'apm';
  if (isApm && APM_HIDDEN_COLUMNS.includes(request.nextUrl.searchParams.get('column') || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return getFilterOptions(request, {
    table: 'orders',
    meta: ORDERS_FILTER_COLUMNS,
    cacheScope: isApm ? 'apm' : 'all',
    // Same gating as GET /api/orders: APMs see only orders on live projects.
    extraSelect: isApm ? 'projects!inner(delivery_completion_date)' : undefined,
    restrict: isApm
      ? (query) =>
          query
            .is('projects.delivery_completion_date', null)
            .is('project_completion_date', null)
      : undefined,
  });
}
