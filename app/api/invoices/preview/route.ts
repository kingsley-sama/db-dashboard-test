import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { buildInvoice } from '@/lib/invoices/build';
import { canUseInvoices, invoiceRequestSchema } from '@/lib/invoices/request';

// POST /api/invoices/preview — body { supplier, viewType, startDate, endDate }.
// Builds the invoice live from the orders table; nothing is saved.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canUseInvoices(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = invoiceRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    return NextResponse.json({ data: await buildInvoice(parsed.data) }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
