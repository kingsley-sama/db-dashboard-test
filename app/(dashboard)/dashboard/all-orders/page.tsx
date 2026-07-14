import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { AllOrdersClient } from './all-orders-client';

export default async function AllOrdersPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  // APMs have no access to the All Orders module
  if (user.role === 'apm') {
    redirect('/dashboard/orders');
  }

  return <AllOrdersClient />;
}
