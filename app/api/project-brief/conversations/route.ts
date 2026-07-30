import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { summarizeEntry } from '@/lib/project-brief/entries';

// GET /api/project-brief/conversations - The user's brief threads, one per
// project, newest activity first. Powers the history sidebar: each thread is a
// conversation, not a single brief. Entry metadata is included (so the sidebar
// can show status and counts) but result payloads are not — those come from
// /api/project-brief/conversations/[projectId].
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('brief_conversations')
      .select('project_id, project_name, entries, created_at, updated_at')
      .eq('user_email', user.email)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const conversations = (data || []).map((thread) => {
      const entries = (thread.entries as any[]) || [];
      return {
        project_id: thread.project_id,
        project_name: thread.project_name,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        entry_count: entries.length,
        entries: entries.map(summarizeEntry)
      };
    });

    return NextResponse.json({ data: conversations }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
