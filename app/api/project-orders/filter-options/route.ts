import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { PROJECT_ORDERS_FILTER_COLUMNS } from '@/lib/column-filters';
import { getFilterOptions } from '@/lib/filter-options';

// GET /api/project-orders/filter-options?column=project_status — distinct
// values across project_orders_view, for the column dropdowns.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // The view exposes order financials, so it follows All Orders: no APM access.
  if (user.role === 'apm') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return getFilterOptions(request, {
    table: 'project_orders_view',
    meta: PROJECT_ORDERS_FILTER_COLUMNS,
  });
}
