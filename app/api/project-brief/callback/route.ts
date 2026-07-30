import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/project-brief/callback - Receives the async result from the n8n
// email-summary workflow (success or error payload, see spec §10) and merges it
// into the matching entry of the user's conversation thread
// (brief_conversations.entries), so the frontend can pick it up by polling.
//
// This endpoint is called by n8n, not by a signed-in user, so it is authenticated
// with a shared secret header instead of the session cookie.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.N8N_CALLBACK_SECRET;
    if (secret && request.headers.get('x-callback-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // n8n can deliver the payload wrapped in a one-element items array —
    // unwrap it so job_id/status/summary are found at the top level.
    const body = await request.json();
    const payload = Array.isArray(body) ? body[0] ?? {} : body;
    const { job_id, project_id, status } = payload;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: 'job_id and status are required' },
        { status: 400 }
      );
    }

    // A user can stop a brief while n8n is still working on it; when that
    // workflow eventually calls back, discard the result instead of
    // resurrecting the entry.
    const { data: threads } = await supabaseAdmin
      .from('brief_conversations')
      .select('entries')
      // Stringified: a JS array would be sent as a Postgres array literal,
      // not as the JSON that jsonb containment expects.
      .contains('entries', JSON.stringify([{ job_id }]))
      .limit(1);
    const existingEntry = (threads?.[0]?.entries as any[] | undefined)?.find(
      (e) => e.job_id === job_id
    );
    if (existingEntry?.status === 'stopped') {
      return NextResponse.json({ received: true, discarded: true }, { status: 200 });
    }

    // The entry is created when the brief is triggered, so a callback for an
    // unknown job_id has nowhere to land (e.g. a workflow replayed against a
    // thread the user has since deleted) — acknowledge it and move on rather
    // than resurrecting a thread we can't attribute to a user.
    const { data: updated, error } = await supabaseAdmin.rpc('update_brief_entry', {
      p_job_id: job_id,
      p_patch: {
        status,
        error_code: payload.error ?? null,
        result_payload: payload,
        completed_at: new Date().toISOString()
      }
    });

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
