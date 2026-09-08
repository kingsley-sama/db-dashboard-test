// ---------------------------------------------------------------------------
// Editing from the Project Orders shared view: which fields each half of a row
// accepts, who may send them, how a row is addressed, the guard that keeps a
// write off the wrong order, and what the table does to the rows on screen
// while the write is in flight.
//
// Run with `npm test`.
// ---------------------------------------------------------------------------

import test from "node:test"
import assert from "node:assert/strict"

import {
  INLINE_EDITABLE_FIELDS,
  PROJECT_ORDER_ORDER_FIELDS,
  PROJECT_ORDER_PROJECT_FIELDS,
  buildProjectOrderUpdate,
  canEditProjectOrders,
  isProjectScopedField,
  orderMatchesExpectation,
  parseExpectedOrder,
  parseProjectOrderRowId,
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

const project = (body: unknown) => buildProjectOrderUpdate(body, PROJECT_ORDER_PROJECT_FIELDS)
const order = (body: unknown) => buildProjectOrderUpdate(body, PROJECT_ORDER_ORDER_FIELDS)

// Two orders of one project plus an order of another, as project_orders_view
// returns them: `id` is a composite, `project_pk` the project they share.
const rows = (): Row[] => [
  { id: "7-1", project_pk: 7, order_pk: 1, project_id: "P-7", order_id: "ORD-1", invoice_number: null },
  { id: "7-2", project_pk: 7, order_pk: 2, project_id: "P-7", order_id: "ORD-2", invoice_number: null },
  { id: "9-3", project_pk: 9, order_pk: 3, project_id: "P-9", order_id: "ORD-3", invoice_number: "RE-900" },
]

const sameProject = (edited: any, candidate: any) => candidate.project_pk === edited.project_pk

// ---------------------------------------------------------------------------
// What each half of a row accepts
// ---------------------------------------------------------------------------

test("the invoice number can be edited from Project Orders", () => {
  assert.ok(PROJECT_ORDER_PROJECT_FIELDS.invoice_number)
  assert.deepEqual(project({ invoice_number: "RE-1024" }), {
    ok: true,
    update: { invoice_number: "RE-1024" },
  })
  assert.deepEqual([...INLINE_EDITABLE_FIELDS], ["invoice_number"])
})

test("the whole invoicing set the project dialog submits is accepted", () => {
  const result = project({
    project_name: "Project X",
    project_status: "Open",
    invoice_number: "RE-1024",
    invoice_date: "2025-03-04",
    invoice_paid_date: "2025-04-01",
    partial_invoice: "Yes",
    partial_invoice_paid_date: null,
    order_confirmation_date: "2025-01-09",
    delivery_completion_date: "2025-02-20",
    path_to_files: "/vol/projects/x",
    email_id: 12,
    client_id: null,
  })
  assert.equal(result.ok, true)
})

test("the whole set the order dialog submits is accepted", () => {
  const result = order({
    supplier: "Acme",
    cost: 1200.5,
    product_name: "Render",
    comments: "rush",
    order_type: "Standard",
    order_status: "In Progress",
    quantity: 3,
    due_delivery_date: "2025-03-04",
    delivery_1_date: null,
    delivery_2_date: null,
    delivery_3_date: null,
    delivery_4_date: null,
    date_information_complete: "2025-01-02",
    unit_price: 400,
    delay_first_delivery: 0,
    delay_first_revision: 2,
    delay_second_revision: null,
    date_first_delivery_complete: "2025-02-02",
    deposit: "Yes",
    pm_type: "internal",
    supplier_payment: "No",
    project_completion_date: "2025-05-01",
    discount: 12.5,
  })
  assert.equal(result.ok, true)
})

test("a cleared value is stored as no value at all", () => {
  // So that "is blank" finds it, rather than an empty string hiding from both
  // "is blank" and "is populated".
  assert.deepEqual(project({ invoice_number: "   " }), { ok: true, update: { invoice_number: null } })
  assert.deepEqual(project({ invoice_number: null }), { ok: true, update: { invoice_number: null } })
  assert.deepEqual(project({ invoice_date: "" }), { ok: true, update: { invoice_date: null } })
  assert.deepEqual(order({ cost: "" }), { ok: true, update: { cost: null } })
  assert.deepEqual(normalizeEditValue("   "), null)
})

test("submitted text is trimmed", () => {
  assert.deepEqual(project({ invoice_number: "  RE-7 " }), {
    ok: true,
    update: { invoice_number: "RE-7" },
  })
})

test("numbers arrive as numbers, whether typed or already parsed", () => {
  assert.deepEqual(order({ cost: "1200.50" }), { ok: true, update: { cost: 1200.5 } })
  assert.deepEqual(order({ cost: 1200.5 }), { ok: true, update: { cost: 1200.5 } })
  assert.deepEqual(order({ quantity: "3" }), { ok: true, update: { quantity: 3 } })
  assert.equal(order({ quantity: 1.5 }).ok, false, "a whole-number column rejects a fraction")
  assert.equal(order({ cost: "twelve" }).ok, false)
  assert.equal(order({ cost: Number.POSITIVE_INFINITY }).ok, false)
})

test("dates accept the date inputs' format and a value read back off a row", () => {
  assert.deepEqual(project({ invoice_date: "2025-03-04" }), {
    ok: true,
    update: { invoice_date: "2025-03-04" },
  })
  assert.equal(project({ invoice_date: "2025-03-04T00:00:00+00:00" }).ok, true)
  assert.equal(project({ invoice_date: "04/03/2025" }).ok, false)
  assert.equal(project({ invoice_date: "2025-13-45" }).ok, false)
  assert.equal(project({ invoice_date: 20250304 }).ok, false)
})

test("fields outside the whitelist are refused", () => {
  for (const body of [
    { net_sum: 1 },
    { project_id: "P-9" },
    { id: 4 },
    { order_id: "ORD-1" },
    { created_at: "2025-01-01" },
    { invoice_number: "RE-1", nonsense: "x" },
  ]) {
    assert.equal(project(body).ok, false, `${JSON.stringify(body)} should be refused`)
  }
})

test("the questionnaire flag cannot be written from this view", () => {
  // Flipping it starts the project intake automation, so it stays a deliberate
  // act in the Projects module rather than a side effect of an invoicing edit.
  assert.equal(project({ questionnaire_received: "Yes" }).ok, false)
  assert.equal(order({ questionnaire_received: "Yes" }).ok, false)
  assert.equal(PROJECT_ORDER_PROJECT_FIELDS.questionnaire_received, undefined)
  assert.equal(PROJECT_ORDER_ORDER_FIELDS.questionnaire_received, undefined)
})

test("each half only accepts its own table's fields", () => {
  assert.equal(project({ supplier: "Acme" }).ok, false, "supplier is an order column")
  assert.equal(order({ invoice_number: "RE-1" }).ok, false, "invoice_number is a project column")
  // pm_type and deposit exist on both, so the half decides which one is meant.
  assert.equal(project({ pm_type: "internal" }).ok, true)
  assert.equal(order({ pm_type: "internal" }).ok, true)
  assert.equal(project({ deposit: "Yes" }).ok, true)
  assert.equal(order({ deposit: "Yes" }).ok, true)
})

test("a body that is not an object of fields is refused", () => {
  assert.equal(project(null).ok, false)
  assert.equal(project("RE-1").ok, false)
  assert.equal(project([{ invoice_number: "x" }]).ok, false)
  assert.equal(project({}).ok, false)
})

test("over-long text is refused", () => {
  const max = PROJECT_ORDER_PROJECT_FIELDS.invoice_number.maxLength!
  assert.equal(project({ invoice_number: "x".repeat(max) }).ok, true)
  assert.equal(project({ invoice_number: "x".repeat(max + 1) }).ok, false)
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

// ---------------------------------------------------------------------------
// Addressing a row
// ---------------------------------------------------------------------------

test("a row id names the project, and the order when there is one", () => {
  assert.deepEqual(parseProjectOrderRowId("7-42"), { projectPk: 7, orderPk: 42 })
  assert.deepEqual(parseProjectOrderRowId("7"), { projectPk: 7, orderPk: null })
  // What the view reports for a project that has no orders.
  assert.deepEqual(parseProjectOrderRowId("7-none"), { projectPk: 7, orderPk: null })
})

test("anything but plain positive integers is refused as an address", () => {
  for (const id of ["0", "-1", "1.5", "7-0", "7-abc", "abc", "", "7-42-9", "7; drop table projects"]) {
    assert.equal(parseProjectOrderRowId(id), null, `${id} should be refused`)
  }
  assert.equal(parseProjectOrderRowId(null), null)
  assert.equal(parseProjectPk("7"), 7)
  assert.equal(parseProjectPk("7-42"), null)
})

// ---------------------------------------------------------------------------
// The guard that keeps a write off the wrong order
// ---------------------------------------------------------------------------

test("an order update says which order it expects to change", () => {
  assert.deepEqual(parseExpectedOrder({ order_id: "ORD-1", project_id: "P-7" }), {
    order_id: "ORD-1",
    project_id: "P-7",
  })
  assert.deepEqual(parseExpectedOrder({ order_id: null, project_id: "P-7" }), {
    order_id: null,
    project_id: "P-7",
  })
  assert.equal(parseExpectedOrder({ project_id: "P-7" })?.order_id, null)
  assert.equal(parseExpectedOrder(null), null)
  assert.equal(parseExpectedOrder({ order_id: "ORD-1" }), null, "the project key is required")
  assert.equal(parseExpectedOrder({ order_id: 1, project_id: "P-7" }), null)
})

test("the order about to be overwritten must be the one that was on screen", () => {
  const expected = { order_id: "ORD-1", project_id: "P-7" }
  assert.equal(orderMatchesExpectation({ order_id: "ORD-1", project_id: "P-7" }, expected), true)
  // A different record sharing the primary key — the case that would silently
  // overwrite the wrong order if the two tables don't share a key space.
  assert.equal(orderMatchesExpectation({ order_id: "ORD-9", project_id: "P-7" }, expected), false)
  assert.equal(orderMatchesExpectation({ order_id: "ORD-1", project_id: "P-3" }, expected), false)
  assert.equal(orderMatchesExpectation(null, expected), false)
  // An order with no business id of its own still matches on both keys empty.
  assert.equal(
    orderMatchesExpectation({ order_id: null, project_id: "P-7" }, { order_id: null, project_id: "P-7" }),
    true
  )
})

// ---------------------------------------------------------------------------
// What the table does to the rows while saving
// ---------------------------------------------------------------------------

test("project-scoped fields are known as such", () => {
  assert.equal(isProjectScopedField("invoice_number"), true)
  assert.equal(isProjectScopedField("supplier"), false)
})

test("an inline edit shows immediately on every row that shares the value", () => {
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

test("an inline edit leaves the other rows alone", () => {
  const before = rows()
  const affected = snapshotField(before, before[0], "invoice_number", sameProject)
  const after = patchRows(before, "invoice_number", "RE-1024", affected)

  assert.equal(after[2], before[2], "an untouched row is not even re-created")
  assert.equal(before[0].invoice_number, null, "the original rows are not mutated")
})

test("a failed inline save puts the old values back", () => {
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

// ---------------------------------------------------------------------------
// Editing does not disturb the filters that found the row
// ---------------------------------------------------------------------------

test("saving leaves the active filters exactly as they were", () => {
  // Nothing in the save path touches filter state: the inline editor patches
  // rows, and the dialogs re-read the page with the same filters in force.
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
