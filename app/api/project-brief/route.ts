import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/project-brief?search=... - Lightweight project search for the AI brief page.
// Unlike /api/projects this is available to every authenticated user (PMs, not just
// owners) and only exposes the fields needed to pick a project.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get('search') || '';
    if (!search.trim()) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    let query = supabaseAdmin
      .from('projects')
      .select('project_id, project_name, project_manager, project_status')
      .or(
        `project_id.ilike.%${search}%,` +
        `project_name.ilike.%${search}%,` +
        `project_manager.ilike.%${search}%`
      );

    // APMs only see projects still in progress; other roles see everything
    if (user.role === 'apm') {
      query = query.is('delivery_completion_date', null);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(8);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/project-brief - Trigger the n8n email-summary workflow for a project.
// Responds with the job_id from n8n's synchronous ack; the real result arrives
// later on /api/project-brief/callback and is polled via /api/project-brief/[jobId].
//
// The request is appended as a new entry on the user's single conversation row
// for this project (brief_conversations) — no row is created per brief.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await request.json();
    if (!project_id || typeof project_id !== 'string') {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('project_name, delivery_completion_date')
      .eq('project_id', project_id)
      .maybeSingle();
    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }

    // APMs have no access to completed projects, including their briefs
    if (user.role === 'apm' && project?.delivery_completion_date) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const webhookUrl = process.env.N8N_PROJECT_BRIEF_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_PROJECT_BRIEF_WEBHOOK_URL is not configured' },
        { status: 500 }
      );
    }

    // n8n requires an https:// callback it can reach. Prefer BASE_URL, but if
    // it's missing or not https (e.g. localhost, or a stale env var on the
    // host), fall back to the public origin of this very request.
    let baseUrl = process.env.BASE_URL || '';
    if (!baseUrl.startsWith('https://')) {
      const host =
        request.headers.get('x-forwarded-host') || request.headers.get('host');
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      if (host && !host.includes('localhost') && proto === 'https') {
        baseUrl = `https://${host}`;
      }
    }
    if (!baseUrl.startsWith('https://')) {
      return NextResponse.json(
        {
          error:
            'Cannot build an https:// callback URL. Set BASE_URL to the public https URL of this app (the n8n workflow rejects non-https callbacks), or use an https tunnel when testing locally.'
        },
        { status: 500 }
      );
    }
    const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/project-brief/callback`;

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id,
        callback_url: callbackUrl,
        requested_by: user.email
      })
    });

    if (!webhookResponse.ok) {
      const text = await webhookResponse.text();
      return NextResponse.json(
        { error: `Workflow trigger failed (${webhookResponse.status}): ${text}` },
        { status: 502 }
      );
    }

    const ack = await webhookResponse.json();
    if (!ack.job_id) {
      return NextResponse.json(
        { error: 'Workflow did not return a job_id' },
        { status: 502 }
      );
    }

    // Append this request to the user's existing thread for the project,
    // creating the thread on the first brief. The append happens inside the
    // database so two briefs queued at once can't overwrite each other.
    const entry = {
      job_id: ack.job_id,
      status: 'processing',
      error_code: null,
      request: {
        project_id,
        project_name: project?.project_name ?? null,
        text: 'Generate a project brief'
      },
      result_payload: null,
      callback_url: callbackUrl,
      created_at: new Date().toISOString(),
      completed_at: null
    };

    const { error: appendError } = await supabaseAdmin.rpc('append_brief_entry', {
      p_user_email: user.email,
      p_project_id: project_id,
      p_project_name: project?.project_name ?? null,
      p_entry: entry
    });

    if (appendError) {
      return NextResponse.json({ error: appendError.message }, { status: 500 });
    }

    return NextResponse.json(
      { job_id: ack.job_id, project_id, status: 'processing', entry },
      { status: 202 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
