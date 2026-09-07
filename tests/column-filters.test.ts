// ---------------------------------------------------------------------------
// The per-column filters: what counts as active, what survives a round trip
// through the query string, and what each operator actually asks the database.
//
// Run with `npm test` (node --test, no test framework to install).
// ---------------------------------------------------------------------------

import test from "node:test"
import assert from "node:assert/strict"

import {
  ALL_ORDERS_FILTER_COLUMNS,
  PROJECT_ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  buildDateFilter,
  defaultFilter,
  describeFilter,
  escapePostgrestValue,
  filterOp,
  isFilterActive,
  parseColumnFilters,
  parseDateRange,
  serializeColumnFilters,
  withOp,
  type ColumnFilter,
} from "../lib/column-filters.ts"
import { fakeQuery } from "./fake-query.ts"

/** The conditions `filters` would put on a project_orders_view query. */
const conditions = (
  filters: Record<string, ColumnFilter>,
  meta = PROJECT_ORDERS_FILTER_COLUMNS
): string[] => applyColumnFilters(fakeQuery(), filters, meta).calls

/** Sends a filter through the query string the way the table does. */
const roundTrip = (
  filters: Record<string, ColumnFilter>,
  meta = PROJECT_ORDERS_FILTER_COLUMNS
) => parseColumnFilters(serializeColumnFilters(filters) || null, meta)

// The column the invoicing workflow starts from, and the one it edits.
const DELIVERY_DATE = "delivery_completion_date"

// ---------------------------------------------------------------------------
// What counts as an active filter
// ---------------------------------------------------------------------------

test("a filter with no value is not active", () => {
  assert.equal(isFilterActive(defaultFilter("text")), false)
  assert.equal(isFilterActive(defaultFilter("multi")), false)
  assert.equal(isFilterActive(defaultFilter("numeric")), false)
  assert.equal(isFilterActive(defaultFilter("date")), false)
  assert.equal(isFilterActive(undefined), false)
})

test("a filter with a value is active", () => {
  assert.equal(isFilterActive({ kind: "text", value: "acme" }), true)
  assert.equal(isFilterActive({ kind: "multi", values: ["Open"] }), true)
  assert.equal(isFilterActive({ kind: "numeric", op: ">", value: "10" }), true)
  assert.equal(isFilterActive(buildDateFilter("03/04/25")), true)
})

test("half-typed input does not filter yet", () => {
  assert.equal(isFilterActive({ kind: "text", value: "   " }), false)
  assert.equal(isFilterActive({ kind: "numeric", op: "=", value: "-" }), false)
  assert.equal(isFilterActive(buildDateFilter("03/")), false)
})

test("is populated / is blank are active without a value", () => {
  for (const kind of ["text", "multi", "numeric", "date"] as const) {
    for (const op of ["populated", "blank"] as const) {
      assert.equal(
        isFilterActive(withOp(defaultFilter(kind), op)),
        true,
        `${kind} ${op} should be active`
      )
    }
  }
})

test("a filter with no operator keeps the behaviour it always had", () => {
  assert.equal(filterOp({ kind: "text", value: "acme" }), "contains")
  assert.equal(filterOp({ kind: "multi", values: [] }), "in")
  assert.equal(filterOp(buildDateFilter("03/04/25")), "between")
  assert.equal(filterOp({ kind: "numeric", op: ">=", value: "1" }), ">=")
})

// ---------------------------------------------------------------------------
// Existing operators still build the same query
// ---------------------------------------------------------------------------

test("text contains is an ilike, as before", () => {
  assert.deepEqual(conditions({ company_name: { kind: "text", value: " acme " } }), [
    "ilike(company_name,%acme%)",
  ])
})

test("multi-select is an in(), as before", () => {
  assert.deepEqual(
    conditions({ project_status: { kind: "multi", values: ["Open", "Closed"] } }),
    ["in(project_status,Open,Closed)"]
  )
})

test("the multi-select blank option still matches nulls", () => {
  assert.deepEqual(conditions({ project_status: { kind: "multi", values: ["-"] } }), [
    "is(project_status,null)",
  ])
  assert.deepEqual(
    conditions({ project_status: { kind: "multi", values: ["Open", "-"] } }),
    ["or(project_status.in.(Open),project_status.is.null)"]
  )
})

test("numeric comparisons still map to their PostgREST methods", () => {
  assert.deepEqual(conditions({ net_sum: { kind: "numeric", op: ">=", value: "€1,200.50" } }), [
    "gte(net_sum,1200.5)",
  ])
  assert.deepEqual(conditions({ quantity: { kind: "numeric", op: "=", value: "3" } }), [
    "eq(quantity,3)",
  ])
})

test("a date range still bounds both ends", () => {
  const calls = conditions({ [DELIVERY_DATE]: buildDateFilter("03/04/25-03/09/25") })
  assert.equal(calls.length, 2)
  assert.match(calls[0], /^gte\(delivery_completion_date,/)
  assert.match(calls[1], /^lte\(delivery_completion_date,/)
})

test("a single date is an equals — the whole day, in the browser's timezone", () => {
  const filter = buildDateFilter("03/04/25")
  assert.equal(filter.kind, "date")
  if (filter.kind !== "date") return
  const from = new Date(filter.from!)
  const to = new Date(filter.to!)
  assert.equal(from.getFullYear(), 2025)
  assert.equal(from.getMonth(), 2)
  assert.equal(from.getDate(), 4)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 4)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getMinutes(), 59)
})

test("a backwards typed range is swapped rather than dropped", () => {
  const { from, to } = parseDateRange("03/09/25-03/04/25")
  assert.equal(from?.getDate(), 4)
  assert.equal(to?.getDate(), 9)
})

test("values carrying a comma stay quoted inside an or() expression", () => {
  assert.equal(escapePostgrestValue("Acme, Inc."), '"Acme, Inc."')
  assert.deepEqual(
    conditions({ company_name: { kind: "multi", values: ["Acme, Inc.", "-"] } }),
    ['or(company_name.in.("Acme, Inc."),company_name.is.null)']
  )
})

// ---------------------------------------------------------------------------
// Is populated / is blank
// ---------------------------------------------------------------------------

test("is populated asks for a non-null column, not for rendered text", () => {
  assert.deepEqual(conditions({ [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated") }), [
    "not(delivery_completion_date,is,null)",
  ])
})

test("is blank asks for a null column", () => {
  assert.deepEqual(conditions({ [DELIVERY_DATE]: withOp(defaultFilter("date"), "blank") }), [
    "is(delivery_completion_date,null)",
  ])
})

test("is populated / is blank work on every kind of column", () => {
  assert.deepEqual(conditions({ invoice_number: withOp(defaultFilter("text"), "blank") }), [
    "is(invoice_number,null)",
  ])
  assert.deepEqual(conditions({ project_status: withOp(defaultFilter("multi"), "populated") }), [
    "not(project_status,is,null)",
  ])
  assert.deepEqual(conditions({ net_sum: withOp(defaultFilter("numeric"), "blank") }), [
    "is(net_sum,null)",
  ])
})

test("a value left behind by an earlier operator is ignored by is populated", () => {
  // Switching the operator keeps what was typed so it survives a flip back, but
  // the condition sent must be the presence check alone.
  assert.deepEqual(
    conditions({ company_name: { kind: "text", value: "acme", op: "populated" } }),
    ["not(company_name,is,null)"]
  )
})

// ---------------------------------------------------------------------------
// The rest of the new operators
// ---------------------------------------------------------------------------

test("text is / is not compare the whole value", () => {
  assert.deepEqual(conditions({ company_name: { kind: "text", value: "Company A", op: "is" } }), [
    "ilike(company_name,Company A)",
  ])
  assert.deepEqual(
    conditions({ company_name: { kind: "text", value: "Company A", op: "is_not" } }),
    ["or(company_name.not.ilike.Company A,company_name.is.null)"]
  )
})

test("is escapes LIKE wildcards so they match literally", () => {
  assert.deepEqual(conditions({ invoice_number: { kind: "text", value: "50%_x", op: "is" } }), [
    "ilike(invoice_number,50\\%\\_x)",
  ])
})

test("does not contain keeps the rows that have no value at all", () => {
  assert.deepEqual(
    conditions({ company_name: { kind: "text", value: "acme", op: "not_contains" } }),
    ["or(company_name.not.ilike.%acme%,company_name.is.null)"]
  )
})

test("multi is not excludes the picked values but keeps blanks", () => {
  assert.deepEqual(
    conditions({ project_status: { kind: "multi", values: ["Closed"], op: "not_in" } }),
    ["or(project_status.not.in.(Closed),project_status.is.null)"]
  )
})

test("multi is not with the blank option excludes those rows too", () => {
  assert.deepEqual(
    conditions({ project_status: { kind: "multi", values: ["Closed", "-"], op: "not_in" } }),
    ["not(project_status,in,(Closed))", "not(project_status,is,null)"]
  )
})

test("date before and after exclude the chosen day itself", () => {
  const before = conditions({ [DELIVERY_DATE]: buildDateFilter("03/04/25", "before") })
  assert.equal(before.length, 1)
  assert.match(before[0], /^lt\(delivery_completion_date,/)
  assert.match(before[0], /T00:00|-0[0-9]:00|Z/)

  const after = conditions({ [DELIVERY_DATE]: buildDateFilter("03/04/25", "after") })
  assert.equal(after.length, 1)
  assert.match(after[0], /^gt\(delivery_completion_date,/)
})

// ---------------------------------------------------------------------------
// Several filters at once
// ---------------------------------------------------------------------------

test("Lidia's invoicing filters combine into one narrowed query", () => {
  const filters: Record<string, ColumnFilter> = {
    [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated"),
    company_name: { kind: "text", value: "Company A", op: "is" },
    project_name: { kind: "text", value: "Project X", op: "is" },
  }
  assert.deepEqual(conditions(filters), [
    "not(delivery_completion_date,is,null)",
    "ilike(company_name,Company A)",
    "ilike(project_name,Project X)",
  ])
})

test("removing one filter leaves the others in force", () => {
  const filters: Record<string, ColumnFilter> = {
    [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated"),
    company_name: { kind: "text", value: "Company A", op: "is" },
    project_name: { kind: "text", value: "Project X", op: "is" },
  }
  const { company_name, ...rest } = filters
  assert.deepEqual(conditions(rest), [
    "not(delivery_completion_date,is,null)",
    "ilike(project_name,Project X)",
  ])
  // and the original is untouched
  assert.equal(Object.keys(filters).length, 3)
})

test("clearing every filter leaves the query unfiltered", () => {
  assert.deepEqual(conditions({}), [])
  assert.equal(serializeColumnFilters({}), "")
})

test("an exception row can be excluded while the rest of the filters stand", () => {
  const filters: Record<string, ColumnFilter> = {
    [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated"),
    company_name: { kind: "text", value: "Company A", op: "is" },
    order_id: { kind: "text", value: "ORD-77", op: "is_not" },
  }
  assert.deepEqual(conditions(filters), [
    "not(delivery_completion_date,is,null)",
    "ilike(company_name,Company A)",
    "or(order_id.not.ilike.ORD-77,order_id.is.null)",
  ])
})

// ---------------------------------------------------------------------------
// Serialization: what the browser sends and the route accepts
// ---------------------------------------------------------------------------

test("only active filters are sent", () => {
  const sent = serializeColumnFilters({
    company_name: { kind: "text", value: "acme" },
    project_name: { kind: "text", value: "" },
    [DELIVERY_DATE]: defaultFilter("date"),
  })
  assert.deepEqual(Object.keys(JSON.parse(sent)), ["company_name"])
})

test("a stack of filters survives the round trip to the server", () => {
  const filters: Record<string, ColumnFilter> = {
    [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated"),
    company_name: { kind: "text", value: "Company A", op: "is" },
    project_status: { kind: "multi", values: ["Open"], op: "not_in" },
    net_sum: { kind: "numeric", op: ">", value: "100" },
  }
  assert.deepEqual(roundTrip(filters), filters)
})

test("filters saved before operators existed still parse", () => {
  const legacy = JSON.stringify({
    company_name: { kind: "text", value: "acme" },
    project_status: { kind: "multi", values: ["Open"] },
    net_sum: { kind: "numeric", op: "<", value: "5" },
  })
  const parsed = parseColumnFilters(legacy, PROJECT_ORDERS_FILTER_COLUMNS)
  assert.deepEqual(conditions(parsed), [
    "ilike(company_name,%acme%)",
    "in(project_status,Open)",
    "lt(net_sum,5)",
  ])
})

test("columns outside the whitelist are dropped", () => {
  const parsed = parseColumnFilters(
    JSON.stringify({
      "projects.secret": { kind: "text", value: "x" },
      company_name: { kind: "text", value: "acme" },
    }),
    PROJECT_ORDERS_FILTER_COLUMNS
  )
  assert.deepEqual(Object.keys(parsed), ["company_name"])
})

test("an unknown operator is dropped rather than defaulted", () => {
  const parsed = parseColumnFilters(
    JSON.stringify({
      company_name: { kind: "text", value: "acme", op: "regex" },
      project_name: { kind: "text", value: "x", op: "is" },
      net_sum: { kind: "numeric", op: "~", value: "1" },
    }),
    PROJECT_ORDERS_FILTER_COLUMNS
  )
  assert.deepEqual(Object.keys(parsed), ["project_name"])
})

test("malformed filter payloads are dropped", () => {
  assert.deepEqual(parseColumnFilters("not json", PROJECT_ORDERS_FILTER_COLUMNS), {})
  assert.deepEqual(parseColumnFilters("[1,2]", PROJECT_ORDERS_FILTER_COLUMNS), {})
  assert.deepEqual(parseColumnFilters(null, PROJECT_ORDERS_FILTER_COLUMNS), {})
  assert.deepEqual(
    parseColumnFilters(
      JSON.stringify({
        company_name: { kind: "text", value: 5 },
        project_status: { kind: "multi", values: [1] },
        [DELIVERY_DATE]: { kind: "date", text: "x", from: "not-a-date" },
      }),
      PROJECT_ORDERS_FILTER_COLUMNS
    ),
    {}
  )
})

test("the delivery completion date is filterable on Project Orders", () => {
  // It is shown by the table, and the whole invoicing workflow starts from it,
  // so a filter on it has to reach the database instead of being dropped.
  assert.ok(PROJECT_ORDERS_FILTER_COLUMNS[DELIVERY_DATE])
  assert.ok(PROJECT_ORDERS_FILTER_COLUMNS.invoice_number)
  assert.ok(PROJECT_ORDERS_FILTER_COLUMNS.invoice_date)
  assert.deepEqual(
    Object.keys(roundTrip({ [DELIVERY_DATE]: withOp(defaultFilter("date"), "populated") })),
    [DELIVERY_DATE]
  )
})

test("the other tables keep their own whitelists", () => {
  // all_orders has no project columns of its own beyond the flattened ones.
  assert.equal(ALL_ORDERS_FILTER_COLUMNS[DELIVERY_DATE], undefined)
  assert.ok(ALL_ORDERS_FILTER_COLUMNS.customer_name)
  assert.deepEqual(
    conditions(
      { customer_name: { kind: "text", value: "jo" } },
      ALL_ORDERS_FILTER_COLUMNS
    ),
    ["ilike(customer_name,%jo%)"]
  )
})

// ---------------------------------------------------------------------------
// How the active filters read back to the user
// ---------------------------------------------------------------------------

test("each filter describes itself for the active-filter chips", () => {
  assert.equal(describeFilter(withOp(defaultFilter("date"), "populated")), "is populated")
  assert.equal(describeFilter(withOp(defaultFilter("text"), "blank")), "is blank")
  assert.equal(describeFilter({ kind: "text", value: "acme" }), 'contains "acme"')
  assert.equal(describeFilter({ kind: "text", value: "acme", op: "is_not" }), 'is not "acme"')
  assert.equal(describeFilter({ kind: "multi", values: ["Open"] }), "is Open")
  assert.equal(
    describeFilter({ kind: "multi", values: ["Open", "Closed"] }),
    "is any of Open, Closed"
  )
  assert.equal(
    describeFilter({ kind: "multi", values: ["Open", "Closed"], op: "not_in" }),
    "is none of Open, Closed"
  )
  assert.equal(describeFilter({ kind: "multi", values: ["-"] }), "is (blank)")
  assert.equal(describeFilter({ kind: "numeric", op: ">=", value: "100" }), "≥ 100")
  assert.equal(describeFilter(buildDateFilter("03/04/25")), "is 03/04/25")
  assert.equal(
    describeFilter(buildDateFilter("03/04/25-03/09/25")),
    "is 03/04/25 – 03/09/25"
  )
  assert.equal(describeFilter(buildDateFilter("03/04/25", "before")), "is before 03/04/25")
})

test("a corrupted saved filter is dropped, not thrown on", () => {
  // Saved state comes back from localStorage and the query string, so a filter
  // of an unknown shape has to be survivable.
  assert.doesNotThrow(() =>
    parseColumnFilters(
      JSON.stringify({ company_name: { kind: "regex", op: "matches", value: "x" } }),
      PROJECT_ORDERS_FILTER_COLUMNS
    )
  )
  assert.deepEqual(
    parseColumnFilters(
      JSON.stringify({ company_name: { kind: "regex", op: "matches", value: "x" } }),
      PROJECT_ORDERS_FILTER_COLUMNS
    ),
    {}
  )
})
