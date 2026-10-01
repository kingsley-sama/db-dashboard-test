// Invoice request parameters: who may ask, and what they may ask for.
//
// Supplier invoices expose what each supplier is paid, so they follow the
// narrowest money gate in the app: owners and admins only. There is no
// supplier login today (user_role is owner | admin | pm | apm), so the
// "supplier sees only their own invoices" rule has no users to apply to yet.

import { z } from 'zod';
import { VIEW_TYPES, type ViewType } from './pricing.ts';

const INVOICE_ROLES = new Set(['owner', 'admin']);

export function canUseInvoices(role: string | null | undefined) {
  return !!role && INVOICE_ROLES.has(role);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a valid date');

export const invoiceRequestSchema = z
  .object({
    supplier: z.string().trim().min(1, 'Choose a supplier').max(100),
    viewType: z.enum(VIEW_TYPES as [ViewType, ...ViewType[]]),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });

export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;

/** Stable reference for one supplier/view type/period, e.g. STUDIO98-EXT-20260901-20260930. */
export function invoiceReference(request: InvoiceRequest) {
  const slug = supplierSlug(request.supplier).toUpperCase();
  const view = request.viewType === 'exterior' ? 'EXT' : 'INT';
  const compact = (d: string) => d.replace(/-/g, '');
  return `${slug}-${view}-${compact(request.startDate)}-${compact(request.endDate)}`;
}

export function supplierSlug(supplier: string) {
  return (
    supplier
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'supplier'
  );
}
