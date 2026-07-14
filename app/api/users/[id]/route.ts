import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { supabaseAdmin } from '@/lib/supabase';

// Must match the public.user_role enum in the database
const USER_ROLES = ['owner', 'admin', 'pm', 'apm'];

// PATCH /api/users/[id] - Update a user's role (owner only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    const { role } = await request.json();
    if (!USER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${USER_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .is('deleted_at', null)
      .select('id, name, email, role');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ data: data[0] }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/users/[id] - Soft-delete a user's account (owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json(
        {
          error:
            'You cannot delete your own account from here. Use the Delete Account section below instead.'
        },
        { status: 400 }
      );
    }

    const { data: target, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Soft delete; suffix the email so it stays unique and can be re-registered
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        email: `${target.email}-${target.id}-deleted`
      })
      .eq('id', userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin.from('team_members').delete().eq('user_id', userId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
