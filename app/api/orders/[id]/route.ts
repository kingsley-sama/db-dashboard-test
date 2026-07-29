import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

// PUT /api/orders/[id] - Update an order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = await params;

    // APMs have no access to orders belonging to completed projects
    if (user.role === 'apm') {
      const { data: existing, error: lookupError } = await supabaseAdmin
        .from('orders')
        .select('project_id, project_completion_date, projects(delivery_completion_date)')
        .eq('id', id)
        .single();
      if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }
      // Supabase types the embed as an array even for a to-one relation
      const projectEmbed: any = existing?.projects;
      const project = Array.isArray(projectEmbed) ? projectEmbed[0] : projectEmbed;
      // Ended if either the project's or the order's own end date is set
      if (project?.delivery_completion_date || existing?.project_completion_date) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Separate project_id and project-only fields from order fields.
    // date_first_delivery_complete stays in orderFields — it is an orders column.
    const { project_id, ...orderFields } = body;

    // Sync questionnaire_received and deposit to the projects table
    const { questionnaire_received, deposit } = body;
    if ((questionnaire_received !== undefined || deposit !== undefined) && project_id) {
      const projectUpdate: Record<string, string | null> = {};
      if (questionnaire_received !== undefined) {
        projectUpdate.questionnaire_received = questionnaire_received || null;
      }
      if (deposit !== undefined) {
        projectUpdate.deposit = deposit || null;
      }

      const { error: projectError } = await supabaseAdmin
        .from('projects')
        .update(projectUpdate)
        .eq('project_id', project_id);

      if (projectError) {
        return NextResponse.json({ error: `Failed to update project: ${projectError.message}` }, { status: 500 });
      }
    }

    // Update order (including questionnaire_received and deposit so the table stays in sync)
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update(orderFields)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/orders/[id] - Delete an order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Only owners and admins may delete orders
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Delete order using admin client
    const { error } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
