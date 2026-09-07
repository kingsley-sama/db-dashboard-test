// ---------------------------------------------------------------------------
// Editing an order from the Project Orders shared view: what the API accepts,
// who may send it, and what the table does to the rows on screen while the
// write is in flight.
//
// Run with `npm test`.
// ---------------------------------------------------------------------------

import test from "node:test"
import assert from "node:assert/strict"

import {
  PROJECT_ORDER_EDITABLE_FIELDS,
  buildProjectOrderUpdate,
  canEditProjectOrders,
  parseProjectPk,
} from "../lib/project-order-edits.ts"
import {
  normalizeEditValue,
  patchRows,
  revertRows,
  sameRow,
  snapshotField,
  type Row,
} from "../lib/inline-edit.ts"
import {
  applyColumnFilters,
  defaultFilter,
  isFilterActive,
  serializeColumnFilters,
  withOp,
  PROJECT_ORDERS_FILTER_COLUMNS,
  type ColumnFilter,
} from "../lib/column-filters.ts"
import { fakeQuery } from "./fake-query.ts"

// Two orders of one project plus an order of another, as project_orders_view
// returns them: `id` is a composite, `project_pk` the project they share.
const rows = (): Row[] => [
  { id: "7-1", project_pk: 7, order_id: "ORD-1", invoice_number: null },
  { id: "7-2", project_pk: 7, order_id: "ORD-2", invoice_number: null },
  { id: "9-3", project_pk: 9, order_id: "ORD-3", invoice_number: "RE-900" },
]

const sameProject = (edited: any, candidate: any) => candidate.project_pk === edited.project_pk

// ---------------------------------------------------------------------------
// What the endpoint accepts
// ---------------------------------------------------------------------------

test("the invoice number can be edited from Project Orders", () => {
  assert.ok(PROJECT_ORDER_EDITABLE_FIELDS.invoice_number)
  assert.deepEqual(buildProjectOrderUpdate({ invoice_number: "RE-1024" }), {
    ok: true,
    update: { invoice_number: "RE-1024" },
  })
})

test("a cleared invoice number is stored as no value at all", () => {
  // So that "is blank" finds it, rather than an empty string hiding from both
  // "is blank" and "is populated".
  assert.deepEqual(buildProjectOrderUpdate({ invoice_number: "   " }), {
    ok: true,
    update: { invoice_number: null },
  })
  assert.deepEqual(buildProjectOrderUpdate({ invoice_number: null }), {
    ok: true,
    update: { invoice_number: null },
  })
})

test("submitted values are trimmed", () => {
  assert.deepEqual(buildProjectOrderUpdate({ invoice_number: "  RE-7 " }), {
    ok: true,
    update: { invoice_number: "RE-7" },
  })
})

test("fields outside the whitelist are refused", () => {
  for (const body of [
    { project_status: "Closed" },
    { net_sum: "1" },
    { invoice_number: "RE-1", project_id: "P-9" },
    { id: 4 },
  ]) {
    const result = buildProjectOrderUpdate(body)
    assert.equal(result.ok, false, `${JSON.stringify(body)} should be refused`)
  }
})

test("a body that is not an object of fields is refused", () => {
  assert.equal(buildProjectOrderUpdate(null).ok, false)
  assert.equal(buildProjectOrderUpdate("RE-1").ok, false)
  assert.equal(buildProjectOrderUpdate([{ invoice_number: "x" }]).ok, false)
  assert.equal(buildProjectOrderUpdate({}).ok, false)
})

test("values that are not text, or are too long, are refused", () => {
  assert.equal(buildProjectOrderUpdate({ invoice_number: 42 }).ok, false)
  assert.equal(buildProjectOrderUpdate({ invoice_number: { a: 1 } }).ok, false)
  assert.equal(
    buildProjectOrderUpdate({
      invoice_number: "x".repeat(PROJECT_ORDER_EDITABLE_FIELDS.invoice_number.maxLength + 1),
    }).ok,
    false
  )
})

test("only owners and admins may write from the shared view", () => {
  assert.equal(canEditProjectOrders("owner"), true)
  assert.equal(canEditProjectOrders("admin"), true)
  assert.equal(canEditProjectOrders("pm"), false)
  assert.equal(canEditProjectOrders("apm"), false)
  assert.equal(canEditProjectOrders(null), false)
  assert.equal(canEditProjectOrders(undefined), false)
  assert.equal(canEditProjectOrders(""), false)
})

test("the project id in the URL must be a plain positive integer", () => {
  assert.equal(parseProjectPk("7"), 7)
  assert.equal(parseProjectPk("0"), null)
  assert.equal(parseProjectPk("-1"), null)
  assert.equal(parseProjectPk("1.5"), null)
  assert.equal(parseProjectPk("7; drop table projects"), null)
  assert.equal(parseProjectPk("abc"), null)
  assert.equal(parseProjectPk(""), null)
  assert.equal(parseProjectPk(null), null)
})

// ---------------------------------------------------------------------------
// What the table does to the rows while saving
// ---------------------------------------------------------------------------

test("an edit shows immediately on every row that shares the value", () => {
  // One invoice number is stored per project, so both of that project's order
  // rows have to show the new one.
  const before = rows()
  const affected = snapshotField(before, before[0], "invoice_number", sameProject)
  const after = patchRows(before, "invoice_number", "RE-1024", affected)

  assert.deepEqual(
    after.map((row) => row.invoice_number),
    ["RE-1024", "RE-1024", "RE-900"]
  )
})

test("an edit leaves the other rows alone", () => {
  const before = rows()
  const affected = snapshotField(before, before[0], "invoice_number", sameProject)
  const after = patchRows(before, "invoice_number", "RE-1024", affected)

  assert.equal(after[2], before[2], "an untouched row is not even re-created")
  assert.equal(before[0].invoice_number, null, "the original rows are not mutated")
})

test("a failed save puts the old values back", () => {
  const before = rows()
  const affected = snapshotField(before, before[2], "invoice_number", sameProject)
  const optimistic = patchRows(before, "invoice_number", "RE-typo", affected)
  assert.equal(optimistic[2].invoice_number, "RE-typo")

  const reverted = revertRows(optimistic, "invoice_number", affected)
  assert.deepEqual(
    reverted.map((row) => row.invoice_number),
    [null, null, "RE-900"]
  )
})

test("editing one row at a time accumulates, as copying a value down does", () => {
  // No bulk edit: the same value typed into two rows, one after the other.
  let current = rows()
  for (const target of [current[0], current[2]]) {
    const affected = snapshotField(current, target, "invoice_number", sameProject)
    current = patchRows(current, "invoice_number", "RE-2048", affected)
  }
  assert.deepEqual(
    current.map((row) => row.invoice_number),
    ["RE-2048", "RE-2048", "RE-2048"]
  )
})

test("an edit made on the row itself touches only that row", () => {
  const before = rows()
  const affected = snapshotField(before, before[0], "invoice_number", sameRow)
  const after = patchRows(before, "invoice_number", "RE-1", affected)
  assert.deepEqual(
    after.map((row) => row.invoice_number),
    ["RE-1", null, "RE-900"]
  )
})

test("an empty cell saves as no value", () => {
  assert.equal(normalizeEditValue(""), null)
  assert.equal(normalizeEditValue("   "), null)
  assert.equal(normalizeEditValue(" RE-3 "), "RE-3")
})

// ---------------------------------------------------------------------------
// Editing does not disturb the filters that found the row
// ---------------------------------------------------------------------------

test("saving a cell leaves the active filters exactly as they were", () => {
  // The table patches rows and never re-reads the filter state, so the same
  // filters keep producing the same query before and after an edit.
  const filters: Record<string, ColumnFilter> = {
    delivery_completion_date: withOp(defaultFilter("date"), "populated"),
    company_name: { kind: "text", value: "Company A", op: "is" },
  }
  const serialized = serializeColumnFilters(filters)

  const before = rows()
  const affected = snapshotField(before, before[0], "invoice_number", sameProject)
  patchRows(before, "invoice_number", "RE-1024", affected)

  assert.equal(serializeColumnFilters(filters), serialized)
  assert.deepEqual(
    applyColumnFilters(fakeQuery(), filters, PROJECT_ORDERS_FILTER_COLUMNS).calls,
    ["not(delivery_completion_date,is,null)", "ilike(company_name,Company A)"]
  )
  assert.ok(Object.values(filters).every(isFilterActive))
})
