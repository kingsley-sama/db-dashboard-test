import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/projects/intake-preview/callback - receives the result of an intake
// DRY RUN from n8n.
//
// Called by n8n rather than a signed-in user, so it authenticates with the same
// shared secret as /api/project-brief/callback.
//
// This endpoint writes only project_intake_previews. It cannot create orders or
// ClickUp tasks and cannot start intake, so a spoofed or replayed call can at
// worst show a PM a wrong preview — never mutate a business record.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.N8N_CALLBACK_SECRET;
    if (secret && request.headers.get('x-callback-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // n8n can deliver the payload wrapped in a one-element items array.
    const body = await request.json();
    const payload = Array.isArray(body) ? body[0] ?? {} : body;
    const { job_id, status } = payload;

    if (!job_id || !status) {
      return NextResponse.json({ error: 'job_id and status are required' }, { status: 400 });
    }
    if (status !== 'completed' && status !== 'failed') {
      return NextResponse.json(
        { error: "status must be 'completed' or 'failed'" },
        { status: 400 }
      );
    }

    // Normalise to the shape the dialog renders. The dry-run branch emits the
    // output of "Order id generation", so product_name is the key the real run
    // would pass to claim_intake_order — the preview and the run name the same
    // orders because they come from the same node.
    const expectedOrders = Array.isArray(payload.expected_orders)
      ? payload.expected_orders.map((order: any) => ({
          product_name: order.product_name ?? order.projectType ?? null,
          task_name: order.task_name ?? order.projectName ?? null,
          quantity: order.quantity ?? order.viewCount ?? null,
          brief: order.brief ?? null
        }))
      : [];

    // Matching on job_id is what makes a stale run harmless: if the PM
    // requested a newer dry run, the row now carries a different job_id and
    // this update affects nothing.
    const { data: updated, error } = await supabaseAdmin
      .from('project_intake_previews')
      .update({
        status,
        expected_orders: expectedOrders,
        last_error: status === 'failed' ? payload.error ?? 'Dry run failed' : null,
        completed_at: new Date().toISOString()
      })
      .eq('job_id', job_id)
      .select('project_id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ received: true, unmatched: true }, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
