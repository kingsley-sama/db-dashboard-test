"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { IntakeConfirmDialog } from "@/components/intake-confirm-dialog"

// The Project Intake block at the top of the Orders dashboard.
//
// PMs already sit on this screen to watch newly created orders appear, so the
// handover that produces those orders belongs here rather than on a page of its
// own. The section is collapsed to a row of counts until there is something to
// act on.
//
// Nothing here starts intake. The row button opens the confirmation dialog,
// which is where the review happens and where the single write lives.

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type QueueRow = {
  id: number
  project_id: string
  project_name: string | null
  project_manager: string | null
  project_type: string | null
  project_status: string | null
  client_contact_name: string | null
  intake_state: string
  order_confirmation_date: string | null
  existing_order_count: number
  last_error: string | null
  attempts: number | null
  triggered_at: string | null
  completed_at: string | null
  can_manage: boolean
  manage_blocked_reason: string | null
}

type Queue = {
  counts: Record<string, number>
  processing_runs: QueueRow[]
  failed: QueueRow[]
  recent_completed: QueueRow[]
  stale_after_minutes: number
  limit: number
  error?: string
}

// "4m", "2h 13m" — a run's age is the main signal that something is wrong, so
// it reads as elapsed time rather than a timestamp the PM has to subtract.
function elapsed(since: string | null) {
  if (!since) return null
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const TILES = [
  { key: "waiting", label: "Waiting", Icon: Clock, accent: "text-amber-600", iconBg: "bg-amber-100" },
  { key: "processing", label: "Processing", Icon: Loader2, accent: "text-blue-600", iconBg: "bg-blue-100" },
  { key: "completed", label: "Completed", Icon: CheckCircle2, accent: "text-emerald-600", iconBg: "bg-emerald-100" },
  { key: "failed", label: "Failed", Icon: XCircle, accent: "text-red-600", iconBg: "bg-red-100" },
] as const

// How each intake state reads to a PM. Used when a searched project is not
// actionable, so the row explains itself instead of offering a dead button.
const STATE_LABEL: Record<string, string> = {
  pending_questionnaire: "Waiting for questionnaire",
  not_started: "Ready to start",
  processing: "Intake running",
  completed: "Intake completed",
  failed: "Intake failed",
}

function ProjectRow({
  row,
  actionLabel,
  onAction,
  busy,
  staleAfterMinutes,
}: {
  row: QueueRow
  /** Omit to render the row read-only, labelled with its current state. */
  actionLabel?: string
  onAction?: () => void
  busy?: boolean
  /** Past this age a 'processing' run is called out as stalled. */
  staleAfterMinutes?: number
}) {
  // A run past the sweeper's timeout is almost certainly not coming back —
  // saying so here is what turns "it's been spinning for 2h" into something the
  // PM can act on.
  const stale =
    row.intake_state === "processing" &&
    !!row.triggered_at &&
    !!staleAfterMinutes &&
    Date.now() - new Date(row.triggered_at).getTime() > staleAfterMinutes * 60000

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap"
      style={{ borderTop: "1px solid #e5e5e5" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: "#012e64" }}>
            {row.project_name || row.project_id}
          </span>
          <span className="text-xs" style={{ color: "#8d9499" }}>
            {row.project_id}
          </span>
          {row.intake_state === "not_started" && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}
            >
              Questionnaire already marked received
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "#5d6b88" }}>
          {row.client_contact_name && <span>{row.client_contact_name}</span>}
          {row.project_type && <span>· {row.project_type}</span>}
          {row.project_manager && <span>· PM {row.project_manager}</span>}
          <span>
            ·{" "}
            {Number(row.existing_order_count) > 0
              ? `${row.existing_order_count} order(s) exist`
              : "Orders: not created yet"}
          </span>
        </div>
        {(row.intake_state === "processing" || row.intake_state === "completed") &&
          row.triggered_at && (
            <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "#5d6b88" }}>
              {row.intake_state === "processing" ? (
                <span>Running for {elapsed(row.triggered_at)}</span>
              ) : (
                <span>Finished {elapsed(row.completed_at)} ago</span>
              )}
              {Number(row.attempts) > 1 && <span>· attempt {row.attempts}</span>}
              {stale && (
                <span className="font-semibold" style={{ color: "#92400e" }}>
                  · no response — likely stalled
                </span>
              )}
            </div>
          )}
        {row.last_error && (
          <p className="text-xs mt-1" style={{ color: "#991b1b" }}>
            {row.last_error}
          </p>
        )}
      </div>

      {!actionLabel ? (
        // Found by search but not in a state that can be started or retried.
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold shrink-0"
          style={{ backgroundColor: "#eef2f7", color: "#5d6b88" }}
        >
          {STATE_LABEL[row.intake_state] ?? row.intake_state}
        </span>
      ) : row.can_manage ? (
        <Button type="button" size="sm" variant="outline" onClick={onAction} disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {actionLabel}
        </Button>
      ) : (
        <span className="text-xs" style={{ color: "#8d9499" }}>
          {row.manage_blocked_reason}
        </span>
      )}
    </div>
  )
}

export function ProjectIntakeSection({ onIntakeStarted }: { onIntakeStarted?: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<QueueRow | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  // Project-ID lookup. Deliberately explicit — the PM types the ID and submits,
  // rather than the list filtering as they type, so a typo produces a clear
  // "not found" instead of an empty list.
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")
  const [hit, setHit] = useState<QueueRow | null>(null)
  // The overlay is portalled to <body>, which does not exist during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Escape closes the panel, and the page behind it must not scroll while it
  // is open — the same behaviour the other dashboard modals have.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const { data, error, isLoading, mutate } = useSWR<Queue>(
    "/api/projects/intake-queue",
    fetcher,
    // Closed, this only feeds the badge, so it polls slowly. Open, it is the
    // live view of runs in flight and refreshes faster.
    { refreshInterval: open ? 20000 : 60000 }
  )

  const counts = data?.counts ?? {}
  const failed = data?.failed ?? []
  const processingRuns = data?.processing_runs ?? []
  const recentCompleted = data?.recent_completed ?? []
  const staleAfter = data?.stale_after_minutes

  const handleStarted = useCallback(() => {
    toast.success("Project intake started.")
    mutate()
    // Refresh the searched row too, so it reflects the new state rather than
    // still offering to start.
    if (hit) search(hit.project_id)
    onIntakeStarted?.()
  }, [mutate, onIntakeStarted, hit])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function search(value?: string) {
    const term = (value ?? query).trim()
    if (!term) {
      setHit(null)
      setSearchError("")
      return
    }

    setSearching(true)
    setSearchError("")
    try {
      const res = await fetch(
        `/api/projects/intake-queue?project_id=${encodeURIComponent(term)}`
      )
      const json = await res.json()
      if (!res.ok) {
        setHit(null)
        throw new Error(json?.error || "Could not look up that project")
      }
      setHit(json.project)
    } catch (e: any) {
      setSearchError(e.message)
    } finally {
      setSearching(false)
    }
  }

  // Retry goes through the same guarded RPC as everywhere else: only a failed
  // run can be retried, and the run's ledger is kept so orders and ClickUp
  // tasks that already succeeded are reused rather than duplicated.
  const retry = async (row: QueueRow) => {
    setRetryingId(row.project_id)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(row.project_id)}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not retry intake")
      if (!json.started) {
        toast.error(json.reason || "Nothing to retry")
      } else {
        toast.success("Intake retry started.")
        onIntakeStarted?.()
      }
      mutate()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRetryingId(null)
    }
  }

  const apiError = data?.error || (error ? "Could not load the intake queue" : "")

  // Everything a PM can act on right now. Drives the badge, so the button is
  // quiet until intake actually needs attention.
  const actionable = (counts.waiting ?? 0) + (counts.failed ?? 0)

  return (
    <>
      {/* Collapsed: a single control in the page header. The queue is a
          periodic errand, not something to watch, so it costs no page space
          until it is opened. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="relative shrink-0"
        title="Project Intake"
      >
        <ClipboardCheck className="w-4 h-4 mr-1.5" />
        Project Intake
        {actionable > 0 && (
          <span
            className="ml-2 inline-flex items-center justify-center rounded-full px-1.5 min-w-[1.25rem] h-5 text-xs font-semibold"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {actionable}
          </span>
        )}
        {(counts.processing ?? 0) > 0 && (
          <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" style={{ color: "#1e40af" }} />
        )}
      </Button>

      {/* Portalled to <body>: rendered in place it sat inside the page header,
          where the sidebar's own z-40 stacking context competed with it and the
          backdrop stopped short of the chrome. From <body> it covers the whole
          viewport like the order and project dialogs do. */}
      {!open || !mounted
        ? null
        : createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <Card
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl"
            style={{ borderColor: "#e5e5e5" }}
            // The backdrop closes the panel; clicks inside must not bubble to it.
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
              style={{ borderBottom: "1px solid #e5e5e5" }}
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" style={{ color: "#012e64" }} />
                <span
                  className="text-sm font-semibold uppercase tracking-wide"
                  style={{ color: "#012e64" }}
                >
                  Project Intake
                </span>
                {isLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#8d9499" }} />
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {TILES.map((tile) => (
                  <span
                    key={tile.key}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tile.iconBg} ${tile.accent}`}
                  >
                    <tile.Icon
                      className={`w-3.5 h-3.5 ${
                        tile.key === "processing" && (counts[tile.key] ?? 0) > 0
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    {counts[tile.key] ?? 0} {tile.label}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  style={{ color: "#5d6b88" }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
          {apiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          )}

          {/* Look up a specific project by ID. This is the primary way in — the
              lists below are for discovery when the PM does not have an ID to
              hand. */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#5d6b88" }}>
              Find a project
            </h3>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                search()
              }}
            >
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#8d9499" }}
                />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    // Clear the previous result as soon as the ID changes, so a
                    // stale hit can never be confirmed against a new ID.
                    setHit(null)
                    setSearchError("")
                  }}
                  placeholder="Enter a project ID, e.g. 18800-01"
                  className="pl-9 bg-white"
                  style={{ borderColor: "#8d9499", color: "#012e64" }}
                />
              </div>
              <Button type="submit" disabled={searching || !query.trim()}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find"}
              </Button>
            </form>

            {searchError && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{searchError}</AlertDescription>
              </Alert>
            )}

            {hit && (
              <div className="mt-2 rounded-lg border" style={{ borderColor: "#c7d2fe" }}>
                <ProjectRow
                  row={hit}
                  actionLabel={
                    hit.intake_state === "pending_questionnaire" || hit.intake_state === "not_started"
                      ? "Review & Start Intake"
                      : hit.intake_state === "failed"
                        ? "Retry intake"
                        : undefined
                  }
                  busy={retryingId === hit.project_id}
                  staleAfterMinutes={staleAfter}
                  onAction={() =>
                    hit.intake_state === "failed" ? retry(hit) : setConfirming(hit)
                  }
                />
              </div>
            )}
          </div>

          {/* Running now — the answer to "is the automation working, and on
              what?". Always rendered so an empty state is explicit rather than
              the section silently vanishing. */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#5d6b88" }}>
              Running now
            </h3>
            <div className="mt-2 rounded-lg border" style={{ borderColor: "#bfdbfe" }}>
              {processingRuns.length === 0 ? (
                <p className="px-3 py-3 text-sm" style={{ color: "#8d9499" }}>
                  {isLoading ? "Loading…" : "No intake is running right now."}
                </p>
              ) : (
                processingRuns.map((row) => (
                  <ProjectRow key={row.project_id} row={row} staleAfterMinutes={staleAfter} />
                ))
              )}
            </div>
          </div>

          {recentCompleted.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#5d6b88" }}>
                Recently completed
              </h3>
              <div className="mt-2 rounded-lg border" style={{ borderColor: "#e5e5e5" }}>
                {recentCompleted.map((row) => (
                  <ProjectRow key={row.project_id} row={row} />
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#991b1b" }}>
                Failed — safe to retry
              </h3>
              <div className="mt-2 rounded-lg border" style={{ borderColor: "#fecaca" }}>
                {failed.map((row) => (
                  <ProjectRow
                    key={row.project_id}
                    row={row}
                    actionLabel="Retry intake"
                    busy={retryingId === row.project_id}
                    onAction={() => retry(row)}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs" style={{ color: "#8d9499" }}>
                A retry reuses the orders and ClickUp tasks the failed run already created.
              </p>
            </div>
          )}
            </div>
          </Card>
        </div>,
        document.body
      )}

      {/* Rendered outside the panel so it stacks above it (z-[60] vs z-50). */}
      {confirming && (
        <IntakeConfirmDialog
          projectId={confirming.project_id}
          onClose={() => setConfirming(null)}
          onStarted={handleStarted}
        />
      )}
    </>
  )
}
