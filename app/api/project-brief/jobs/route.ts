import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { summarizeEntry } from '@/lib/project-brief/entries';

// GET /api/project-brief/jobs - Every brief the current user has run, flattened
// out of their conversation threads into a newest-first list. The queue survives
// navigating away: n8n works in the background and the results are waiting here
// when the user comes back.
//
// This is the feed the global notification poller uses; the brief page itself
// reads whole threads from /api/project-brief/conversations.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('brief_conversations')
      .select('project_id, entries')
      .eq('user_email', user.email)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobs = (data || [])
      .flatMap((thread) =>
        (((thread.entries as any[]) || []).map((entry) => ({
          ...summarizeEntry(entry),
          project_id: thread.project_id
        })))
      )
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )
      .slice(0, 50);

    return NextResponse.json({ data: jobs }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
