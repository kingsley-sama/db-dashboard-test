import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { ColumnFilterMap } from '@/lib/column-filters';

// ---------------------------------------------------------------------------
// Distinct values for the multi-select column filters.
//
// The dropdowns used to build their options from whichever rows the table had
// loaded, so they only ever offered values found in that page. These endpoints
// return the distinct values across the whole table instead.
// ---------------------------------------------------------------------------

/** Rows scanned per request while collecting values. */
const CHUNK = 1000;
/**
 * Ceiling on rows scanned. These columns are low-cardinality enums, so the
 * distinct set saturates long before this; the cap just bounds the work on a
 * table that grows unexpectedly large.
 */
const MAX_ROWS = 50_000;
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { values: string[]; expires: number }>();

export type FilterOptionsConfig = {
  table: string;
  meta: ColumnFilterMap;
  /**
   * Applied before any scanning so the values offered never leak rows the user
   * cannot see. Mirrors the parent route's gating.
   */
  restrict?: (query: any) => any;
  /** Extra select needed by `restrict` (e.g. an inner join to filter on). */
  extraSelect?: string;
  /** Distinguishes cache entries whose visible rows differ (e.g. by role). */
  cacheScope?: string;
};

/**
 * Handles GET ?column=<key>, returning `{ values }` sorted for display.
 *
 * `column` arrives from the client and is interpolated into the query, so it is
 * resolved through the same whitelist the filters use — never passed through.
 */
export async function getFilterOptions(
  request: Request,
  { table, meta, restrict, extraSelect, cacheScope = '' }: FilterOptionsConfig
) {
  const key = new URL(request.url).searchParams.get('column') || '';
  const entry = meta[key];

  if (!entry) {
    return NextResponse.json({ error: 'Unknown column' }, { status: 400 });
  }
  // Embedded columns live on a joined table and would need that join here; no
  // multi-select column is embedded, so reject rather than half-support it.
  if (entry.embed) {
    return NextResponse.json({ error: 'Column is not filterable by value' }, { status: 400 });
  }

  const cacheKey = `${table}:${cacheScope}:${entry.column}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ values: cached.values }, { status: 200 });
  }

  const select = extraSelect ? `${entry.column}, ${extraSelect}` : entry.column;
  const values = new Set<string>();

  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK) {
    let query = supabaseAdmin.from(table).select(select);
    if (restrict) query = restrict(query);

    // Ordering keeps paging stable; skipping nulls keeps "-" out of the list.
    const { data, error } = await query
      .not(entry.column, 'is', null)
      .order(entry.column, { ascending: true })
      .range(offset, offset + CHUNK - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of (data || []) as any[]) {
      const value = row[entry.column];
      if (value !== null && value !== undefined && value !== '') {
        values.add(String(value));
      }
    }

    if (!data || data.length < CHUNK) break;
  }

  const sorted = Array.from(values).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  cache.set(cacheKey, { values: sorted, expires: Date.now() + CACHE_TTL_MS });

  return NextResponse.json({ values: sorted }, { status: 200 });
}
