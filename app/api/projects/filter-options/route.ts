import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { PROJECTS_FILTER_COLUMNS } from '@/lib/column-filters';
import { getFilterOptions } from '@/lib/filter-options';

// GET /api/projects/filter-options?column=project_status — distinct values
// across all projects, so the column dropdowns aren't limited to the rows
// currently loaded.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Same gating as GET /api/projects.
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return getFilterOptions(request, {
    table: 'projects',
    meta: PROJECTS_FILTER_COLUMNS,
  });
}
