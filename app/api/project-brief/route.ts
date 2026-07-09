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

    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('project_id, project_name, project_manager, project_status')
      .or(
        `project_id.ilike.%${search}%,` +
        `project_name.ilike.%${search}%,` +
        `project_manager.ilike.%${search}%`
      )
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

    const webhookUrl = process.env.N8N_PROJECT_BRIEF_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_PROJECT_BRIEF_WEBHOOK_URL is not configured' },
        { status: 500 }
      );
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'BASE_URL is not configured' }, { status: 500 });
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

    const { error: insertError } = await supabaseAdmin
      .from('email_summary_jobs')
      .insert([{
        job_id: ack.job_id,
        project_id,
        status: 'processing',
        requested_by: user.email,
        callback_url: callbackUrl
      }]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(
      { job_id: ack.job_id, project_id, status: 'processing' },
      { status: 202 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
