import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/my-app-auth';
import { buildInvoice } from '@/lib/invoices/build';
import { renderInvoicePdf } from '@/lib/invoices/pdf';
import { canUseInvoices, invoiceRequestSchema } from '@/lib/invoices/request';

// react-pdf needs the Node runtime.
export const runtime = 'nodejs';

// GET /api/invoices/pdf?supplier=&viewType=&startDate=&endDate=[&inline=1] —
// the same invoice the preview shows, as an A4 PDF. inline=1 opens it in the
// browser instead of saving it.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canUseInvoices(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { inline, ...params } = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = invoiceRequestSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const invoice = await buildInvoice(parsed.data);
    if (invoice.calculation.lines.length === 0) {
      return NextResponse.json({ error: 'There are no billable orders for this invoice.' }, { status: 409 });
    }

    const pdf = await renderInvoicePdf(invoice);
    // The reference already carries the supplier slug.
    const filename = `INV-${invoice.reference}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
