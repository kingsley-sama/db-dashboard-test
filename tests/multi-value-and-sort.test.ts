// ---------------------------------------------------------------------------
// Several values in one text or numeric column filter, and sorting the whole
// table by a column from its header menu.
//
// Run with `npm test`.
// ---------------------------------------------------------------------------

import test from "node:test"
import assert from "node:assert/strict"

import {
  ORDERS_FILTER_COLUMNS,
  PROJECT_ORDERS_FILTER_COLUMNS,
  applyColumnFilters,
  describeFilter,
  filterTerms,
  isFilterActive,
  parseColumnFilters,
  pinFilterValue,
  serializeColumnFilters,
  unpinFilterValue,
  withOp,
  type ColumnFilter,
} from "../lib/column-filters.ts"
import {
  ORDERS_SORT_COLUMNS,
  PROJECT_ORDERS_SORT_COLUMNS,
  PROJECTS_SORT_COLUMNS,
  appendSortParams,
  applySort,
  parseSort,
  validateSort,
} from "../lib/table-sort.ts"
import { fakeQuery } from "./fake-query.ts"

type TextFilter = Extract<ColumnFilter, { kind: "text" }>

const conditions = (
  filters: Record<string, ColumnFilter>,
  meta = PROJECT_ORDERS_FILTER_COLUMNS
): string[] => applyColumnFilters(fakeQuery(), filters, meta).calls

// ---------------------------------------------------------------------------
// Pinning values
// ---------------------------------------------------------------------------

test("Enter pins the typed value and empties the input", () => {
  const first = pinFilterValue({ kind: "text", value: " 17829-10 " } as const)
  assert.deepEqual(first, { kind: "text", value: "", values: ["17829-10"] })
  const second = pinFilterValue({ ...first, value: "17805-20" })
  assert.deepEqual(second.values, ["17829-10", "17805-20"])
  assert.equal(second.value, "")
})

test("pinning nothing, or a value already pinned, adds nothing", () => {
  const filter: TextFilter = { kind: "text", value: "", values: ["acme"] }
  assert.equal(pinFilterValue(filter), filter)
  assert.deepEqual(pinFilterValue({ ...filter, value: "ACME" }).values, ["acme"])
})

test("a half-typed number is not pinned", () => {
  const filter = { kind: "numeric", op: "=", value: "-" } as const
  assert.equal(pinFilterValue(filter), filter)
})

test("removing one pinned value keeps the others", () => {
  const filter: TextFilter = { kind: "text", value: "", values: ["a", "b", "c"] }
  assert.deepEqual(unpinFilterValue(filter, "b").values, ["a", "c"])
})

test("the terms are the pinned values plus what is being typed", () => {
  assert.deepEqual(filterTerms({ kind: "text", value: "c", values: ["a", " b ", "A", ""] }), [
    "a",
    "b",
    "c",
  ])
  assert.equal(isFilterActive({ kind: "text", value: "", values: ["a"] }), true)
  assert.equal(isFilterActive({ kind: "text", value: " ", values: [] }), false)
  assert.equal(isFilterActive({ kind: "numeric", op: "=", value: "", values: ["5"] }), true)
})

// ---------------------------------------------------------------------------
// What several values ask the database
// ---------------------------------------------------------------------------

test("one value is still a plain ilike", () => {
  assert.deepEqual(conditions({ project_id: { kind: "text", value: "", values: ["17829-10"] } }), [
    "ilike(project_id,%17829-10%)",
  ])
})

test("several contains values match a row holding any of them", () => {
  assert.deepEqual(
    conditions({ project_id: { kind: "text", value: "", values: ["17829-10", "17805-20"] } }),
    ["or(project_id.ilike.%17829-10%,project_id.ilike.%17805-20%)"]
  )
})

test("the value still being typed joins the pinned ones", () => {
  assert.deepEqual(
    conditions({ project_id: { kind: "text", value: "17805", values: ["17829-10"] } }),
    ["or(project_id.ilike.%17829-10%,project_id.ilike.%17805%)"]
  )
})

test("several is values match any of them exactly", () => {
  assert.deepEqual(
    conditions({ order_id: { kind: "text", op: "is", value: "", values: ["A_1", "B"] } }),
    // The escaped underscore carries a backslash, so it is quoted in the or().
    ['or(order_id.ilike."A\\\\_1",order_id.ilike.B)']
  )
})

test("several excluded values must all be absent, and blanks stay", () => {
  assert.deepEqual(
    conditions({
      company_name: { kind: "text", op: "not_contains", value: "", values: ["acme", "globex"] },
    }),
    [
      "or(company_name.not.ilike.%acme%,company_name.is.null)",
      "or(company_name.not.ilike.%globex%,company_name.is.null)",
    ]
  )
})

test("a value carrying a comma stays quoted among several", () => {
  assert.deepEqual(
    conditions({ company_name: { kind: "text", value: "", values: ["Acme, Inc.", "Globex"] } }),
    ['or(company_name.ilike."%Acme, Inc.%",company_name.ilike.%Globex%)']
  )
})

test("several values on a joined column are matched inside the join", () => {
  assert.deepEqual(
    conditions(
      { project_name: { kind: "text", value: "", values: ["Villa", "Loft"] } },
      ORDERS_FILTER_COLUMNS
    ),
    ['or(project_name.ilike.%Villa%,project_name.ilike.%Loft%,{"referencedTable":"projects"})']
  )
})

test("several numbers match any of them", () => {
  assert.deepEqual(
    conditions({ quantity: { kind: "numeric", op: "=", value: "", values: ["2", "€1,000"] } }),
    ["or(quantity.eq.2,quantity.eq.1000)"]
  )
  assert.deepEqual(conditions({ quantity: { kind: "numeric", op: ">", value: "3" } }), [
    "gt(quantity,3)",
  ])
})

test("presence operators ignore pinned values", () => {
  const filter = withOp({ kind: "text", value: "", values: ["a", "b"] }, "blank")
  assert.deepEqual(conditions({ project_id: filter }), ["is(project_id,null)"])
})

test("pinned values survive the round trip to the server", () => {
  const filters: Record<string, ColumnFilter> = {
    project_id: { kind: "text", value: "", values: ["17829-10", "17805-20"] },
    quantity: { kind: "numeric", op: "=", value: "", values: ["2"] },
  }
  assert.deepEqual(
    parseColumnFilters(serializeColumnFilters(filters), PROJECT_ORDERS_FILTER_COLUMNS),
    filters
  )
})

test("pinned values that aren't strings are dropped", () => {
  const raw = JSON.stringify({ project_id: { kind: "text", value: "", values: [1, 2] } })
  assert.deepEqual(parseColumnFilters(raw, PROJECT_ORDERS_FILTER_COLUMNS), {})
})

test("several values read as one condition in the chips", () => {
  assert.equal(
    describeFilter({ kind: "text", value: "", values: ["17829-10", "17805-20"] }),
    'contains "17829-10" or "17805-20"'
  )
  assert.equal(
    describeFilter({ kind: "text", op: "is_not", value: "", values: ["a", "b"] }),
    'is not "a" nor "b"'
  )
  assert.equal(describeFilter({ kind: "numeric", op: "=", value: "5", values: ["2"] }), "= 2 or 5")
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const params = (query: string) => new URLSearchParams(query)
const byCreated = (q: any) => q.order("created_at", { ascending: false })

test("a sort is read off the request, defaulting to ascending", () => {
  assert.deepEqual(parseSort(params("sort=project_id&dir=desc"), PROJECT_ORDERS_SORT_COLUMNS), {
    key: "project_id",
    dir: "desc",
  })
  assert.deepEqual(parseSort(params("sort=project_id"), PROJECT_ORDERS_SORT_COLUMNS), {
    key: "project_id",
    dir: "asc",
  })
})

test("a column outside the whitelist is not sorted on", () => {
  assert.equal(parseSort(params("sort=password_hash"), PROJECT_ORDERS_SORT_COLUMNS), null)
  assert.equal(parseSort(params("sort=constructor"), PROJECT_ORDERS_SORT_COLUMNS), null)
  assert.equal(parseSort(params(""), PROJECT_ORDERS_SORT_COLUMNS), null)
})

test("the chosen column comes first, blanks last, then the default order", () => {
  const sort = { key: "net_sum", dir: "desc" } as const
  assert.deepEqual(applySort(fakeQuery(), sort, PROJECT_ORDERS_SORT_COLUMNS, byCreated).calls, [
    'order(net_sum,{"ascending":false,"nullsFirst":false})',
    'order(created_at,{"ascending":false})',
  ])
})

test("with no sort the default order is used alone", () => {
  assert.deepEqual(applySort(fakeQuery(), null, PROJECT_ORDERS_SORT_COLUMNS, byCreated).calls, [
    'order(created_at,{"ascending":false})',
  ])
})

test("orders sort by the joined project's columns", () => {
  assert.equal(ORDERS_SORT_COLUMNS.project_name, "projects(project_name)")
  assert.equal(ORDERS_SORT_COLUMNS.customer_name, "projects(client_contact_name)")
})

test("every Project Orders column can be sorted, including the unfilterable ones", () => {
  assert.equal(PROJECT_ORDERS_SORT_COLUMNS.click_up_task_link, "click_up_task_link")
  assert.equal(PROJECT_ORDERS_SORT_COLUMNS.ap_epcs_invoicing, "ap_epcs_invoicing")
})

test("a project can't be sorted by a value spread over its orders", () => {
  assert.equal(PROJECTS_SORT_COLUMNS.project_completion_date, undefined)
  assert.equal(PROJECTS_SORT_COLUMNS.project_id, "project_id")
})

test("a sort is written to the request only when there is one", () => {
  const withSort = new URLSearchParams()
  appendSortParams(withSort, { key: "project_id", dir: "asc" })
  assert.equal(withSort.toString(), "sort=project_id&dir=asc")
  const without = new URLSearchParams()
  appendSortParams(without, null)
  assert.equal(without.toString(), "")
})

test("a corrupted saved sort is dropped", () => {
  assert.deepEqual(validateSort({ key: "a", dir: "desc" }), { key: "a", dir: "desc" })
  assert.equal(validateSort({ key: "a", dir: "sideways" }), null)
  assert.equal(validateSort("a"), null)
  assert.equal(validateSort(undefined), null)
})

// ---------------------------------------------------------------------------
// First-letter quick picks (AP/EPCS Invoicing: Y / N)
// ---------------------------------------------------------------------------

const AP = "ap_epcs_invoicing"

test("AP/EPCS Invoicing is filterable and offers Y and N", () => {
  const meta = PROJECT_ORDERS_FILTER_COLUMNS[AP]
  assert.equal(meta.type, "text")
  assert.deepEqual(meta.prefixes?.map((p) => p.value), ["Y", "N"])
})

test("picking Y is a case-sensitive starts-with", () => {
  assert.deepEqual(conditions({ [AP]: { kind: "text", value: "", prefixes: ["Y"] } }), [
    "like(ap_epcs_invoicing,Y%)",
  ])
})

test("picking Y and N matches either", () => {
  assert.deepEqual(conditions({ [AP]: { kind: "text", value: "", prefixes: ["Y", "N"] } }), [
    "or(ap_epcs_invoicing.like.Y%,ap_epcs_invoicing.like.N%)",
  ])
})

test("a pick narrows alongside the search box", () => {
  assert.deepEqual(conditions({ [AP]: { kind: "text", value: "gratis", prefixes: ["N"] } }), [
    "like(ap_epcs_invoicing,N%)",
    "ilike(ap_epcs_invoicing,%gratis%)",
  ])
})

test("a pick alone makes the filter active, and reads in the chips", () => {
  const filter: ColumnFilter = { kind: "text", value: "", prefixes: ["N"] }
  assert.equal(isFilterActive(filter), true)
  assert.equal(describeFilter(filter), "starts with N")
  assert.equal(
    describeFilter({ kind: "text", value: "2025", prefixes: ["Y"] }),
    'starts with Y, contains "2025"'
  )
})

test("picks survive the round trip; ones the column doesn't offer are dropped", () => {
  const ok = { [AP]: { kind: "text", value: "", prefixes: ["Y"] } as ColumnFilter }
  assert.deepEqual(parseColumnFilters(serializeColumnFilters(ok), PROJECT_ORDERS_FILTER_COLUMNS), ok)
  const forged = JSON.stringify({ [AP]: { kind: "text", value: "", prefixes: ["%", "Y"] } })
  assert.deepEqual(parseColumnFilters(forged, PROJECT_ORDERS_FILTER_COLUMNS), {
    [AP]: { kind: "text", value: "", prefixes: ["Y"] },
  })
  // A column with no picks drops them all, and the empty filter with them.
  const elsewhere = JSON.stringify({ company_name: { kind: "text", value: "", prefixes: ["Y"] } })
  assert.deepEqual(parseColumnFilters(elsewhere, PROJECT_ORDERS_FILTER_COLUMNS), {})
})

test("AP/EPCS Invoicing is still sortable", () => {
  assert.equal(PROJECT_ORDERS_SORT_COLUMNS[AP], "ap_epcs_invoicing")
})
