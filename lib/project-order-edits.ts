// ---------------------------------------------------------------------------
// Editing from the Project Orders shared view.
//
// The view itself is read-only — it is projects left-joined to the orders — so
// a write from it has to land on the underlying table. This module owns the
// small policy around that: which fields the view may write, who may write
// them, and what a submitted value has to look like. The route handler
// (app/api/project-orders/[id]/route.ts) does the database call; keeping the
// rules here keeps them server-safe, in one place, and testable.
//
// It is deliberately a whitelist. The Project Orders page shows almost every
// column of two tables, and the point of this endpoint is one field of one row
// — not a general-purpose "update anything you can see".
// ---------------------------------------------------------------------------

export type ProjectOrderFieldMeta = {
  /** Which table the column really lives on. */
  table: "projects"
  label: string
  maxLength: number
  /**
   * True when one stored value is shown on several rows of the view, because a
   * project repeats its details on each of its orders. The table says so on the
   * cell, so nobody expects a per-order value.
   */
  sharedAcrossProjectRows: boolean
}

/**
 * The fields the shared view can write.
 *
 * invoice_number is a `projects` column: a project has one invoice number and
 * every order row of that project shows it. Editing it from any of those rows
 * changes it for all of them.
 */
export const PROJECT_ORDER_EDITABLE_FIELDS: Record<string, ProjectOrderFieldMeta> = {
  invoice_number: {
    table: "projects",
    label: "Invoice Number",
    maxLength: 255,
    sharedAcrossProjectRows: true,
  },
}

/**
 * Roles allowed to write from the shared view.
 *
 * The view is visible to everyone except APMs (it carries order financials),
 * but writing project invoicing data is narrower: owners and admins, the same
 * pair that may delete an order. PMs keep read-only access, and the page hides
 * the editor for them rather than offering one the API would reject.
 */
export const PROJECT_ORDER_EDIT_ROLES = ["owner", "admin"] as const

export const canEditProjectOrders = (role: string | null | undefined): boolean =>
  PROJECT_ORDER_EDIT_ROLES.includes(role as (typeof PROJECT_ORDER_EDIT_ROLES)[number])

export type ProjectOrderUpdate =
  | { ok: true; update: Record<string, string | null> }
  | { ok: false; error: string }

/**
 * Validates a PUT body into the column/value pairs to write.
 *
 * Empty strings become NULL, matching how the create/edit dialogs store a
 * cleared field — so "blank" means one thing everywhere, and the "is blank"
 * filter finds a value cleared from this table.
 */
export function buildProjectOrderUpdate(body: unknown): ProjectOrderUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected an object of fields to update" }
  }

  const update: Record<string, string | null> = {}

  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    const meta = PROJECT_ORDER_EDITABLE_FIELDS[key]
    if (!meta) {
      return { ok: false, error: `${key} cannot be edited from Project Orders` }
    }
    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: `${meta.label} must be text` }
    }
    const value = raw === null ? "" : raw.trim()
    if (value.length > meta.maxLength) {
      return { ok: false, error: `${meta.label} must be ${meta.maxLength} characters or fewer` }
    }
    update[key] = value === "" ? null : value
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No editable fields were supplied" }
  }

  return { ok: true, update }
}

/**
 * The `id` the shared view reports for a row is a composite ("<project>-<order>"),
 * so the client sends the project's own primary key alongside it. Only a plain
 * positive integer is accepted — it goes straight into the update's `eq`.
 */
export function parseProjectPk(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
