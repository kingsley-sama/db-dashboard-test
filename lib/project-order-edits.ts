// ---------------------------------------------------------------------------
// Editing from the Project Orders shared view.
//
// The view itself is read-only — it is projects left-joined to the orders — so
// a write from it has to land on the underlying tables. This module owns the
// policy around that: which fields the view may write to each table, who may
// write them, and what a submitted value has to look like. The route handler
// (app/api/project-orders/[id]/route.ts) does the database calls; keeping the
// rules here keeps them server-safe, in one place, and testable.
//
// It is deliberately a whitelist. The page shows almost every column of two
// tables, and a row of it is two records — one project, one order — so the
// payload names which half each field belongs to rather than letting a name
// that exists on both (pm_type, deposit) land wherever it happens to match.
// ---------------------------------------------------------------------------

export type FieldType = "text" | "enum" | "number" | "integer" | "date"

export type ProjectOrderFieldMeta = {
  label: string
  type: FieldType
  /** Text/enum only. */
  maxLength?: number
}

const text = (label: string, maxLength = 255): ProjectOrderFieldMeta => ({
  label,
  type: "text",
  maxLength,
})
const enumField = (label: string): ProjectOrderFieldMeta => ({ label, type: "enum", maxLength: 64 })
const number = (label: string): ProjectOrderFieldMeta => ({ label, type: "number" })
const integer = (label: string): ProjectOrderFieldMeta => ({ label, type: "integer" })
const date = (label: string): ProjectOrderFieldMeta => ({ label, type: "date" })

/**
 * `projects` columns the shared view may write — the set the Projects edit
 * dialog submits, minus the ones it deliberately withholds.
 *
 * questionnaire_received is absent on purpose, exactly as it is in that dialog:
 * flipping it 'No' -> 'Yes' is what starts the project intake automation, and
 * that must be a deliberate act in the Projects module, never a side effect of
 * an invoicing edit made here.
 *
 * project_id, created_at and the trigger-derived columns (client_rating,
 * person_id) are absent because they are identity or derived, not editable.
 */
export const PROJECT_ORDER_PROJECT_FIELDS: Record<string, ProjectOrderFieldMeta> = {
  project_name: text("Project Name"),
  project_manager: enumField("Project Manager"),
  pm_type: enumField("PM Type"),
  sales_person: enumField("Sales Person"),
  project_type: enumField("Project Type"),
  construction_type: enumField("Construction Type"),
  property_type: enumField("Property Type"),
  project_status: enumField("Project Status"),
  deposit: enumField("Deposit"),
  client_contact_name: text("Client Contact"),
  company_email: text("Company Email"),
  path_to_files: text("Path to Files", 2048),
  email_id: integer("Email ID"),
  client_id: integer("Client ID"),

  // Invoicing — what this view exists to get done.
  invoice_number: text("Invoice Number"),
  invoice_date: date("Invoice Date"),
  invoice_paid_date: date("Invoice Paid Date"),
  partial_invoice: text("Partial Invoice"),
  partial_invoice_paid_date: date("Partial Invoice Paid"),
  order_confirmation_date: date("Order Confirmation Date"),
  delivery_completion_date: date("Date First Delivery Complete"),
}

/**
 * `orders` columns the shared view may write — the set the Orders edit dialog
 * submits, minus identity (id, project_id) and questionnaire_received.
 *
 * pm_type and deposit sit on both tables; which one a request means is decided
 * by the half of the payload it arrives in, never by guessing.
 */
export const PROJECT_ORDER_ORDER_FIELDS: Record<string, ProjectOrderFieldMeta> = {
  product_name: text("Product Name"),
  supplier: enumField("Supplier"),
  order_type: enumField("Order Type"),
  order_status: enumField("Order Status"),
  pm_type: enumField("PM Type"),
  supplier_payment: enumField("Supplier Payment"),
  deposit: enumField("Deposit"),
  comments: text("Comments", 5000),

  quantity: integer("Quantity"),
  cost: number("Cost"),
  unit_price: number("Unit Price"),
  discount: number("Discount"),
  delay_first_delivery: integer("Delay 1st Delivery"),
  delay_first_revision: integer("Delay 1st Revision"),
  delay_second_revision: integer("Delay 2nd Revision"),

  date_information_complete: date("Date Info Complete"),
  due_delivery_date: date("Due Delivery Date"),
  delivery_1_date: date("delivery_1"),
  delivery_2_date: date("delivery_2"),
  delivery_3_date: date("delivery_3"),
  delivery_4_date: date("delivery_4"),
  date_first_delivery_complete: date("Date First Delivery Complete"),
  project_completion_date: date("Date Project End"),
}

/**
 * Columns typed straight into the table body, without opening a dialog. A
 * subset of the project fields above — the one the invoicing pass is made of.
 */
export const INLINE_EDITABLE_FIELDS = ["invoice_number"] as const

/** True when one stored value shows on every order row of its project. */
export const isProjectScopedField = (key: string): boolean =>
  key in PROJECT_ORDER_PROJECT_FIELDS

/**
 * Roles allowed to write from the shared view.
 *
 * The view is visible to everyone except APMs (it carries order financials),
 * but writing is narrower: owners and admins, the same pair that may delete an
 * order. PMs keep read-only access, and the page hides the editors for them
 * rather than offering ones the API would refuse.
 */
export const PROJECT_ORDER_EDIT_ROLES = ["owner", "admin"] as const

export const canEditProjectOrders = (role: string | null | undefined): boolean =>
  PROJECT_ORDER_EDIT_ROLES.includes(role as (typeof PROJECT_ORDER_EDIT_ROLES)[number])

export type ProjectOrderUpdate =
  | { ok: true; update: Record<string, string | number | null> }
  | { ok: false; error: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/

/**
 * Validates one half of a submitted payload into the columns to write.
 *
 * Empty means NULL throughout, matching how the create/edit dialogs store a
 * cleared field — so "blank" means one thing everywhere, and a value cleared
 * here is found by the "is blank" filter.
 */
export function buildProjectOrderUpdate(
  body: unknown,
  fields: Record<string, ProjectOrderFieldMeta>
): ProjectOrderUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected an object of fields to update" }
  }

  const update: Record<string, string | number | null> = {}

  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    const meta = fields[key]
    if (!meta) {
      return { ok: false, error: `${key} cannot be edited from Project Orders` }
    }
    const value = coerce(raw, meta)
    if (value === INVALID) {
      return { ok: false, error: describeExpected(meta) }
    }
    update[key] = value
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No editable fields were supplied" }
  }

  return { ok: true, update }
}

const INVALID = Symbol("invalid")

const coerce = (raw: unknown, meta: ProjectOrderFieldMeta): string | number | null | typeof INVALID => {
  if (raw === null || raw === undefined) return null

  switch (meta.type) {
    case "number":
    case "integer": {
      if (typeof raw === "number") {
        if (!Number.isFinite(raw)) return INVALID
        if (meta.type === "integer" && !Number.isInteger(raw)) return INVALID
        return raw
      }
      if (typeof raw !== "string") return INVALID
      const trimmed = raw.trim()
      if (trimmed === "") return null
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) return INVALID
      if (meta.type === "integer" && !Number.isInteger(parsed)) return INVALID
      return parsed
    }
    case "date": {
      if (typeof raw !== "string") return INVALID
      const trimmed = raw.trim()
      if (trimmed === "") return null
      // The date inputs submit YYYY-MM-DD; a full ISO instant is accepted too,
      // so a value read back off a row can be sent again unchanged.
      if (!ISO_DATE.test(trimmed) || isNaN(Date.parse(trimmed))) return INVALID
      return trimmed
    }
    default: {
      if (typeof raw !== "string") return INVALID
      const trimmed = raw.trim()
      if (trimmed === "") return null
      if (meta.maxLength && trimmed.length > meta.maxLength) return INVALID
      return trimmed
    }
  }
}

const describeExpected = (meta: ProjectOrderFieldMeta): string => {
  switch (meta.type) {
    case "number":
      return `${meta.label} must be a number`
    case "integer":
      return `${meta.label} must be a whole number`
    case "date":
      return `${meta.label} must be a date`
    default:
      return meta.maxLength
        ? `${meta.label} must be text of ${meta.maxLength} characters or fewer`
        : `${meta.label} must be text`
  }
}

/**
 * The row id the shared view reports is a composite — "<project>-<order>", or
 * "<project>-none" for a project with no orders — because one project can
 * appear on several rows. Both halves are plain positive integers; anything
 * else is refused, since they are what the update is addressed by.
 */
export function parseProjectOrderRowId(
  raw: string | null | undefined
): { projectPk: number; orderPk: number | null } | null {
  if (!raw) return null
  const [projectPart, orderPart, ...rest] = raw.split("-")
  if (rest.length > 0) return null

  const projectPk = parsePk(projectPart)
  if (projectPk === null) return null

  if (orderPart === undefined || orderPart === "none") {
    return { projectPk, orderPk: null }
  }
  const orderPk = parsePk(orderPart)
  return orderPk === null ? null : { projectPk, orderPk }
}

const parsePk = (raw: string | undefined): number | null => {
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Kept for the project-only address the inline cell editor uses. */
export const parseProjectPk = (raw: string | null | undefined): number | null =>
  parsePk(raw ?? undefined)

/**
 * The row the client believed it was editing.
 *
 * The view's order side comes from `all_orders` while the write goes to
 * `orders`, so the row is re-read and checked against the business keys the
 * client saw before anything is overwritten. It catches the two ways this could
 * silently hit the wrong record: the two tables not sharing a key space, and
 * the row having been replaced since the page loaded.
 */
export type ExpectedOrder = { order_id: string | null; project_id: string | null }

export const parseExpectedOrder = (raw: unknown): ExpectedOrder | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const asKey = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v : null)
  if (value.order_id !== null && value.order_id !== undefined && typeof value.order_id !== "string") {
    return null
  }
  if (typeof value.project_id !== "string") return null
  return { order_id: asKey(value.order_id), project_id: value.project_id }
}

export const orderMatchesExpectation = (
  row: { order_id?: unknown; project_id?: unknown } | null | undefined,
  expected: ExpectedOrder
): boolean => {
  if (!row) return false
  const same = (a: unknown, b: string | null) =>
    (a === null || a === undefined ? "" : String(a)) === (b ?? "")
  return same(row.order_id, expected.order_id) && same(row.project_id, expected.project_id)
}
