// ---------------------------------------------------------------------------
// Per-column table filters, shared between the client tables and the API routes.
//
// This module must stay server-safe (no "use client", no React) because the
// route handlers import it. The filter *UI* and the client-side matchers live
// in components/data-table-filters.tsx, which re-exports the types below.
//
// Filters used to run in the browser over whichever page of rows happened to be
// loaded, so they only ever searched those rows. They are now serialized into a
// `columnFilters` query param and translated into Supabase/PostgREST conditions,
// so filtering, counting and pagination all happen across the whole table.
// ---------------------------------------------------------------------------

export type NumericOp = "=" | ">" | "<" | ">=" | "<="
export type FilterKind = "text" | "multi" | "numeric" | "date"

export type ColumnFilter =
  | { kind: "text"; value: string }
  | { kind: "multi"; values: string[] }
  | { kind: "numeric"; op: NumericOp; value: string }
  // `text` is what the user typed (mm/dd/yy or a range) and is kept so the input
  // round-trips. `from`/`to` are absolute ISO instants resolved in the browser's
  // timezone — the server compares those, never the text, because the cells are
  // rendered with toLocaleDateString() while Postgres stores UTC.
  | { kind: "date"; text: string; from?: string | null; to?: string | null }

export const defaultFilter = (kind: FilterKind): ColumnFilter => {
  switch (kind) {
    case "multi":
      return { kind: "multi", values: [] }
    case "numeric":
      return { kind: "numeric", op: "=", value: "" }
    case "date":
      return { kind: "date", text: "", from: null, to: null }
    default:
      return { kind: "text", value: "" }
  }
}

/** A filter only counts as active once it can actually narrow the result set. */
export const isFilterActive = (filter: ColumnFilter | undefined): boolean => {
  if (!filter) return false
  switch (filter.kind) {
    case "multi":
      return filter.values.length > 0
    case "numeric":
      // Half-typed input ("-", "1.") isn't a comparison yet.
      return toNumber(filter.value) !== null
    case "date":
      // Half-typed dates parse to no bounds; don't blank the table while typing.
      return Boolean(filter.from || filter.to)
    default:
      return filter.value.trim() !== ""
  }
}

// ---------------------------------------------------------------------------
// Column metadata — also the whitelist
// ---------------------------------------------------------------------------

export type FilterValueType = "text" | "enum" | "number" | "boolean" | "date"

export type ColumnFilterMeta = {
  /** Column to filter on, which is not always the key the table renders. */
  column: string
  type: FilterValueType
  /**
   * Set when the column lives on an embedded resource rather than the base
   * table. PostgREST nulls the embed instead of dropping the row unless the
   * join is `!inner`, so routes must check `needsInnerJoin` before building
   * their select.
   */
  embed?: string
}

export type ColumnFilterMap = Record<string, ColumnFilterMeta>

const t = (column: string): ColumnFilterMeta => ({ column, type: "text" })
const e = (column: string): ColumnFilterMeta => ({ column, type: "enum" })
const n = (column: string): ColumnFilterMeta => ({ column, type: "number" })
const d = (column: string): ColumnFilterMeta => ({ column, type: "date" })

/**
 * Columns shared by `orders` and `all_orders`. Keys match the `key` of the
 * DisplayField entries in components/orders-data-table.tsx; anything absent
 * here simply isn't filterable and is rejected server-side.
 */
const SHARED_ORDER_COLUMNS: ColumnFilterMap = {
  order_id: t("order_id"),
  order_number: t("order_number"),
  project_id: t("project_id"),
  company_name: t("company_name"),
  comments: t("comments"),

  order_status: e("order_status"),
  client_rating: e("client_rating"),
  product: e("product"),
  product_name: e("product_name"),
  PM: e("PM"),
  pm_type: e("pm_type"),
  supplier: e("supplier"),
  deposit: e("deposit"),
  customer_type: e("customer_type"),
  order_type: e("order_type"),
  product_type: e("product_type"),
  sale_type: e("sale_type"),
  // NOTE: stored as the text values "Yes"/"No"/"Pending" (see the create/edit
  // order dialogs), not a boolean — so it filters as an enum.
  supplier_payment: e("supplier_payment"),

  quantity: n("quantity"),
  cost: n("cost"),
  net_sum: n("net_sum"),
  gross_sum: n("gross_sum"),
  db_1: n("db_1"),
  roi: n("roi"),
  unit_price: n("unit_price"),
  discount: n("discount"),
  delay_first_delivery: n("delay_first_delivery"),
  delay_first_revision: n("delay_first_revision"),
  delay_second_revision: n("delay_second_revision"),
  // CAVEAT: the table *displays* a margin computed in the browser from
  // db_1 / net_sum, while this filters the stored profit_margin column. If the
  // two ever disagree, filtered rows will disagree with the cells.
  profit_margin: n("profit_margin"),

  date_information_complete: d("date_information_complete"),
  due_delivery_date: d("due_delivery_date"),
  delivery_1_date: d("delivery_1_date"),
  delivery_2_date: d("delivery_2_date"),
  delivery_3_date: d("delivery_3_date"),
  delivery_4_date: d("delivery_4_date"),
  date_first_delivery_complete: d("date_first_delivery_complete"),
  project_completion_date: d("project_completion_date"),
  created_at: d("created_at"),
  updated_at: d("updated_at"),
}

/**
 * /api/orders. customer_name, customer_email and project_name are overwritten
 * from the joined `projects` row before the response is sent, so they must be
 * filtered on the project columns the user actually sees.
 */
export const ORDERS_FILTER_COLUMNS: ColumnFilterMap = {
  ...SHARED_ORDER_COLUMNS,
  customer_name: { column: "projects.client_contact_name", type: "text", embed: "projects" },
  customer_email: { column: "projects.company_email", type: "text", embed: "projects" },
  project_name: { column: "projects.project_name", type: "text", embed: "projects" },
}

/** /api/all-orders — flat table, no join, so these are its own columns. */
export const ALL_ORDERS_FILTER_COLUMNS: ColumnFilterMap = {
  ...SHARED_ORDER_COLUMNS,
  customer_name: t("customer_name"),
  customer_email: t("customer_email"),
}

/** /api/project-orders — project_orders_view, projects left-joined to orders. */
export const PROJECT_ORDERS_FILTER_COLUMNS: ColumnFilterMap = {
  ...SHARED_ORDER_COLUMNS,
  customer_name: t("customer_name"),
  customer_email: t("customer_email"),
  project_name: t("project_name"),
  invoice_number: t("invoice_number"),
  client_contact_name: t("client_contact_name"),
  project_status: e("project_status"),
  project_type: e("project_type"),
  construction_type: e("construction_type"),
  property_type: e("property_type"),
  questionnaire_received: e("questionnaire_received"),
  first_or_next_project: e("first_or_next_project"),
  project_manager: e("project_manager"),
  sales_person: e("sales_person"),
}

// ---------------------------------------------------------------------------
// PostgREST value escaping
// ---------------------------------------------------------------------------

/**
 * Quote a value for use inside a PostgREST logical expression (`.or(...)`).
 *
 * Inside `or=(...)` a bare comma or paren ends the current condition, so any
 * value carrying one has to be double-quoted, with backslashes and quotes
 * escaped. Without this, searching for `Acme, Inc.` produces a malformed
 * expression and the request fails with a 400.
 *
 * Standalone filters (.eq/.ilike/.in) don't need this — supabase-js encodes
 * those itself.
 */
export const escapePostgrestValue = (value: string): string => {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return /[,()".\\:]/.test(value) ? `"${escaped}"` : escaped
}

/** Builds an `or=(...)` search expression matching `search` across `columns`. */
export const buildSearchFilter = (columns: string[], search: string): string =>
  columns.map((column) => `${column}.ilike.${escapePostgrestValue(`%${search}%`)}`).join(",")

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Serializes active filters for the `columnFilters` query param ("" if none). */
export const serializeColumnFilters = (
  filters: Record<string, ColumnFilter>
): string => {
  const active = Object.entries(filters).filter(([, filter]) => isFilterActive(filter))
  return active.length === 0 ? "" : JSON.stringify(Object.fromEntries(active))
}

/**
 * Parses and validates the `columnFilters` param. Anything malformed, inactive,
 * or not present in `meta` is dropped: column names arrive from the client and
 * are interpolated into queries, so the whitelist is the security boundary.
 */
export const parseColumnFilters = (
  raw: string | null,
  meta: ColumnFilterMap
): Record<string, ColumnFilter> => {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  const result: Record<string, ColumnFilter> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!meta[key]) continue
    const filter = validateFilter(value)
    if (filter && isFilterActive(filter)) result[key] = filter
  }
  return result
}

const NUMERIC_OPS: NumericOp[] = ["=", ">", "<", ">=", "<="]

const validateFilter = (value: unknown): ColumnFilter | null => {
  if (!value || typeof value !== "object") return null
  const filter = value as Record<string, unknown>

  switch (filter.kind) {
    case "text":
      return typeof filter.value === "string" ? { kind: "text", value: filter.value } : null
    case "multi":
      return Array.isArray(filter.values) && filter.values.every((v) => typeof v === "string")
        ? { kind: "multi", values: filter.values as string[] }
        : null
    case "numeric":
      return typeof filter.value === "string" &&
        NUMERIC_OPS.includes(filter.op as NumericOp)
        ? { kind: "numeric", op: filter.op as NumericOp, value: filter.value }
        : null
    case "date": {
      const from = typeof filter.from === "string" ? filter.from : null
      const to = typeof filter.to === "string" ? filter.to : null
      // Reject anything that isn't a real instant rather than letting Postgres
      // reject the whole query.
      if (from && isNaN(Date.parse(from))) return null
      if (to && isNaN(Date.parse(to))) return null
      return {
        kind: "date",
        text: typeof filter.text === "string" ? filter.text : "",
        from,
        to,
      }
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

/**
 * True when any active filter targets an embedded resource, meaning the route
 * has to switch that embed to `!inner` for the filter to drop rows.
 */
export const needsInnerJoin = (
  filters: Record<string, ColumnFilter>,
  meta: ColumnFilterMap,
  embed: string
): boolean =>
  Object.keys(filters).some((key) => meta[key]?.embed === embed)

/**
 * Strips formatting out of a typed number so the comparison uses the underlying
 * value: the inputs sit under cells rendered as "€1,234.56", "12.5%" or
 * "8 hours", and users type what they see.
 */
const toNumber = (raw: string): number | null => {
  const cleaned = raw.replace(/[^0-9.\-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

const NUMERIC_METHOD: Record<NumericOp, "eq" | "gt" | "lt" | "gte" | "lte"> = {
  "=": "eq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
}

/**
 * Chains every active filter onto a Supabase query builder. Callers must apply
 * their role gating before this, so user-supplied filters can only ever narrow
 * an already-restricted set, never widen it.
 *
 * Typed loosely because PostgREST's builder type changes with every chained
 * call and doesn't survive being threaded through a helper.
 */
export const applyColumnFilters = (
  query: any,
  filters: Record<string, ColumnFilter>,
  meta: ColumnFilterMap
): any => {
  let result = query

  for (const [key, filter] of Object.entries(filters)) {
    const column = meta[key]?.column
    if (!column) continue

    switch (filter.kind) {
      case "text":
        result = result.ilike(column, `%${filter.value.trim()}%`)
        break

      case "multi": {
        // "-" is what an empty cell renders as; picking it means "no value".
        const values = filter.values.filter((v) => v !== "-")
        const includesBlank = values.length !== filter.values.length
        if (values.length === 0) {
          if (includesBlank) result = result.is(column, null)
          break
        }
        if (includesBlank) {
          const list = values.map(escapePostgrestValue).join(",")
          result = result.or(`${column}.in.(${list}),${column}.is.null`)
        } else {
          result = result.in(column, values)
        }
        break
      }

      case "numeric": {
        const value = toNumber(filter.value)
        if (value === null) break
        result = result[NUMERIC_METHOD[filter.op]](column, value)
        break
      }

      case "date":
        // from/to are whole-day bounds resolved in the browser's timezone.
        if (filter.from) result = result.gte(column, filter.from)
        if (filter.to) result = result.lte(column, filter.to)
        break
    }
  }

  return result
}
