"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  Sparkles,
} from "lucide-react"

// Review-and-confirm step between "Questionnaire Received" and the intake
// automation actually running.
//
// Nothing in this dialog mutates a business record until the PM presses the
// final button. Opening it, and running the order preview, are both read-only:
// the preview re-runs the workflow's own analysis nodes in dry-run mode and
// stores the result in a preview table the real intake never reads.
//
// The confirm action writes questionnaire_received = 'Yes' and stops there.
// Starting the automation is the database trigger's job
// (trg_projects_questionnaire_received), so there is exactly one code path into
// intake regardless of which screen the PM used.

type Warning = { field: string; message: string; blocking: boolean }

type ExpectedOrder = {
  product_name: string | null
  task_name: string | null
  quantity: number | string | null
  brief: string | null
}

type Preview = {
  project: Record<string, any>
  intake_state: string
  expected_outputs: { key: string; label: string; skipped?: boolean }[]
  existing_orders: any[]
  expected_orders: ExpectedOrder[]
  orders_source: string
  preview_job: { status: string; last_error: string | null } | null
  warnings: Warning[]
  can_manage: boolean
  manage_blocked_reason: string | null
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "#5d6b88" }}>
        {label}
      </dt>
      <dd className="text-sm font-medium" style={{ color: "#012e64" }}>
        {value || <span style={{ color: "#8d9499" }}>—</span>}
      </dd>
    </div>
  )
}

export function IntakeConfirmDialog({
  projectId,
  onClose,
  onStarted,
}: {
  projectId: string
  onClose: () => void
  onStarted: () => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState("")
  // Separate from `previewing` on purpose: this one gates the destructive
  // action and must never be cleared by a background refetch.
  const [confirming, setConfirming] = useState(false)
  // Portalled to <body> for the same reason as the intake panel: rendered in
  // place, an ancestor stacking context clips the backdrop.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const base = `/api/projects/${encodeURIComponent(projectId)}`

  // Always fetched fresh on open — the dialog must never confirm against the
  // data the Orders page happened to load minutes ago.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/intake-preview`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not load the project")
      setPreview(json)
      setError("")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    load()
  }, [load])

  // Poll while a dry run is in flight so the expected orders fill in.
  useEffect(() => {
    if (preview?.orders_source !== "processing") return
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [preview?.orders_source, load])

  const runPreview = async () => {
    setPreviewing(true)
    setPreviewError("")
    try {
      const res = await fetch(`${base}/intake-preview`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not start the order preview")
      await load()
    } catch (e: any) {
      setPreviewError(e.message)
    } finally {
      setPreviewing(false)
    }
  }

  const confirm = async () => {
    setConfirming(true)
    setError("")
    try {
      // Revalidate immediately before the write: the project may have been
      // started by another PM while this dialog was open.
      const check = await fetch(`${base}/intake-preview`, { cache: "no-store" })
      const fresh = await check.json()
      if (!check.ok) throw new Error(fresh?.error || "Could not re-check the project")

      if (fresh.intake_state !== "pending_questionnaire" && fresh.intake_state !== "not_started") {
        setPreview(fresh)
        throw new Error(
          `Intake is already ${fresh.intake_state} for this project. Nothing was changed.`
        )
      }

      // A project created with the questionnaire already 'Yes' has no
      // transition for the trigger to fire on, so it starts through the RPC
      // instead. Both paths are guarded in Postgres against running twice.
      if (fresh.intake_state === "not_started") {
        const res = await fetch(`${base}/intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Could not start intake")
        if (!json.started) throw new Error(json.reason || "Intake was not started")
      } else {
        // The 'No' -> 'Yes' write is the whole action. The trigger takes it
        // from here; the frontend never calls the automation itself.
        const res = await fetch(`${base}/questionnaire`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionnaire_received: "Yes" }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Could not update the questionnaire")
      }

      onStarted()
      onClose()
    } catch (e: any) {
      setError(e.message)
      setConfirming(false)
    }
  }

  const blocking = (preview?.warnings ?? []).filter((w) => w.blocking)
  const advisory = (preview?.warnings ?? []).filter((w) => !w.blocking)
  const startable =
    preview?.intake_state === "pending_questionnaire" || preview?.intake_state === "not_started"
  const canConfirm =
    !!preview && preview.can_manage && startable && blocking.length === 0 && !confirming

  if (!mounted) return null

  return createPortal(
    // z-[60] so it sits above the intake panel (z-50) it is opened from.
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl"
        style={{ borderColor: "#e5e5e5" }}
      >
        <CardHeader
          className="flex flex-row items-center justify-between bg-white sticky top-0 z-10"
          style={{ borderBottom: "1px solid #e5e5e5" }}
        >
          <div>
            <CardTitle style={{ color: "#012e64" }}>Confirm Project Intake</CardTitle>
            <CardDescription style={{ color: "#5d6b88" }}>
              {preview?.project?.project_name || projectId}
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            disabled={confirming}
            className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            style={{ color: "#5d6b88" }}
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "#5d6b88" }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading project…
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {preview && !loading && (
            <>
              {/* Project */}
              <section>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "#012e64" }}>
                  Project
                </h3>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-lg border p-3" style={{ borderColor: "#e5e5e5" }}>
                  <Field label="Project ID" value={preview.project.project_id} />
                  <Field label="Project Name" value={preview.project.project_name} />
                  <Field label="Client Contact" value={preview.project.client_contact_name} />
                  <Field label="Company Email" value={preview.project.company_email} />
                  <Field label="Project Type" value={preview.project.project_type} />
                  <Field label="Project Status" value={preview.project.project_status} />
                  <Field label="Project Manager" value={preview.project.project_manager} />
                  <Field label="Order Confirmation" value={preview.project.order_confirmation_date} />
                  <Field label="Questionnaire" value={preview.project.questionnaire_received ?? "No"} />
                </dl>
              </section>

              {/* Warnings */}
              {blocking.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-semibold">Missing required information</span>
                    <ul className="mt-1 list-disc pl-4 space-y-1">
                      {blocking.map((w) => (
                        <li key={w.field}>{w.message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {advisory.length > 0 && (
                <div className="rounded-lg border p-3" style={{ borderColor: "#fcd34d", backgroundColor: "#fffbeb" }}>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#92400e" }}>
                    <AlertTriangle className="w-4 h-4" />
                    Worth checking first
                  </div>
                  <ul className="mt-1 list-disc pl-6 text-xs space-y-1" style={{ color: "#92400e" }}>
                    {advisory.map((w) => (
                      <li key={w.field}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What will happen */}
              <section>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "#012e64" }}>
                  What starting intake will do
                </h3>
                <ul className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: "#e5e5e5" }}>
                  {preview.expected_outputs.map((output) => (
                    <li key={output.key} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: output.skipped ? "#8d9499" : "#16a34a" }}
                      />
                      <span style={{ color: output.skipped ? "#8d9499" : "#012e64" }}>
                        {output.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Already exists */}
              {preview.existing_orders.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: "#012e64" }}>
                    Already exists · {preview.existing_orders.length} order(s)
                  </h3>
                  <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "#e5e5e5" }}>
                    <table className="w-full text-sm">
                      <thead style={{ backgroundColor: "#f8fafc" }}>
                        <tr>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>Order ID</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>Product</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>Type</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>ClickUp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.existing_orders.map((order) => (
                          <tr key={order.id} style={{ borderTop: "1px solid #e5e5e5" }}>
                            <td className="px-3 py-2" style={{ color: "#012e64" }}>{order.order_id}</td>
                            <td className="px-3 py-2" style={{ color: "#012e64" }}>{order.product_name}</td>
                            <td className="px-3 py-2" style={{ color: "#5d6b88" }}>{order.product_type}</td>
                            <td className="px-3 py-2" style={{ color: "#5d6b88" }}>
                              {order.click_up_task_link ? "Linked" : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Expected orders (dry run) */}
              <section>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <h3 className="text-sm font-semibold" style={{ color: "#012e64" }}>
                    Will be created
                    {preview.expected_orders.length > 0 && ` · ${preview.expected_orders.length} order(s)`}
                  </h3>
                  {preview.can_manage && preview.orders_source !== "processing" && (
                    <Button type="button" size="sm" variant="outline" disabled={previewing} onClick={runPreview}>
                      {previewing ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-1.5" />
                      )}
                      {preview.orders_source === "not_requested" ? "Preview orders" : "Refresh preview"}
                    </Button>
                  )}
                </div>

                {previewError && (
                  <Alert variant="destructive" className="mb-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{previewError}</AlertDescription>
                  </Alert>
                )}

                <div className="rounded-lg border p-3" style={{ borderColor: "#e5e5e5" }}>
                  {preview.orders_source === "processing" && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#5d6b88" }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reading the client email thread and working out the orders…
                    </div>
                  )}

                  {preview.orders_source === "not_requested" && (
                    <p className="text-sm" style={{ color: "#5d6b88" }}>
                      The orders intake creates are decided by analysing the client email thread,
                      so they are not known until that analysis runs. Press{" "}
                      <span className="font-medium">Preview orders</span> to run it read-only —
                      it creates nothing.
                    </p>
                  )}

                  {preview.orders_source === "failed" && (
                    <p className="text-sm" style={{ color: "#991b1b" }}>
                      The preview failed: {preview.preview_job?.last_error || "unknown error"}.
                      You can still start intake — the preview is informational only.
                    </p>
                  )}

                  {preview.orders_source === "dry_run" && preview.expected_orders.length === 0 && (
                    <p className="text-sm" style={{ color: "#92400e" }}>
                      The analysis found no recognisable products in the email thread, so intake
                      would create no orders. Check that the questionnaire and confirmation emails
                      are in the project mailbox before starting.
                    </p>
                  )}

                  {preview.orders_source === "dry_run" && preview.expected_orders.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead style={{ backgroundColor: "#f8fafc" }}>
                          <tr>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>Product</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>Qty</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "#5d6b88" }}>ClickUp task</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.expected_orders.map((order, index) => (
                            <tr key={`${order.product_name}-${index}`} style={{ borderTop: "1px solid #e5e5e5" }}>
                              <td className="px-3 py-2" style={{ color: "#012e64" }}>{order.product_name}</td>
                              <td className="px-3 py-2" style={{ color: "#012e64" }}>{order.quantity ?? "—"}</td>
                              <td className="px-3 py-2 text-xs" style={{ color: "#5d6b88" }}>{order.task_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs" style={{ color: "#5d6b88" }}>
                        Predicted by the same workflow nodes the real run uses. The live run reads
                        the mailbox again, so a newly arrived email can still change this.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {!preview.can_manage && preview.manage_blocked_reason && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{preview.manage_blocked_reason}</AlertDescription>
                </Alert>
              )}

              {!startable && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Intake is already <span className="font-semibold">{preview.intake_state}</span>{" "}
                    for this project, so it cannot be started again.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>

        <div
          className="flex items-center justify-between gap-3 p-4 sticky bottom-0 bg-white flex-wrap"
          style={{ borderTop: "1px solid #e5e5e5" }}
        >
          <p className="text-xs max-w-sm" style={{ color: "#5d6b88" }}>
            Confirming marks the questionnaire as received and starts the intake automation, which
            creates orders and ClickUp tasks. This cannot be undone from here.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={confirming}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!canConfirm}>
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4 mr-1.5" />
                  Confirm &amp; Start Intake
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body
  )
}
