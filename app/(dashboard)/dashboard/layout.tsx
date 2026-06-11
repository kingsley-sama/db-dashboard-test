import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { DashboardShell } from './dashboard-shell';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return <DashboardShell isOwner={user.role === 'owner'}>{children}</DashboardShell>;
}
