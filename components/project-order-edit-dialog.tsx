"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, X } from "lucide-react"

import { RecordScopeBanner } from "@/components/record-scope-banner"
import { useModalEscape, blockEnterKey } from "@/lib/modal-keyboard"
import { readJsonResponse } from "@/lib/table-utils"
import { ORDER_STATUSES } from "@/lib/order-status"
import { SUPPLIERS } from "@/lib/order-options"
import {
  MIRRORED_FIELDS,
  PROJECT_ORDER_ORDER_FIELDS,
  PROJECT_ORDER_PROJECT_FIELDS,
  fieldsInGroup,
  groupsOf,
  type ProjectOrderFieldMeta,
} from "@/lib/project-order-edits"

// ---------------------------------------------------------------------------
// Editing one row of the Project Orders shared view.
//
// A row is two records — one order, one project — and this is one form for
// both, split into two plainly marked halves so it is never in doubt which
// record a field belongs to, or how far a change reaches: the order half is
// this order alone, the project half lands on every order row of that project.
//
// The fields are generated from the same maps the API validates against
// (lib/project-order-edits.ts), so the form cannot offer a field the server
// would refuse, or miss one it accepts. Only the fields actually changed are
// sent, so an untouched value is never rewritten.
// ---------------------------------------------------------------------------

type Options = Record<string, string[]>

/** How a stored value is shown in an input. */
const toInput = (value: unknown, meta: ProjectOrderFieldMeta): string => {
  if (value === null || value === undefined) return ""
  if (meta.type === "date") return String(value).split("T")[0]
  return String(value)
}

const bothHalves = { project: PROJECT_ORDER_PROJECT_FIELDS, order: PROJECT_ORDER_ORDER_FIELDS }

export function ProjectOrderEditDialog({
  row,
  onClose,
  onUpdate,
}: {
  row: any
  onClose: () => void
  /** Saves the payload. Resolves `{ success: false }` to keep the form open. */
  onUpdate: (payload: any) => Promise<{ success: boolean; error?: string }>
}) {
  const hasOrder = row.order_pk != null

  // What the row held when the form opened — the baseline every change is
  // measured against, so a save carries only what was actually edited.
  const initial = useMemo(() => {
    const values: Record<string, string> = {}
    for (const [half, fields] of Object.entries(bothHalves)) {
      if (half === "order" && !hasOrder) continue
      for (const [key, meta] of Object.entries(fields)) {
        // A mirrored column appears once, under the project half.
        if (half === "order" && MIRRORED_FIELDS.includes(key)) continue
        values[key] = toInput(row[key], meta)
      }
    }
    return values
  }, [row, hasOrder])

  const [formData, setFormData] = useState<Record<string, string>>(initial)
  const [options, setOptions] = useState<Options>({
    order_status: [...ORDER_STATUSES],
    suppliers: [...SUPPLIERS],
  })
  const [loading, setLoading] = useState(false)
  // Guards against a double submit, the way the other dialogs do: `loading`
  // can't, because three clicks in one tick all read it before any re-render.
  const savingRef = useRef(false)
  const [error, setError] = useState("")

  useModalEscape(onClose, loading)

  // The choices that come from the database. Both endpoints are open to
  // everyone allowed to edit here; a failure leaves the selects with whatever
  // is stored, which stays selectable, so nothing gets silently cleared.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const next: Options = {}
      try {
        const response = await fetch("/api/projects/enums")
        const result = await readJsonResponse(response)
        if (response.ok && result.enums) {
          for (const [name, values] of Object.entries(result.enums as Record<string, string[]>)) {
            next[`enum:${name}`] = values
          }
        }
      } catch {
        // keep going — the product codes are worth loading either way
      }
      try {
        const response = await fetch("/api/product-codes")
        const result = await readJsonResponse(response)
        if (response.ok) {
          next.product_codes = (result.data || []).map((code: any) => code.name).filter(Boolean)
        }
      } catch {
        // leave it out; the stored product name stays selectable
      }
      if (!cancelled) setOptions((prev) => ({ ...prev, ...next }))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const setField = (key: string, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }))

  /** The fields whose value differs from what the row held when this opened. */
  const changed = useMemo(
    () => Object.keys(formData).filter((key) => formData[key] !== initial[key]),
    [formData, initial]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingRef.current) return
    if (changed.length === 0) {
      setError("Nothing has been changed yet")
      return
    }
    savingRef.current = true
    setLoading(true)
    setError("")

    const project: Record<string, string | null> = {}
    const order: Record<string, string | null> = {}

    for (const key of changed) {
      // "" means no value — the API stores it as NULL, so a cleared field is
      // found by the "is blank" filter rather than sitting as an empty string.
      const value = formData[key] === "" ? null : formData[key]
      if (key in PROJECT_ORDER_PROJECT_FIELDS) project[key] = value
      // A mirrored column is shown once and written to both, so whichever copy
      // the view reads back carries what was set.
      if (MIRRORED_FIELDS.includes(key) || !(key in PROJECT_ORDER_PROJECT_FIELDS)) {
        if (key in PROJECT_ORDER_ORDER_FIELDS) order[key] = value
      }
    }

    const payload: Record<string, unknown> = {}
    if (Object.keys(project).length > 0) payload.project = project
    if (Object.keys(order).length > 0) {
      payload.order = order
      // The view's order side comes from all_orders while the write goes to
      // orders; the server re-reads the row and checks it against these before
      // overwriting anything.
      payload.expect = { order_id: row.order_id ?? null, project_id: row.project_id }
    }

    const result = await onUpdate(payload)
    savingRef.current = false
    setLoading(false)
    if (!result.success && result.error) setError(result.error)
  }

  const renderField = (key: string, meta: ProjectOrderFieldMeta) => {
    const value = formData[key] ?? ""
    const isChanged = value !== (initial[key] ?? "")
    const label = (
      <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: "#012e64" }}>
        {meta.label}
        {isChanged && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
            title="Changed — will be saved"
          >
            edited
          </span>
        )}
      </label>
    )
    const border = isChanged ? "#b45309" : "#8d9499"

    if (meta.type === "enum") {
      const choices = (meta.options ? [...meta.options] : options[meta.optionsFrom ?? ""] ?? [])
      return (
        <div key={key} className={meta.multiline ? "col-span-2" : undefined}>
          {label}
          <select
            name={key}
            value={value}
            onChange={(e) => setField(key, e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white h-10"
            style={{ border: `1px solid ${border}`, color: "#012e64" }}
          >
            <option value="">Select...</option>
            {/* Whatever is stored stays selectable even when it isn't in the
                list — a retired code, or choices that failed to load. Without
                it the select would fall back to "Select..." and saving would
                clear a value nobody touched. */}
            {value && !choices.includes(value) && <option value={value}>{value}</option>}
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>
      )
    }

    if (meta.multiline) {
      return (
        <div key={key} className="col-span-2">
          {label}
          <Textarea
            name={key}
            value={value}
            onChange={(e) => setField(key, e.target.value)}
            rows={2}
            className="bg-white"
            style={{ borderColor: border, color: "#012e64" }}
          />
        </div>
      )
    }

    return (
      <div key={key}>
        {label}
        <Input
          name={key}
          type={meta.type === "date" ? "date" : meta.type === "text" ? "text" : "number"}
          step={meta.type === "number" ? "any" : undefined}
          value={value}
          onChange={(e) => setField(key, e.target.value)}
          className="bg-white"
          style={{ borderColor: border, color: "#012e64" }}
        />
      </div>
    )
  }

  const renderHalf = (fields: Record<string, ProjectOrderFieldMeta>, skip: string[] = []) =>
    groupsOf(fields)
      .map((group) => {
        const shown = fieldsInGroup(fields, group).filter(([key]) => !skip.includes(key))
        if (shown.length === 0) return null
        return (
          <div key={group} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <h3 className="text-sm font-semibold mt-2" style={{ color: "#012e64" }}>
                {group}
              </h3>
            </div>
            {shown.map(([key, meta]) => renderField(key, meta))}
          </div>
        )
      })
      .filter(Boolean)

  const orderName = row.order_id || (row.order_number ? `Order #${row.order_number}` : "This order")
  const projectName =
    [row.project_id, row.project_name].filter(Boolean).join(" — ") || "This project"

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onKeyDown={blockEnterKey}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl pt-0"
        style={{ borderColor: "#e5e5e5" }}
      >
        {/* Sticky, so the record being edited stays named however far down the
            form the user scrolls. See the note in the Orders dialog. */}
        <CardHeader
          className="sticky top-0 z-20 pt-6 flex flex-row items-center justify-between bg-white"
          style={{ borderBottom: "1px solid #e5e5e5" }}
        >
          <div className="min-w-0">
            <CardTitle style={{ color: "#012e64" }}>Edit row</CardTitle>
            <CardDescription className="truncate" style={{ color: "#5d6b88" }}>
              {hasOrder ? `${orderName}  ·  ${projectName}` : projectName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs" style={{ color: changed.length ? "#b45309" : "#8d9499" }}>
              {changed.length === 0
                ? "No changes"
                : `${changed.length} change${changed.length === 1 ? "" : "s"}`}
            </span>
            <Button
              type="submit"
              form="project-order-edit-form"
              disabled={loading || changed.length === 0}
              size="sm"
              className="text-white"
              style={{ backgroundColor: "#012e64" }}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              style={{ color: "#5d6b88" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError("")}
                  className="text-sm hover:underline font-medium ml-2"
                >
                  Dismiss
                </button>
              </AlertDescription>
            </Alert>
          )}

          <form id="project-order-edit-form" onSubmit={handleSubmit} className="space-y-4">
            {hasOrder ? (
              <>
                <RecordScopeBanner
                  scope="order"
                  name={orderName}
                  facts={[row.product_name || row.product, row.supplier]}
                  note="These fields are saved on this order alone — the project's other orders are untouched."
                />
                {/* A mirrored column is shown once, under Project — see
                    MIRRORED_FIELDS. */}
                {renderHalf(PROJECT_ORDER_ORDER_FIELDS, MIRRORED_FIELDS)}
              </>
            ) : (
              <RecordScopeBanner
                scope="order"
                name="No order on this row"
                note="This project has no orders yet, so there is nothing to edit on the order side."
              />
            )}

            {/* The seam between the two records. */}
            <div className="pt-2" style={{ borderTop: "2px solid #e5e5e5" }} />

            <RecordScopeBanner
              scope="project"
              name={projectName}
              facts={[row.company_name, row.client_contact_name]}
              note="These fields are saved on the project, so they apply to every order row of this project."
            />
            {renderHalf(PROJECT_ORDER_PROJECT_FIELDS)}

            <div
              className="flex items-center justify-end gap-3 pt-4"
              style={{ borderTop: "1px solid #e5e5e5" }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                style={{ borderColor: "#8d9499", color: "#012e64" }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || changed.length === 0}
                className="text-white"
                style={{ backgroundColor: "#012e64" }}
              >
                {loading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
