// ---------------------------------------------------------------------------
// calculateInvoice — turns orders into invoice lines. Pure: no database, no
// clock, so it is unit-tested directly (tests/invoice-calculate.test.ts).
//
// Each order row is one order; its quantity is the number of views in it.
//
//   order total = modelling fee
//               + primary view price
//               + (quantity - 1) × additional view price
//
// Orders that can't be priced are skipped with a reason instead of failing the
// whole invoice. All amounts are integer cents.
// ---------------------------------------------------------------------------

import { CATEGORY_LABELS, VIEW_TYPE_LABELS, type PriceRow, type ViewType } from './pricing.ts';

export type InvoiceOrderInput = {
  /** orders.id */
  id: number;
  /** Human-readable order reference (orders.order_id, falling back to the id). */
  orderRef: string;
  projectId: string;
  projectName: string | null;
  viewType: ViewType;
  /** Resolved price category; null when nothing could decide it. */
  categoryKey: string | null;
  categoryAssumed?: boolean;
  quantity: number | null;
  /** YYYY-MM-DD, the billable delivery date. */
  deliveryDate: string;
  product?: string | null;
};

export type ChargeType = 'modelling' | 'primary_view' | 'additional_view';

export type InvoiceCharge = {
  chargeType: ChargeType;
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type InvoiceLine<O extends InvoiceOrderInput = InvoiceOrderInput> = {
  order: O;
  categoryKey: string;
  categoryLabel: string;
  charges: InvoiceCharge[];
  total: number;
};

export type SkippedOrder<O extends InvoiceOrderInput = InvoiceOrderInput> = {
  order: O;
  reason: string;
};

export type InvoiceCalculation<O extends InvoiceOrderInput = InvoiceOrderInput> = {
  lines: InvoiceLine<O>[];
  skipped: SkippedOrder<O>[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  orderCount: number;
  viewCount: number;
};

const CHARGE_LABELS: Record<ChargeType, string> = {
  modelling: 'Modelling fee',
  primary_view: 'Primary view',
  additional_view: 'Additional views',
};

function findPriceRow(
  rows: readonly PriceRow[],
  categoryKey: string,
  viewType: ViewType,
  deliveryDate: string
): { status: 'unknown' } | { status: 'no-price' } | { status: 'ok'; row: PriceRow } {
  const candidates = rows.filter((r) => r.categoryKey === categoryKey && r.viewType === viewType);
  if (candidates.length === 0) {
    // The category isn't on this view type's sheet at all.
    return { status: 'unknown' };
  }

  // YYYY-MM-DD strings compare correctly as text.
  const row = candidates.find(
    (r) => r.effectiveFrom <= deliveryDate && (r.effectiveTo === null || deliveryDate < r.effectiveTo)
  );
  if (!row || row.modellingFee === null || row.primaryViewPrice === null || row.additionalViewPrice === null) {
    return { status: 'no-price' };
  }
  return { status: 'ok', row };
}

function isWholePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function calculateInvoice<O extends InvoiceOrderInput>(
  orders: readonly O[],
  priceRows: readonly PriceRow[],
  options: { vatRate?: number } = {}
): InvoiceCalculation<O> {
  const lines: InvoiceLine<O>[] = [];
  const skipped: SkippedOrder<O>[] = [];

  for (const order of orders) {
    if (!isWholePositive(order.quantity)) {
      const shown = order.quantity === null || order.quantity === undefined ? 'empty' : String(order.quantity);
      skipped.push({ order, reason: `Order ${order.orderRef} has no views (quantity is ${shown}).` });
      continue;
    }

    if (!order.categoryKey) {
      skipped.push({
        order,
        reason: `Project ${order.projectId} has no proposal, so its category is unknown.`,
      });
      continue;
    }

    const lookup = findPriceRow(priceRows, order.categoryKey, order.viewType, order.deliveryDate);
    if (lookup.status === 'unknown') {
      skipped.push({ order, reason: `Unknown category '${order.categoryKey}'.` });
      continue;
    }
    if (lookup.status === 'no-price') {
      const label = CATEGORY_LABELS[order.categoryKey] ?? order.categoryKey;
      skipped.push({
        order,
        reason: `No price set for ${label} (${VIEW_TYPE_LABELS[order.viewType]}).`,
      });
      continue;
    }

    const { row } = lookup;
    // Non-null: findPriceRow only returns 'ok' when all three prices are set.
    const modelling = row.modellingFee!;
    const primary = row.primaryViewPrice!;
    const additional = row.additionalViewPrice!;
    const additionalViews = order.quantity - 1;

    const charges: InvoiceCharge[] = [
      { chargeType: 'modelling', label: CHARGE_LABELS.modelling, quantity: 1, unitPrice: modelling, amount: modelling },
      { chargeType: 'primary_view', label: CHARGE_LABELS.primary_view, quantity: 1, unitPrice: primary, amount: primary },
    ];
    if (additionalViews > 0) {
      charges.push({
        chargeType: 'additional_view',
        label: CHARGE_LABELS.additional_view,
        quantity: additionalViews,
        unitPrice: additional,
        amount: additionalViews * additional,
      });
    }

    lines.push({
      order,
      categoryKey: order.categoryKey,
      categoryLabel: CATEGORY_LABELS[order.categoryKey] ?? order.categoryKey,
      charges,
      total: charges.reduce((sum, c) => sum + c.amount, 0),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const vatRate = options.vatRate ?? 0;
  // Rate is a percentage; round half up to whole cents.
  const vatAmount = Math.round((subtotal * vatRate) / 100);

  return {
    lines,
    skipped,
    subtotal,
    vatRate,
    vatAmount,
    total: subtotal + vatAmount,
    orderCount: lines.length,
    viewCount: lines.reduce((sum, line) => sum + (line.order.quantity ?? 0), 0),
  };
}

/** €1,234.56 — the one money format for the preview and the PDF. */
export function formatEuro(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}€${euros}.${rest}`;
}
