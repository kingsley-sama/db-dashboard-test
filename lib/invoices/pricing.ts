// ---------------------------------------------------------------------------
// Supplier invoice pricing — the price sheets, kept in code on purpose.
//
// Nothing here is stored in the database: to change a price, edit the row
// below and deploy. To change a price *from a date on* without touching orders
// already delivered, close the old row with `effectiveTo` and add a new row
// with the same category and the new `effectiveFrom`. calculateInvoice picks
// the row where effectiveFrom <= delivery date < effectiveTo.
//
// Money is integer euro cents throughout — never floating point.
// ---------------------------------------------------------------------------

export type ViewType = 'exterior' | 'interior';

export const VIEW_TYPES: readonly ViewType[] = ['exterior', 'interior'];

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
};

export type PriceRow = {
  /** Matches the category key calculateInvoice receives for the order. */
  categoryKey: string;
  viewType: ViewType;
  /** Cents. null = no price agreed yet; orders in this category are skipped. */
  modellingFee: number | null;
  primaryViewPrice: number | null;
  additionalViewPrice: number | null;
  currency: 'EUR';
  /** Inclusive, YYYY-MM-DD. */
  effectiveFrom: string;
  /** Exclusive, YYYY-MM-DD. null = still in force. */
  effectiveTo: string | null;
};

// Exterior sheet: priced by building type.
export const EXTERIOR_CATEGORIES = {
  SFH: 'SFH',
  LOW_RISE: 'Low-Rise & Duplex',
  HIGH_RISE: 'High-Rise & Residential Complex',
  COMMERCIAL: 'Commercial & Mixed-Use',
} as const;

// Interior sheet: priced by room.
export const INTERIOR_CATEGORIES = {
  LIVING: 'Living Areas',
  KITCHENS: 'Kitchens',
  BEDROOMS: 'Bedrooms',
  BATHROOMS: 'Bathrooms & Wellness',
  FUNCTIONAL: 'Functional Spaces',
  OUTDOOR: 'Outdoor Living Spaces',
  HOSPITALITY: 'Hospitality & Commercial',
} as const;

/** Long names from the "Project Category" column, for the invoice lines. */
export const CATEGORY_LABELS: Record<string, string> = {
  [EXTERIOR_CATEGORIES.SFH]: 'Single-Family Dwelling (SFH)',
  [EXTERIOR_CATEGORIES.LOW_RISE]: 'Duplex / Low-Rise Residential',
  [EXTERIOR_CATEGORIES.HIGH_RISE]: 'Mid- to High-Rise / Multi-Building',
  [EXTERIOR_CATEGORIES.COMMERCIAL]: 'Commercial & Mixed-Use Projects',
  [INTERIOR_CATEGORIES.LIVING]: 'Living Areas',
  [INTERIOR_CATEGORIES.KITCHENS]: 'Kitchens',
  [INTERIOR_CATEGORIES.BEDROOMS]: 'Bedrooms',
  [INTERIOR_CATEGORIES.BATHROOMS]: 'Bathrooms & Wellness',
  [INTERIOR_CATEGORIES.FUNCTIONAL]: 'Functional Spaces',
  [INTERIOR_CATEGORIES.OUTDOOR]: 'Outdoor Living Spaces',
  [INTERIOR_CATEGORIES.HOSPITALITY]: 'Hospitality & Commercial',
};

const SHEET_START = '2020-01-01';

function row(
  categoryKey: string,
  viewType: ViewType,
  modellingFee: number | null,
  primaryViewPrice: number | null,
  additionalViewPrice: number | null
): PriceRow {
  return {
    categoryKey,
    viewType,
    modellingFee,
    primaryViewPrice,
    additionalViewPrice,
    currency: 'EUR',
    effectiveFrom: SHEET_START,
    effectiveTo: null,
  };
}

export const PRICE_ROWS: readonly PriceRow[] = [
  //                                                       modelling  primary  additional
  row(EXTERIOR_CATEGORIES.SFH, 'exterior',                     1800,     500,      500),
  row(EXTERIOR_CATEGORIES.LOW_RISE, 'exterior',                2400,     800,      500),
  row(EXTERIOR_CATEGORIES.HIGH_RISE, 'exterior',               3600,    1000,      500),
  row(EXTERIOR_CATEGORIES.COMMERCIAL, 'exterior',              null,    null,     null),

  row(INTERIOR_CATEGORIES.LIVING, 'interior',                  1500,    1000,      500),
  row(INTERIOR_CATEGORIES.KITCHENS, 'interior',                1500,    1000,      500),
  row(INTERIOR_CATEGORIES.BEDROOMS, 'interior',                1000,     600,      500),
  row(INTERIOR_CATEGORIES.BATHROOMS, 'interior',               1000,     600,      500),
  row(INTERIOR_CATEGORIES.FUNCTIONAL, 'interior',              1000,     600,      500),
  row(INTERIOR_CATEGORIES.OUTDOOR, 'interior',                 1000,     700,      500),
  row(INTERIOR_CATEGORIES.HOSPITALITY, 'interior',             1500,    1000,      500),
];

/** True when at least one category of this view type has a full price set. */
export function hasPricesFor(viewType: ViewType, rows: readonly PriceRow[] = PRICE_ROWS) {
  return rows.some(
    (r) =>
      r.viewType === viewType &&
      r.modellingFee !== null &&
      r.primaryViewPrice !== null &&
      r.additionalViewPrice !== null
  );
}
