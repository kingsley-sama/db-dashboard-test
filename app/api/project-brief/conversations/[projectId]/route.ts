import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { renderableEntry } from '@/lib/project-brief/entries';

// GET /api/project-brief/conversations/[projectId] - The full brief thread for
// one project: every request the user has made for it, in order, each with its
// response. One row, one request — this is what the conversation view renders.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    const { data, error } = await supabaseAdmin
      .from('brief_conversations')
      .select('project_id, project_name, entries, created_at, updated_at')
      .eq('user_email', user.email)
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const entries = ((data.entries as any[]) || []).map(renderableEntry);

    return NextResponse.json(
      { data: { ...data, entries, entry_count: entries.length } },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/project-brief/conversations/[projectId] - Remove an entire thread
// (all briefs the user has run for that project) from their history.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    const { data, error } = await supabaseAdmin
      .from('brief_conversations')
      .delete()
      .eq('user_email', user.email)
      .eq('project_id', projectId)
      .select('project_id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
