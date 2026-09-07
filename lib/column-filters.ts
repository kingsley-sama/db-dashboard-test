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
//
// Every filter kind carries an operator (`op`). It is optional and defaults to
// the behaviour the table has always had — contains / is any of / on-or-between
// — so filters persisted before operators existed keep working unchanged.
// ---------------------------------------------------------------------------

/** Comparison operators for amount columns. */
export type NumericOp = "=" | ">" | "<" | ">=" | "<="

/**
 * Value-presence operators, available on every kind. They answer "does this
 * field have a value at all?" against the stored column — a NULL — never
 * against the text a cell happens to render.
 */
export type PresenceOp = "populated" | "blank"

export type TextOp = "contains" | "not_contains" | "is" | "is_not" | PresenceOp
export type MultiOp = "in" | "not_in" | PresenceOp
export type DateOp = "between" | "before" | "after" | PresenceOp
export type NumericFilterOp = NumericOp | PresenceOp

export type FilterOp = TextOp | MultiOp | DateOp | NumericFilterOp

export type FilterKind = "text" | "multi" | "numeric" | "date"

export type ColumnFilter =
  | { kind: "text"; value: string; op?: TextOp }
  | { kind: "multi"; values: string[]; op?: MultiOp }
  | { kind: "numeric"; op: NumericFilterOp; value: string }
  // `text` is what the user typed (mm/dd/yy or a range) and is kept so the input
  // round-trips. `from`/`to` are absolute ISO instants resolved in the browser's
  // timezone — the server compares those, never the text, because the cells are
  // rendered with toLocaleDateString() while Postgres stores UTC. For `before`
  // and `after` both bounds hold the single chosen day, so switching operators
  // keeps it.
  | { kind: "date"; text: string; from?: string | null; to?: string | null; op?: DateOp }

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type FilterOperatorMeta = {
  value: FilterOp
  /** Full label, shown in the operator menu. */
  label: string
  /** One- or two-character stand-in shown on the closed operator button. */
  glyph: string
  /** How the filter reads in the active-filter chips ("contains", "is before"). */
  phrase: string
  /** False for the presence operators, whose value input is hidden. */
  needsValue: boolean
}

const PRESENCE_OPERATORS: FilterOperatorMeta[] = [
  {
    value: "populated",
    label: "Is populated",
    glyph: "•",
    phrase: "is populated",
    needsValue: false,
  },
  {
    value: "blank",
    label: "Is blank",
    glyph: "∅",
    phrase: "is blank",
    needsValue: false,
  },
]

/**
 * The operators offered per filter kind, in menu order. The first entry is the
 * default — the behaviour a filter has when it carries no explicit operator.
 */
export const FILTER_OPERATORS: Record<FilterKind, FilterOperatorMeta[]> = {
  text: [
    { value: "contains", label: "Contains", glyph: "~", phrase: "contains", needsValue: true },
    {
      value: "not_contains",
      label: "Does not contain",
      glyph: "!~",
      phrase: "does not contain",
      needsValue: true,
    },
    { value: "is", label: "Is", glyph: "=", phrase: "is", needsValue: true },
    { value: "is_not", label: "Is not", glyph: "≠", phrase: "is not", needsValue: true },
    ...PRESENCE_OPERATORS,
  ],
  multi: [
    { value: "in", label: "Is", glyph: "=", phrase: "is", needsValue: true },
    { value: "not_in", label: "Is not", glyph: "≠", phrase: "is not", needsValue: true },
    ...PRESENCE_OPERATORS,
  ],
  numeric: [
    { value: "=", label: "Equals", glyph: "=", phrase: "=", needsValue: true },
    { value: ">", label: "Greater than", glyph: ">", phrase: ">", needsValue: true },
    { value: "<", label: "Less than", glyph: "<", phrase: "<", needsValue: true },
    { value: ">=", label: "At least", glyph: "≥", phrase: "≥", needsValue: true },
    { value: "<=", label: "At most", glyph: "≤", phrase: "≤", needsValue: true },
    ...PRESENCE_OPERATORS,
  ],
  date: [
    // One day picked is "equals"; two are the ends of a range.
    { value: "between", label: "Is on / between", glyph: "=", phrase: "is", needsValue: true },
    { value: "before", label: "Is before", glyph: "<", phrase: "is before", needsValue: true },
    { value: "after", label: "Is after", glyph: ">", phrase: "is after", needsValue: true },
    ...PRESENCE_OPERATORS,
  ],
}

/**
 * Operators for a kind. `kind` reaches this from saved state and from the query
 * string, so an unrecognised one falls back to the text operators rather than
 * indexing into nothing — a corrupted saved filter must not take the table down
 * with it. It is dropped a moment later by validateFilter / isFilterActive.
 */
const operatorsFor = (kind: FilterKind): FilterOperatorMeta[] =>
  FILTER_OPERATORS[kind] ?? FILTER_OPERATORS.text

export const defaultOp = (kind: FilterKind): FilterOp => operatorsFor(kind)[0].value

/** The operator in force, filling in the default for filters that omit it. */
export const filterOp = (filter: ColumnFilter): FilterOp =>
  filter.op ?? defaultOp(filter.kind)

export const isPresenceOp = (op: FilterOp): op is PresenceOp =>
  op === "populated" || op === "blank"

export const operatorMeta = (kind: FilterKind, op: FilterOp): FilterOperatorMeta => {
  const operators = operatorsFor(kind)
  return operators.find((entry) => entry.value === op) ?? operators[0]
}

const isValidOp = (kind: FilterKind, op: unknown): boolean =>
  Boolean(FILTER_OPERATORS[kind]?.some((entry) => entry.value === op))

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

/**
 * Switches a filter's operator, keeping whatever value it already carries so
 * flipping between operators — or into "is blank" and back — doesn't make the
 * user retype it.
 */
export const withOp = (filter: ColumnFilter, op: FilterOp): ColumnFilter => {
  switch (filter.kind) {
    case "multi":
      return { ...filter, op: op as MultiOp }
    case "numeric":
      return { ...filter, op: op as NumericFilterOp }
    case "date":
      return { ...filter, op: op as DateOp }
    default:
      return { ...filter, op: op as TextOp }
  }
}

/** A filter only counts as active once it can actually narrow the result set. */
export const isFilterActive = (filter: ColumnFilter | undefined): boolean => {
  if (!filter) return false
  // "Is populated" / "is blank" ask about the column itself, so they narrow the
  // result set without a value of their own.
  if (isPresenceOp(filterOp(filter))) return true

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

/**
 * One filter in plain English, for the active-filter chips: "is populated",
 * `contains "acme"`, "is any of A, B". Pure and server-safe so the phrasing
 * stays in one place.
 */
export const describeFilter = (filter: ColumnFilter): string => {
  const op = filterOp(filter)
  const { phrase } = operatorMeta(filter.kind, op)
  if (isPresenceOp(op)) return phrase

  switch (filter.kind) {
    case "multi": {
      const values = filter.values.map((v) => (v === "-" ? "(blank)" : v))
      if (values.length === 0) return phrase
      if (values.length === 1) return `${phrase} ${values[0]}`
      return `${op === "not_in" ? "is none of" : "is any of"} ${values.join(", ")}`
    }
    case "numeric":
      return `${phrase} ${filter.value.trim()}`
    case "date":
      return `${phrase} ${filter.text.trim().replace(/-/, " – ")}`
    default:
      return `${phrase} "${filter.value.trim()}"`
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
  company_email: t("company_email"),
  path_to_files: t("path_to_files"),
  // NOTE: click_up_task_link and ap_epcs_invoicing are shown by the table but
  // deliberately left out — nothing else in the app filters them, so their
  // Postgres type is unconfirmed and an ilike against an enum column would fail
  // the whole request. The table renders their filter input disabled instead of
  // accepting one it would silently drop.
  project_status: e("project_status"),
  project_type: e("project_type"),
  construction_type: e("construction_type"),
  property_type: e("property_type"),
  questionnaire_received: e("questionnaire_received"),
  first_or_next_project: e("first_or_next_project"),
  project_manager: e("project_manager"),
  sales_person: e("sales_person"),
  partial_invoice: e("partial_invoice"),
  // Project-level dates the view carries alongside the order ones. The
  // invoicing workflow starts from delivery_completion_date — "date of
  // completion of first delivery" — so it has to be filterable, including by
  // whether it is set at all.
  order_confirmation_date: d("order_confirmation_date"),
  delivery_completion_date: d("delivery_completion_date"),
  invoice_date: d("invoice_date"),
  invoice_paid_date: d("invoice_paid_date"),
  partial_invoice_paid_date: d("partial_invoice_paid_date"),
}

/**
 * /api/projects. Keys match the `key` of the displayFields entries in
 * components/projects-data-table.tsx.
 */
export const PROJECTS_FILTER_COLUMNS: ColumnFilterMap = {
  project_id: t("project_id"),
  project_name: t("project_name"),
  client_contact_name: t("client_contact_name"),
  company_email: t("company_email"),
  invoice_number: t("invoice_number"),
  path_to_files: t("path_to_files"),

  client_rating: e("client_rating"),
  project_status: e("project_status"),
  project_manager: e("project_manager"),
  pm_type: e("pm_type"),
  sales_person: e("sales_person"),
  project_type: e("project_type"),
  construction_type: e("construction_type"),
  property_type: e("property_type"),
  first_or_next_project: e("first_or_next_project"),
  questionnaire_received: e("questionnaire_received"),
  deposit: e("deposit"),
  partial_invoice: e("partial_invoice"),

  order_confirmation_date: d("order_confirmation_date"),
  invoice_date: d("invoice_date"),
  invoice_paid_date: d("invoice_paid_date"),
  partial_invoice_paid_date: d("partial_invoice_paid_date"),
  delivery_completion_date: d("delivery_completion_date"),
  created_at: d("created_at"),

  // CAVEAT: the cell shows the *latest* project_completion_date across the
  // project's orders (see GET /api/projects), while this filters the embedded
  // order rows — so a range matches a project when *any* of its orders falls in
  // it. The two agree for the common single-order project and for equality on a
  // project whose latest order is the match, and differ only for a
  // multi-order project filtered on a range its latest order is outside of.
  project_completion_date: {
    column: "orders.project_completion_date",
    type: "date",
    embed: "orders",
  },
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

/**
 * Escapes the LIKE metacharacters in a value that must match literally.
 *
 * The "is" / "is not" operators compare the whole cell, but they run through
 * ILIKE so they stay case-insensitive the way the rest of the table's text
 * matching is. Without this a value containing % or _ would silently become a
 * wildcard — "50%" would match "50" followed by anything.
 */
export const escapeLikeLiteral = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`)

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

const validateFilter = (value: unknown): ColumnFilter | null => {
  if (!value || typeof value !== "object") return null
  const filter = value as Record<string, unknown>
  const kind = filter.kind as FilterKind
  // An operator the server doesn't know would otherwise fall back to the
  // default and quietly filter for something else, so drop the whole filter.
  const op = filter.op === undefined ? undefined : filter.op
  if (kind !== "numeric" && op !== undefined && !isValidOp(kind, op)) return null

  switch (kind) {
    case "text":
      return typeof filter.value === "string"
        ? { kind: "text", value: filter.value, ...(op ? { op: op as TextOp } : {}) }
        : null
    case "multi":
      return Array.isArray(filter.values) && filter.values.every((v) => typeof v === "string")
        ? {
            kind: "multi",
            values: filter.values as string[],
            ...(op ? { op: op as MultiOp } : {}),
          }
        : null
    case "numeric":
      // Unlike the other kinds numeric has always carried its operator, so an
      // unknown one is rejected rather than defaulted.
      return typeof filter.value === "string" && isValidOp("numeric", filter.op)
        ? { kind: "numeric", op: filter.op as NumericFilterOp, value: filter.value }
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
        ...(op ? { op: op as DateOp } : {}),
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
export const parseNumeric = (raw: string): number | null => {
  const cleaned = raw.replace(/[^0-9.\-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

const toNumber = parseNumeric

const NUMERIC_METHOD: Record<NumericOp, "eq" | "gt" | "lt" | "gte" | "lte"> = {
  "=": "eq",
  ">": "gt",
  "<": "lt",
  ">=": "gte",
  "<=": "lte",
}

/**
 * "Is populated" / "is blank", against the stored column.
 *
 * Blank means SQL NULL — the same thing the "-" option in the multi-select
 * dropdowns has always meant, and the same thing the cells render as "-".
 * Nothing here looks at the formatted cell text, so an unset date is blank
 * whatever the browser would have printed for it.
 */
const applyPresence = (query: any, column: string, op: PresenceOp): any =>
  op === "blank" ? query.is(column, null) : query.not(column, "is", null)

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

    const op = filterOp(filter)
    if (isPresenceOp(op)) {
      result = applyPresence(result, column, op)
      continue
    }

    switch (filter.kind) {
      case "text": {
        const value = filter.value.trim()
        switch (op as TextOp) {
          case "is":
            result = result.ilike(column, escapeLikeLiteral(value))
            break
          // "does not contain" / "is not" keep the rows that hold no value at
          // all: in SQL `NULL NOT ILIKE 'x'` is NULL, which would drop them,
          // and a user excluding a company does not mean to exclude the rows
          // with no company along with it.
          case "is_not":
            result = result.or(
              `${column}.not.ilike.${escapePostgrestValue(escapeLikeLiteral(value))},` +
                `${column}.is.null`
            )
            break
          case "not_contains":
            result = result.or(
              `${column}.not.ilike.${escapePostgrestValue(`%${value}%`)},${column}.is.null`
            )
            break
          default:
            result = result.ilike(column, `%${value}%`)
        }
        break
      }

      case "multi": {
        // "-" is what an empty cell renders as; picking it means "no value".
        const values = filter.values.filter((v) => v !== "-")
        const includesBlank = values.length !== filter.values.length
        const list = values.map(escapePostgrestValue).join(",")

        if ((op as MultiOp) === "not_in") {
          if (values.length === 0) {
            // Only "-" picked: exclude the rows that have no value.
            if (includesBlank) result = result.not(column, "is", null)
            break
          }
          result = includesBlank
            ? result.not(column, "in", `(${list})`).not(column, "is", null)
            : result.or(`${column}.not.in.(${list}),${column}.is.null`)
          break
        }

        if (values.length === 0) {
          if (includesBlank) result = result.is(column, null)
          break
        }
        if (includesBlank) {
          result = result.or(`${column}.in.(${list}),${column}.is.null`)
        } else {
          result = result.in(column, values)
        }
        break
      }

      case "numeric": {
        const value = toNumber(filter.value)
        if (value === null) break
        result = result[NUMERIC_METHOD[op as NumericOp]](column, value)
        break
      }

      case "date":
        // from/to are whole-day bounds resolved in the browser's timezone. For
        // before/after both hold the same day, so the comparison is against the
        // start or the end of it and the day itself is excluded.
        switch (op as DateOp) {
          case "before":
            if (filter.from) result = result.lt(column, filter.from)
            break
          case "after":
            if (filter.to) result = result.gt(column, filter.to)
            break
          default:
            if (filter.from) result = result.gte(column, filter.from)
            if (filter.to) result = result.lte(column, filter.to)
        }
        break
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Date parsing
//
// Pure helpers, kept here rather than in the filter UI so the route handlers
// and the tests can use them too. The picker in
// components/data-table-filters.tsx re-exports them.
// ---------------------------------------------------------------------------

/**
 * Parse a user-typed mm/dd/yy or mm/dd/yyyy string. Two-digit years map to
 * 2000+. Returns null for empty or malformed input (so a half-typed date
 * doesn't blank out the table).
 */
export const parseInputDate = (s: string): Date | null => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  const day = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)
  if (m[3].length === 2) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (isNaN(d.getTime()) || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/**
 * Parse the single date-filter input into a from/to pair. Accepts a lone date
 * ("mm/dd/yy" -> that exact day, from === to) or a range ("mm/dd/yy-mm/dd/yy").
 * Tolerant of messy input: each side is trimmed (so spaces around the "-" don't
 * matter), en/em dashes are normalized to "-", and a backwards range (later date
 * typed first) is swapped. Date parts use "/", so the first "-" separates the two
 * ends; either end may be blank or half-typed, leaving that side open (null).
 */
export const parseDateRange = (s: string): { from: Date | null; to: Date | null } => {
  const trimmed = s.trim().replace(/[‐-―−]/g, "-") // en/em/figure dashes, minus -> "-"
  if (trimmed === "") return { from: null, to: null }
  const dash = trimmed.indexOf("-")
  if (dash === -1) {
    const d = parseInputDate(trimmed)
    return { from: d, to: d }
  }
  let from = parseInputDate(trimmed.slice(0, dash))
  let to = parseInputDate(trimmed.slice(dash + 1))
  if (from && to && from.getTime() > to.getTime()) [from, to] = [to, from]
  return { from, to }
}

export const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * Resolves the typed mm/dd/yy text into the absolute instants the server
 * compares against. The bounds are whole days in the *browser's* timezone,
 * matching the toLocaleDateString() the cells are rendered with — sending the
 * raw text would compare local days against UTC timestamps and slide rows onto
 * the wrong day.
 */
export const buildDateFilter = (text: string, op?: DateOp): ColumnFilter => {
  const { from, to } = parseDateRange(text)
  return {
    kind: "date",
    text,
    from: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString() : null,
    to: to
      ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).toISOString()
      : null,
    ...(op ? { op } : {}),
  }
}
