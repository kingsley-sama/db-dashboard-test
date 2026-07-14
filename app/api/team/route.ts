import { getUser, getTeamForUser } from '@/lib/db/queries';

export async function GET() {
  // APMs have no access to the Teams module (member list, subscription info)
  const user = await getUser();
  if (user?.role === 'apm') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const team = await getTeamForUser();
  return Response.json(team);
}
