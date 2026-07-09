import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/project-brief/callback - Receives the async result from the n8n
// email-summary workflow (success or error payload, see spec §10) and stores it
// on the job row so the frontend can pick it up by polling.
//
// This endpoint is called by n8n, not by a signed-in user, so it is authenticated
// with a shared secret header instead of the session cookie.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.N8N_CALLBACK_SECRET;
    if (secret && request.headers.get('x-callback-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const { job_id, project_id, status } = payload;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: 'job_id and status are required' },
        { status: 400 }
      );
    }

    // Upsert so a callback still lands even if the trigger-side insert failed.
    // project_id and callback_url are NOT NULL in the table, so provide
    // fallbacks for that insert path (callback_url = this endpoint itself).
    const { error } = await supabaseAdmin
      .from('email_summary_jobs')
      .upsert(
        {
          job_id,
          project_id: project_id ?? 'unknown',
          status,
          error_code: payload.error ?? null,
          callback_url: request.nextUrl.href,
          result_payload: payload,
          completed_at: new Date().toISOString()
        },
        { onConflict: 'job_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
