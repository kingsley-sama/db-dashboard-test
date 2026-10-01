import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { listInvoiceSuppliers } from '@/lib/invoices/build';
import { canUseInvoices } from '@/lib/invoices/request';
import { InvoicesClient } from './invoices-client';

export default async function InvoicesPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  // Supplier invoices show what each supplier is paid: owners and admins only,
  // the same gate the API applies.
  if (!canUseInvoices(user.role)) {
    redirect('/dashboard/orders');
  }

  return <InvoicesClient suppliers={await listInvoiceSuppliers()} />;
}
