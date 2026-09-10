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

/**
 * Where a select's choices come from, when they aren't a fixed list:
 *   "product_codes"  the product_codes table, via /api/product-codes
 *   "enum:<name>"    a Postgres enum, via /api/projects/enums
 *   "order_status"   the order status values shared with the badges and tiles
 */
export type OptionSource = string

export type ProjectOrderFieldMeta = {
  label: string
  type: FieldType
  /** Text/enum only. */
  maxLength?: number
  /**
   * Section the field belongs to inside its half of the row. The combined edit
   * dialog is generated from these maps, so a field is grouped, labelled and
   * validated from one place and the form cannot drift from what the API takes.
   */
  group: string
  /** Fixed choices. */
  options?: readonly string[]
  /** Choices loaded at runtime — see OptionSource. */
  optionsFrom?: OptionSource
  /** Renders as a textarea. */
  multiline?: boolean
  /**
   * Set on a column that exists on *both* tables under one name, which the view
   * therefore exposes only once. The edit form shows it once and writes it to
   * both halves, so whichever copy the view reads back carries what was set and
   * the two tables don't drift apart. (This is what PUT /api/orders/[id]
   * already does for deposit.)
   */
  mirrored?: boolean
}

type Extra = Partial<Omit<ProjectOrderFieldMeta, "label" | "type" | "group">>

const text = (label: string, group: string, extra: Extra = {}): ProjectOrderFieldMeta => ({
  label,
  type: "text",
  maxLength: 255,
  group,
  ...extra,
})
const enumField = (label: string, group: string, extra: Extra = {}): ProjectOrderFieldMeta => ({
  label,
  type: "enum",
  maxLength: 64,
  group,
  ...extra,
})
const number = (label: string, group: string): ProjectOrderFieldMeta => ({
  label,
  type: "number",
  group,
})
const integer = (label: string, group: string): ProjectOrderFieldMeta => ({
  label,
  type: "integer",
  group,
})
const date = (label: string, group: string): ProjectOrderFieldMeta => ({
  label,
  type: "date",
  group,
})

const YES_NO = ["Yes", "No"] as const

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
  project_name: text("Project Name", "Project"),
  project_manager: enumField("Project Manager", "Project", {
    optionsFrom: "enum:project_manager",
  }),
  sales_person: enumField("Sales Person", "Project", { optionsFrom: "enum:sales_person" }),
  project_status: enumField("Project Status", "Project", {
    optionsFrom: "enum:project_status_values",
  }),
  project_type: enumField("Project Type", "Project", { optionsFrom: "enum:project_type_values" }),
  construction_type: enumField("Construction Type", "Project", {
    optionsFrom: "enum:construction_type_values",
  }),
  property_type: enumField("Property Type", "Project", {
    optionsFrom: "enum:property_type_values",
  }),
  client_contact_name: text("Client Contact", "Project"),
  company_email: text("Company Email", "Project"),
  email_id: integer("Email ID", "Project"),
  client_id: integer("Client ID", "Project"),
  path_to_files: text("Path to Files", "Project", { maxLength: 2048 }),
  // On both tables under one name, so the view shows one of them — see
  // `mirrored`.
  pm_type: enumField("PM Type", "Project", { optionsFrom: "enum:pm_type", mirrored: true }),
  deposit: enumField("Deposit", "Project", { options: YES_NO, mirrored: true }),

  // Invoicing — what this view exists to get done.
  invoice_number: text("Invoice Number", "Invoicing"),
  invoice_date: date("Invoice Date", "Invoicing"),
  invoice_paid_date: date("Invoice Paid Date", "Invoicing"),
  partial_invoice: text("Partial Invoice", "Invoicing"),
  partial_invoice_paid_date: date("Partial Invoice Paid", "Invoicing"),

  order_confirmation_date: date("Order Confirmation Date", "Project dates"),
  delivery_completion_date: date("Date First Delivery Complete", "Project dates"),
}

/**
 * `orders` columns the shared view may write — the set the Orders edit dialog
 * submits, minus identity (id, project_id) and questionnaire_received.
 *
 * pm_type and deposit sit on both tables; which one a request means is decided
 * by the half of the payload it arrives in, never by guessing.
 */
export const PROJECT_ORDER_ORDER_FIELDS: Record<string, ProjectOrderFieldMeta> = {
  product_name: enumField("Product Name", "Order", { optionsFrom: "product_codes" }),
  order_type: enumField("Order Type", "Order", {
    options: ["Standard", "Internal", "Free of Charge", "Express"],
  }),
  order_status: enumField("Order Status", "Order", { optionsFrom: "order_status" }),
  supplier: enumField("Supplier", "Order", { optionsFrom: "suppliers" }),
  supplier_payment: enumField("Supplier Payment", "Order", {
    options: ["Yes", "No", "Pending"],
  }),
  quantity: integer("Quantity", "Order"),
  unit_price: number("Unit Price", "Order"),
  cost: number("Cost", "Order"),
  discount: number("Discount", "Order"),
  comments: text("Comments", "Order", { maxLength: 5000, multiline: true }),
  // The order's own copies of two columns the projects table also has; the form
  // shows them once, under Project — see `mirrored` there.
  pm_type: enumField("PM Type", "Order", { optionsFrom: "enum:pm_type" }),
  deposit: enumField("Deposit", "Order", { options: YES_NO }),

  date_information_complete: date("Date Info Complete", "Order dates"),
  due_delivery_date: date("Due Delivery Date", "Order dates"),
  delivery_1_date: date("Delivery 1", "Order dates"),
  delivery_2_date: date("Delivery 2", "Order dates"),
  delivery_3_date: date("Delivery 3", "Order dates"),
  delivery_4_date: date("Delivery 4", "Order dates"),
  date_first_delivery_complete: date("Date First Delivery Complete", "Order dates"),
  project_completion_date: date("Date Project End", "Order dates"),

  delay_first_delivery: integer("Delay 1st Delivery (hours)", "Delays"),
  delay_first_revision: integer("Delay 1st Revision (hours)", "Delays"),
  delay_second_revision: integer("Delay 2nd Revision (hours)", "Delays"),
}

/**
 * Fields shown once but written to both halves — the columns that exist on both
 * tables under one name, which the view can therefore expose only once.
 */
export const MIRRORED_FIELDS = Object.entries(PROJECT_ORDER_PROJECT_FIELDS)
  .filter(([key, meta]) => meta.mirrored && key in PROJECT_ORDER_ORDER_FIELDS)
  .map(([key]) => key)

/** The section names of one half, in the order the form should render them. */
export const groupsOf = (fields: Record<string, ProjectOrderFieldMeta>): string[] => {
  const groups: string[] = []
  for (const meta of Object.values(fields)) {
    if (!groups.includes(meta.group)) groups.push(meta.group)
  }
  return groups
}

/** The fields of one section, in declaration order. */
export const fieldsInGroup = (
  fields: Record<string, ProjectOrderFieldMeta>,
  group: string
): [string, ProjectOrderFieldMeta][] =>
  Object.entries(fields).filter(([, meta]) => meta.group === group)

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
