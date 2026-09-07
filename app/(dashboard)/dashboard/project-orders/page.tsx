import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { canEditProjectOrders } from '@/lib/project-order-edits';
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

  // Editing invoicing data from the shared view is narrower than reading it —
  // the same gate the API applies, so PMs never see an editor that would be
  // refused. See lib/project-order-edits.ts.
  return <ProjectOrdersClient canEdit={canEditProjectOrders(user.role)} />;
}
