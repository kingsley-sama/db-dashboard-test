// ---------------------------------------------------------------------------
// Which view type and which price category an order falls under — worked out
// in code from data the order already carries. Nothing is stored.
//
// The orders table has no view type and no category column, so both are
// derived on every request:
//
//   view type  ← orders.product
//   exterior   ← proposal project_type → project name keywords →
//                projects.property_type → default
//   interior   ← order comment keywords → projects.property_type → default
//
// Whenever a step past the first real signal decides the category, the line is
// flagged `assumed` so the preview can say so.
// ---------------------------------------------------------------------------

import {
  EXTERIOR_CATEGORIES,
  INTERIOR_CATEGORIES,
  type ViewType,
} from './pricing.ts';

/** orders.product values billed under each view type. Every other product is never invoiced here. */
export const PRODUCTS_BY_VIEW_TYPE: Record<ViewType, readonly string[]> = {
  exterior: ['Exterior rendering', 'Exterior rendering Bird View'],
  interior: ['Interior rendering'],
};

export function viewTypeOfProduct(product: string | null | undefined): ViewType | null {
  if (!product) return null;
  const value = product.trim().toLowerCase();
  for (const viewType of Object.keys(PRODUCTS_BY_VIEW_TYPE) as ViewType[]) {
    if (PRODUCTS_BY_VIEW_TYPE[viewType].some((p) => p.toLowerCase() === value)) {
      return viewType;
    }
  }
  return null;
}

// proposals.project_type values (the proposal generator's building types and
// its older project-type list) → exterior price category.
const PROPOSAL_TYPE_TO_EXTERIOR: Record<string, string> = {
  efh: EXTERIOR_CATEGORIES.SFH,
  einfamilienhaus: EXTERIOR_CATEGORIES.SFH,
  dhh: EXTERIOR_CATEGORIES.LOW_RISE,
  'mfh-3-5': EXTERIOR_CATEGORIES.HIGH_RISE,
  'mfh-6-10': EXTERIOR_CATEGORIES.HIGH_RISE,
  'mfh-11-15': EXTERIOR_CATEGORIES.HIGH_RISE,
  mehrfamilienhaus: EXTERIOR_CATEGORIES.HIGH_RISE,
  wohnanlage: EXTERIOR_CATEGORIES.HIGH_RISE,
  gewerbeimmobilie: EXTERIOR_CATEGORIES.COMMERCIAL,
  'bürogebäude': EXTERIOR_CATEGORIES.COMMERCIAL,
  hotel: EXTERIOR_CATEGORIES.COMMERCIAL,
  einzelhandel: EXTERIOR_CATEGORIES.COMMERCIAL,
  'industriegebäude': EXTERIOR_CATEGORIES.COMMERCIAL,
  'mixed-use': EXTERIOR_CATEGORIES.COMMERCIAL,
  // 'Custom' deliberately absent: it says nothing about the building.
};

// Building-type words in a project name ("MFH, Otto-Wanner-Straße"). Checked
// in order; the first hit wins.
const PROJECT_NAME_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(mfh|mehrfamilienh\w*|wohnanlage|wohnquartier|quartier)\b/i, EXTERIOR_CATEGORIES.HIGH_RISE],
  [/\b(dhh|doppelh\w*|reihenh\w*)\b/i, EXTERIOR_CATEGORIES.LOW_RISE],
  [/\b(efh|einfamilienh\w*)\b/i, EXTERIOR_CATEGORIES.SFH],
];

// Room words in an interior order's comment ("Change of POV living room").
// English and German, since both appear in the data.
const ROOM_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(bath\w*|badezimmer|bad|wc|toilet\w*|powder room|spa|sauna|wellness)\b/i, INTERIOR_CATEGORIES.BATHROOMS],
  [/\b(kitchens?|küche\w*|kueche\w*)\b/i, INTERIOR_CATEGORIES.KITCHENS],
  [/\b(bed ?rooms?|schlafzimmer|kinderzimmer|nursery|gästezimmer)\b/i, INTERIOR_CATEGORIES.BEDROOMS],
  [/\b(living( room| area)?|wohnzimmer|wohnbereich|lounge|tv room|family room|dining( room)?|esszimmer)\b/i, INTERIOR_CATEGORIES.LIVING],
  [/\b(home office|study|library|hallway|foyer|entrance|stair\w*|flur|diele|treppenhaus|arbeitszimmer)\b/i, INTERIOR_CATEGORIES.FUNCTIONAL],
  [/\b(balcon\w*|terrace|rooftop|patio|veranda|loggia|balkon|terrasse|dachterrasse)\b/i, INTERIOR_CATEGORIES.OUTDOOR],
  [/\b(office|reception|meeting room|hotel\w*|lobby|restaurant|retail|shop|empfang|besprechungsraum)\b/i, INTERIOR_CATEGORIES.HOSPITALITY],
];

/** Used when nothing about the order points to a category. */
export const DEFAULT_CATEGORY: Record<ViewType, string> = {
  exterior: EXTERIOR_CATEGORIES.SFH,
  interior: INTERIOR_CATEGORIES.LIVING,
};

export type CategorySource =
  | 'proposal'
  | 'project-name'
  | 'comment'
  | 'property-type'
  | 'default';

export type CategoryResolution = {
  categoryKey: string;
  source: CategorySource;
  /** True when no direct signal decided it — shown as "assumed" on the preview. */
  assumed: boolean;
};

export type CategorizeInput = {
  viewType: ViewType;
  /** proposals.project_type for the order's project, if a proposal exists. */
  proposalProjectType?: string | null;
  /** projects.project_name */
  projectName?: string | null;
  /** projects.property_type: 'Residential' | 'Commercial' */
  propertyType?: string | null;
  /** orders.comments */
  comments?: string | null;
};

function firstKeywordMatch(
  text: string | null | undefined,
  table: ReadonlyArray<[RegExp, string]>
): string | null {
  if (!text) return null;
  // Earliest mention in the text wins, so "living room and bathroom" is the
  // living room — the order was usually written around its first room.
  let best: { index: number; category: string } | null = null;
  for (const [pattern, category] of table) {
    const match = pattern.exec(text);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, category };
    }
  }
  return best?.category ?? null;
}

const isCommercial = (propertyType: string | null | undefined) =>
  (propertyType ?? '').trim().toLowerCase() === 'commercial';

export function resolveCategory(input: CategorizeInput): CategoryResolution {
  if (input.viewType === 'exterior') {
    const fromProposal = input.proposalProjectType
      ? PROPOSAL_TYPE_TO_EXTERIOR[input.proposalProjectType.trim().toLowerCase()]
      : undefined;
    if (fromProposal) {
      return { categoryKey: fromProposal, source: 'proposal', assumed: false };
    }

    const fromName = firstKeywordMatch(input.projectName, PROJECT_NAME_KEYWORDS);
    if (fromName) {
      return { categoryKey: fromName, source: 'project-name', assumed: false };
    }

    if (isCommercial(input.propertyType)) {
      return { categoryKey: EXTERIOR_CATEGORIES.COMMERCIAL, source: 'property-type', assumed: false };
    }

    return { categoryKey: DEFAULT_CATEGORY.exterior, source: 'default', assumed: true };
  }

  const fromComment = firstKeywordMatch(input.comments, ROOM_KEYWORDS);
  if (fromComment) {
    return { categoryKey: fromComment, source: 'comment', assumed: false };
  }

  if (isCommercial(input.propertyType)) {
    return { categoryKey: INTERIOR_CATEGORIES.HOSPITALITY, source: 'property-type', assumed: true };
  }

  return { categoryKey: DEFAULT_CATEGORY.interior, source: 'default', assumed: true };
}
