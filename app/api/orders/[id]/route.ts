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

    // Separate project_id and project-only fields from order fields
    const { project_id, delivery_completion_date, ...orderFields } = body;

    // Sync questionnaire_received, deposit, and delivery_completion_date to the projects table
    const { questionnaire_received, deposit } = body;
    if ((questionnaire_received !== undefined || deposit !== undefined || delivery_completion_date !== undefined) && project_id) {
      const projectUpdate: Record<string, string | null> = {};
      if (questionnaire_received !== undefined) {
        projectUpdate.questionnaire_received = questionnaire_received || null;
      }
      if (deposit !== undefined) {
        projectUpdate.deposit = deposit || null;
      }
      if (delivery_completion_date !== undefined) {
        projectUpdate.delivery_completion_date = delivery_completion_date || null;
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
