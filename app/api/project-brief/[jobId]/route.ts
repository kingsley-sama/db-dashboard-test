import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

// Entries live inside the `entries` array of the user's brief_conversations row
// for a project; a job_id identifies one entry within that array. These routes
// address a single entry without touching the rest of the thread.

async function findEntry(userEmail: string, jobId: string) {
  const { data, error } = await supabaseAdmin
    .from('brief_conversations')
    .select('project_id, project_name, entries')
    .eq('user_email', userEmail)
    // Stringified on purpose: given a JS array, supabase-js emits a Postgres
    // array literal (cs.{...}) instead of JSON, which jsonb containment rejects.
    .contains('entries', JSON.stringify([{ job_id: jobId }]))
    .limit(1);

  if (error) throw new Error(error.message);
  const thread = data?.[0];
  if (!thread) return null;

  const entry = ((thread.entries as any[]) || []).find((e) => e.job_id === jobId);
  if (!entry) return null;

  return { thread, entry };
}

// GET /api/project-brief/[jobId] - Poll the status/result of a single brief.
// Returns the full stored payload (including the base64 email thread), which
// the conversation view omits — used for the download action and for polling a
// brief that is still processing.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const found = await findEntry(user.email, jobId);
    if (!found) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        data: {
          ...found.entry,
          project_id: found.thread.project_id,
          project_name: found.thread.project_name
        }
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/project-brief/[jobId] - Stop a processing brief. The n8n workflow
// keeps running (there is no cancel webhook), but the entry is marked stopped
// here and the callback endpoint discards any result that arrives for it later.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const found = await findEntry(user.email, jobId);
    if (!found) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (found.entry.status !== 'processing') {
      return NextResponse.json(
        { error: 'Only a processing brief can be stopped' },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.rpc('update_brief_entry', {
      p_job_id: jobId,
      p_patch: { status: 'stopped', completed_at: new Date().toISOString() },
      p_user_email: user.email
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job_id: jobId, status: 'stopped' }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/project-brief/[jobId] - Remove one request/response pair from the
// thread, leaving the rest of the conversation intact. If it was the only entry
// the thread row is removed too.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    const { data, error } = await supabaseAdmin.rpc('delete_brief_entry', {
      p_user_email: user.email,
      p_job_id: jobId
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
