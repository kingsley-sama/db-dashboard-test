import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/project-brief/[jobId] - Poll the status/result of a brief job
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

    const { data, error } = await supabaseAdmin
      .from('email_summary_jobs')
      .select('job_id, project_id, status, error_code, result_payload, created_at, completed_at')
      .eq('job_id', jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/project-brief/[jobId] - Stop a processing brief. The n8n workflow
// keeps running (there is no cancel webhook), but the job is marked stopped here
// and the callback endpoint discards any result that arrives for it later.
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

    const { data: job, error: fetchError } = await supabaseAdmin
      .from('email_summary_jobs')
      .select('job_id, status, requested_by')
      .eq('job_id', jobId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!job || job.requested_by !== user.email) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.status !== 'processing') {
      return NextResponse.json(
        { error: 'Only a processing brief can be stopped' },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from('email_summary_jobs')
      .update({ status: 'stopped', completed_at: new Date().toISOString() })
      .eq('job_id', jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job_id: jobId, status: 'stopped' }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/project-brief/[jobId] - Remove a brief (and its stored result)
// from the user's history.
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

    const { data, error } = await supabaseAdmin
      .from('email_summary_jobs')
      .delete()
      .eq('job_id', jobId)
      .eq('requested_by', user.email)
      .select('job_id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
