// ---------------------------------------------------------------------------
// Builds a supplier invoice live from the orders table. Read-only: nothing is
// saved, so the preview and the PDF are the same call run twice and always
// agree.
//
// Billable orders: this supplier, a product of the chosen view type, and a
// date_first_delivery_complete inside the range (both ends included). Orders
// without that date are never billed.
// ---------------------------------------------------------------------------

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateInvoice, type InvoiceCalculation, type InvoiceOrderInput } from './calculate.ts';
import { PRODUCTS_BY_VIEW_TYPE, resolveCategory, type CategorySource } from './categorize.ts';
import { getCompanyParty, getPaymentTerms, getSupplierParty, type Party } from './parties.ts';
import { PRICE_ROWS, VIEW_TYPE_LABELS, hasPricesFor } from './pricing.ts';
import { invoiceReference, type InvoiceRequest } from './request.ts';

/** The orders column that marks an order as delivered and billable. */
export const BILLABLE_DATE_COLUMN = 'date_first_delivery_complete';

export type InvoiceOrder = InvoiceOrderInput & { categorySource: CategorySource | null };

export type InvoiceDocument = {
  reference: string;
  request: InvoiceRequest;
  viewTypeLabel: string;
  issuedOn: string;
  from: Party;
  billTo: Party;
  paymentTerms: string;
  pricesDefined: boolean;
  calculation: InvoiceCalculation<InvoiceOrder>;
};

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export async function buildInvoice(request: InvoiceRequest): Promise<InvoiceDocument> {
  const { data: rows, error } = await supabaseAdmin
    .from('orders')
    .select(
      `id, order_id, project_id, product, quantity, supplier, comments, ${BILLABLE_DATE_COLUMN}, projects(project_name, property_type)`
    )
    .eq('supplier', request.supplier)
    .in('product', [...PRODUCTS_BY_VIEW_TYPE[request.viewType]])
    .not(BILLABLE_DATE_COLUMN, 'is', null)
    .gte(BILLABLE_DATE_COLUMN, request.startDate)
    .lte(BILLABLE_DATE_COLUMN, request.endDate)
    .order('project_id', { ascending: true })
    .order(BILLABLE_DATE_COLUMN, { ascending: true })
    .order('id', { ascending: true })
    .range(0, 4999);

  if (error) throw new Error(error.message);
  const orders = (rows ?? []) as any[];

  // Proposal building type per project — latest proposal wins. proposals has
  // no foreign key to projects, so this is a second lookup, not an embed.
  const projectIds = [...new Set(orders.map((o) => o.project_id).filter(Boolean))];
  const proposalTypes = new Map<string, string | null>();
  if (projectIds.length > 0 && request.viewType === 'exterior') {
    const { data: proposals, error: proposalError } = await supabaseAdmin
      .from('proposals')
      .select('project_id, project_type, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });
    if (proposalError) throw new Error(proposalError.message);
    for (const p of proposals ?? []) {
      if (!proposalTypes.has(p.project_id)) proposalTypes.set(p.project_id, p.project_type);
    }
  }

  const inputs: InvoiceOrder[] = orders.map((o) => {
    const project = one(o.projects) as { project_name?: string | null; property_type?: string | null } | null;
    const resolution = resolveCategory({
      viewType: request.viewType,
      proposalProjectType: proposalTypes.get(o.project_id) ?? null,
      projectName: project?.project_name ?? null,
      propertyType: project?.property_type ?? null,
      comments: o.comments,
    });
    return {
      id: Number(o.id),
      orderRef: o.order_id || `#${o.id}`,
      projectId: o.project_id,
      projectName: project?.project_name ?? null,
      viewType: request.viewType,
      categoryKey: resolution.categoryKey,
      categoryAssumed: resolution.assumed,
      categorySource: resolution.source,
      quantity: o.quantity === null || o.quantity === undefined ? null : Number(o.quantity),
      deliveryDate: String(o[BILLABLE_DATE_COLUMN]).slice(0, 10),
      product: o.product,
    };
  });

  const calculation = calculateInvoice(inputs, PRICE_ROWS);

  return {
    reference: invoiceReference(request),
    request,
    viewTypeLabel: VIEW_TYPE_LABELS[request.viewType],
    issuedOn: new Date().toISOString().slice(0, 10),
    from: getSupplierParty(request.supplier),
    billTo: getCompanyParty(),
    paymentTerms: getPaymentTerms(),
    pricesDefined: hasPricesFor(request.viewType),
    calculation,
  };
}

/** Suppliers that have at least one exterior or interior order. */
export async function listInvoiceSuppliers(): Promise<string[]> {
  const products = [...PRODUCTS_BY_VIEW_TYPE.exterior, ...PRODUCTS_BY_VIEW_TYPE.interior];
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('supplier')
    .in('product', products)
    .not('supplier', 'is', null)
    .range(0, 9999);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r: any) => String(r.supplier).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
