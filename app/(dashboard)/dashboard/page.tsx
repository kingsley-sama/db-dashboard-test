import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { TeamSettingsClient } from './team-settings-client';

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  // APMs have no access to the Teams module
  if (user.role === 'apm') {
    redirect('/dashboard/orders');
  }

  return <TeamSettingsClient />;
}
