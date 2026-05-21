import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { DashboardShell } from './dashboard-shell';

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
