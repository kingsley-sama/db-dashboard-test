import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { ProjectOrdersClient } from './project-orders-client';

export default async function ProjectOrdersPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  // The view exposes order financials, so it follows All Orders: no APM access.
  if (user.role === 'apm') {
    redirect('/dashboard/orders');
  }

  return <ProjectOrdersClient />;
}
