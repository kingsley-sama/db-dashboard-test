import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  buildProjectOrderUpdate,
  canEditProjectOrders,
  parseProjectPk,
} from '@/lib/project-order-edits';

// PUT /api/project-orders/[id] — edit one row of the Project Orders shared view
// without leaving it. [id] is the project's primary key (the view's own `id`,
// returned to the client as `project_pk`), because the fields this accepts live
// on `projects`.
//
// The accepted fields and the roles allowed to send them are in
// lib/project-order-edits.ts. Anything else is rejected: this is the shared
// view's narrow write path, not a second way to update a project.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canEditProjectOrders(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    // The route segment is interpolated into the query, so only a plain
    // positive integer gets through.
    const projectPk = parseProjectPk(id);
    if (projectPk === null) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    const result = buildProjectOrderUpdate(await request.json());
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .update(result.update)
      .eq('id', projectPk)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // An update that matched nothing is not a save — say so rather than letting
    // the table keep the value it optimistically painted in.
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
