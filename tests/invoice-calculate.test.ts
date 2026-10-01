// ---------------------------------------------------------------------------
// Supplier invoices: the pricing arithmetic, the orders it skips, and how an
// order's view type and price category are worked out from data it already
// carries.
//
// Run with `npm test`.
// ---------------------------------------------------------------------------

import test from "node:test"
import assert from "node:assert/strict"

import { calculateInvoice, formatEuro, type InvoiceOrderInput } from "../lib/invoices/calculate.ts"
import { resolveCategory, viewTypeOfProduct } from "../lib/invoices/categorize.ts"
import {
  EXTERIOR_CATEGORIES as EXT,
  INTERIOR_CATEGORIES as INT,
  PRICE_ROWS,
  hasPricesFor,
  type PriceRow,
} from "../lib/invoices/pricing.ts"
import { invoiceRequestSchema, invoiceReference } from "../lib/invoices/request.ts"

let nextId = 1
function order(overrides: Partial<InvoiceOrderInput> = {}): InvoiceOrderInput {
  const id = nextId++
  return {
    id,
    orderRef: `O-${id}`,
    projectId: "P-1",
    projectName: null,
    viewType: "exterior",
    categoryKey: EXT.SFH,
    quantity: 1,
    deliveryDate: "2026-09-15",
    ...overrides,
  }
}

const totalOf = (o: InvoiceOrderInput) => calculateInvoice([o], PRICE_ROWS).total

// --- the worked examples ----------------------------------------------------

test("1. SFH, quantity 1 → €23", () => {
  assert.equal(totalOf(order({ categoryKey: EXT.SFH, quantity: 1 })), 2300)
})

test("2. SFH, quantity 3 → €33", () => {
  const result = calculateInvoice([order({ categoryKey: EXT.SFH, quantity: 3 })], PRICE_ROWS)
  assert.equal(result.total, 3300)
  assert.deepEqual(
    result.lines[0].charges.map((c) => [c.chargeType, c.quantity, c.unitPrice, c.amount]),
    [
      ["modelling", 1, 1800, 1800],
      ["primary_view", 1, 500, 500],
      ["additional_view", 2, 500, 1000],
    ]
  )
})

test("3. Low-Rise & Duplex, quantity 2 → €37", () => {
  assert.equal(totalOf(order({ categoryKey: EXT.LOW_RISE, quantity: 2 })), 3700)
})

test("4. High-Rise, quantity 4 → €61", () => {
  assert.equal(totalOf(order({ categoryKey: EXT.HIGH_RISE, quantity: 4 })), 6100)
})

test("a single view has no additional-views charge", () => {
  const [line] = calculateInvoice([order({ quantity: 1 })], PRICE_ROWS).lines
  assert.deepEqual(line.charges.map((c) => c.chargeType), ["modelling", "primary_view"])
})

test("5. two orders in one project each pay their own modelling fee", () => {
  const result = calculateInvoice(
    [order({ projectId: "P-9", quantity: 1 }), order({ projectId: "P-9", quantity: 1 })],
    PRICE_ROWS
  )
  assert.equal(result.lines.length, 2)
  assert.ok(result.lines.every((l) => l.charges[0].chargeType === "modelling" && l.charges[0].amount === 1800))
  assert.equal(result.total, 4600)
})

// --- skipped orders ---------------------------------------------------------

test("6. quantity 0, empty or negative is skipped with the quantity message", () => {
  const zero = order({ orderRef: "Z", quantity: 0 })
  const empty = order({ orderRef: "E", quantity: null })
  const negative = order({ orderRef: "N", quantity: -2 })
  const result = calculateInvoice([zero, empty, negative], PRICE_ROWS)

  assert.equal(result.lines.length, 0)
  assert.equal(result.total, 0)
  assert.deepEqual(
    result.skipped.map((s) => s.reason),
    [
      "Order Z has no views (quantity is 0).",
      "Order E has no views (quantity is empty).",
      "Order N has no views (quantity is -2).",
    ]
  )
})

test("7. a Commercial order is skipped and leaves the total alone", () => {
  const result = calculateInvoice(
    [order({ categoryKey: EXT.SFH, quantity: 1 }), order({ categoryKey: EXT.COMMERCIAL, quantity: 5 })],
    PRICE_ROWS
  )
  assert.equal(result.total, 2300)
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].reason, "No price set for Commercial & Mixed-Use Projects (Exterior).")
})

test("8. an Interior order with no interior price rows is skipped", () => {
  const exteriorOnly: PriceRow[] = PRICE_ROWS.filter((r) => r.viewType === "exterior")
  const result = calculateInvoice([order({ viewType: "interior", categoryKey: INT.LIVING, quantity: 2 })], exteriorOnly)
  assert.equal(result.lines.length, 0)
  assert.equal(result.skipped[0].reason, "Unknown category 'Living Areas'.")
  assert.equal(hasPricesFor("interior", exteriorOnly), false)
})

test("9. an order with no category is skipped with the no-proposal reason", () => {
  const result = calculateInvoice([order({ projectId: "18760-02", categoryKey: null })], PRICE_ROWS)
  assert.equal(result.skipped[0].reason, "Project 18760-02 has no proposal, so its category is unknown.")
})

test("a category from the other view type's sheet is unknown", () => {
  const result = calculateInvoice([order({ viewType: "exterior", categoryKey: INT.KITCHENS })], PRICE_ROWS)
  assert.equal(result.skipped[0].reason, "Unknown category 'Kitchens'.")
})

test("10. a mixed invoice adds up exactly, with no floating-point drift", () => {
  const orders = [
    order({ categoryKey: EXT.SFH, quantity: 1 }), //         23.00
    order({ categoryKey: EXT.SFH, quantity: 3 }), //         33.00
    order({ categoryKey: EXT.LOW_RISE, quantity: 2 }), //    37.00
    order({ categoryKey: EXT.HIGH_RISE, quantity: 4 }), //   61.00
    order({ categoryKey: EXT.COMMERCIAL, quantity: 2 }), //  skipped
    order({ categoryKey: EXT.SFH, quantity: 0 }), //         skipped
  ]
  const result = calculateInvoice(orders, PRICE_ROWS)
  assert.equal(result.subtotal, 15400)
  assert.equal(result.total, 15400)
  assert.equal(result.vatRate, 0)
  assert.equal(result.orderCount, 4)
  assert.equal(result.viewCount, 10)
  assert.equal(result.skipped.length, 2)
  assert.ok(Number.isInteger(result.total))

  // Cents that would drift as floats (0.1 + 0.2): 3 × €0.10 + €0.20 must be €0.50.
  const odd: PriceRow[] = [
    { ...PRICE_ROWS[0], modellingFee: 10, primaryViewPrice: 10, additionalViewPrice: 10 },
  ]
  const drift = calculateInvoice([order({ quantity: 2 }), order({ quantity: 1 })], odd)
  assert.equal(drift.total, 50)
  assert.equal(formatEuro(drift.total), "€0.50")
})

test("interior rooms price from their own sheet", () => {
  const result = calculateInvoice(
    [
      order({ viewType: "interior", categoryKey: INT.LIVING, quantity: 3 }), //     15 + 10 + 2×5 = 35
      order({ viewType: "interior", categoryKey: INT.BATHROOMS, quantity: 1 }), //  10 + 6       = 16
      order({ viewType: "interior", categoryKey: INT.OUTDOOR, quantity: 2 }), //    10 + 7 + 5   = 22
    ],
    PRICE_ROWS
  )
  assert.deepEqual(result.lines.map((l) => l.total), [3500, 1600, 2200])
  assert.equal(result.total, 7300)
})

test("the price row in force on the delivery date is used", () => {
  const rows: PriceRow[] = [
    { ...PRICE_ROWS[0], effectiveFrom: "2020-01-01", effectiveTo: "2026-10-01" },
    { ...PRICE_ROWS[0], modellingFee: 2000, effectiveFrom: "2026-10-01", effectiveTo: null },
  ]
  assert.equal(calculateInvoice([order({ deliveryDate: "2026-09-30" })], rows).total, 2300)
  assert.equal(calculateInvoice([order({ deliveryDate: "2026-10-01" })], rows).total, 2500)
  assert.match(
    calculateInvoice([order({ deliveryDate: "2019-12-31" })], rows).skipped[0].reason,
    /^No price set for Single-Family Dwelling \(SFH\) \(Exterior\)\.$/
  )
})

test("formatEuro groups thousands", () => {
  assert.equal(formatEuro(123456), "€1,234.56")
  assert.equal(formatEuro(5), "€0.05")
  assert.equal(formatEuro(100000000), "€1,000,000.00")
})

// --- view type and category -------------------------------------------------

test("view type comes from the product", () => {
  assert.equal(viewTypeOfProduct("Exterior rendering"), "exterior")
  assert.equal(viewTypeOfProduct("Exterior rendering Bird View"), "exterior")
  assert.equal(viewTypeOfProduct("Interior rendering"), "interior")
  assert.equal(viewTypeOfProduct("3D floor plan"), null)
  assert.equal(viewTypeOfProduct(null), null)
})

test("exterior: the proposal's building type wins", () => {
  const cases: Array<[string, string]> = [
    ["EFH", EXT.SFH],
    ["Einfamilienhaus", EXT.SFH],
    ["DHH", EXT.LOW_RISE],
    ["MFH-3-5", EXT.HIGH_RISE],
    ["MFH-6-10", EXT.HIGH_RISE],
    ["MFH-11-15", EXT.HIGH_RISE],
    ["Mehrfamilienhaus", EXT.HIGH_RISE],
  ]
  for (const [proposalProjectType, expected] of cases) {
    const r = resolveCategory({ viewType: "exterior", proposalProjectType, projectName: "EFH Musterweg" })
    assert.deepEqual(r, { categoryKey: expected, source: "proposal", assumed: false }, proposalProjectType)
  }
})

test("exterior: a 'Custom' proposal falls through to the project name", () => {
  const r = resolveCategory({ viewType: "exterior", proposalProjectType: "Custom", projectName: "MFH, Otto-Wanner-Straße" })
  assert.deepEqual(r, { categoryKey: EXT.HIGH_RISE, source: "project-name", assumed: false })
})

test("exterior: commercial property with no other signal is Commercial", () => {
  const r = resolveCategory({ viewType: "exterior", projectName: "Intake automation test", propertyType: "Commercial" })
  assert.equal(r.categoryKey, EXT.COMMERCIAL)
  assert.equal(r.assumed, false)
})

test("exterior: nothing to go on → SFH, flagged assumed", () => {
  const r = resolveCategory({ viewType: "exterior", projectName: "Bornheim-Merten", propertyType: "Residential" })
  assert.deepEqual(r, { categoryKey: EXT.SFH, source: "default", assumed: true })
})

test("interior: the room named first in the comment decides", () => {
  const room = (comments: string) => resolveCategory({ viewType: "interior", comments }).categoryKey
  assert.equal(room("Change of POV living room on 04/30/26"), INT.LIVING)
  assert.equal(room("Change of plans bathroom, but it is within the revision 1"), INT.BATHROOMS)
  assert.equal(room("Küche und Wohnzimmer"), INT.KITCHENS)
  assert.equal(room("Home office next to the hallway"), INT.FUNCTIONAL)
  assert.equal(room("Dachterrasse mit Blick"), INT.OUTDOOR)
})

test("interior: no room words → property type, then Living Areas; both assumed", () => {
  assert.deepEqual(
    resolveCategory({ viewType: "interior", comments: "Budget: 66 EUR (regular)", propertyType: "Commercial" }),
    { categoryKey: INT.HOSPITALITY, source: "property-type", assumed: true }
  )
  assert.deepEqual(resolveCategory({ viewType: "interior", comments: null, propertyType: "Residential" }), {
    categoryKey: INT.LIVING,
    source: "default",
    assumed: true,
  })
})

// --- request validation -----------------------------------------------------

test("the request needs end ≥ start and a known view type", () => {
  const ok = { supplier: "Nhat", viewType: "exterior", startDate: "2026-09-01", endDate: "2026-09-01" }
  assert.equal(invoiceRequestSchema.safeParse(ok).success, true)
  assert.equal(invoiceRequestSchema.safeParse({ ...ok, endDate: "2026-08-31" }).success, false)
  assert.equal(invoiceRequestSchema.safeParse({ ...ok, viewType: "aerial" }).success, false)
  assert.equal(invoiceRequestSchema.safeParse({ ...ok, supplier: " " }).success, false)
  assert.equal(invoiceRequestSchema.safeParse({ ...ok, startDate: "01.09.2026" }).success, false)
})

test("the reference names supplier, view type and period", () => {
  assert.equal(
    invoiceReference({ supplier: "3D Sakura", viewType: "interior", startDate: "2026-09-01", endDate: "2026-09-30" }),
    "3D-SAKURA-INT-20260901-20260930"
  )
})
