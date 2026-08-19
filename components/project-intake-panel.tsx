"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  PlayCircle,
  ExternalLink,
  ChevronDown,
} from "lucide-react"

// The PM-facing control for the questionnaire handover.
//
// Marking the questionnaire as received is what starts the main project intake:
// the flag is written here, a database trigger notices the 'No' -> 'Yes'
// transition and fires the intake workflow. This component never calls the
// automation directly, so there is exactly one way for intake to start.
//
// Everything below the controls is read back from the database rather than
// guessed at: `products` comes from the workflow's own idempotency ledger, and
// `history` from project_intake_run_history. That means the panel reports what
// intake actually did, and keeps reporting it correctly for a project that was
// retried more than once.
//
// `projectId` accepts either the numeric primary key or the business project_id.

type IntakeState =
  | "pending_questionnaire"
  | "not_started"
  | "processing"
  | "completed"
  | "failed"

interface IntakeRun {
  status: string
  attempts: number
  last_error: string | null
  triggered_at: string | null
  completed_at: string | null
}

interface IntakeProduct {
  product_name: string
  order_id: string | null
  clickup_task_id: string | null
  clickup_url: string | null
}

interface IntakeAttempt {
  run_id: string
  attempt: number
  status: string
  last_error: string | null
  started_at: string
  completed_at: string | null
}

interface IntakeSnapshot {
  state: IntakeState
  intake: IntakeRun | null
  products: IntakeProduct[]
  progress: { orders_claimed: number; clickup_created: number }
  history: IntakeAttempt[]
  is_stale: boolean
  stale_after_minutes: number
  questionnaire_received?: string | null
  can_manage: boolean
  manage_blocked_reason: string | null
}

const STATE_LABEL: Record<IntakeState, string> = {
  pending_questionnaire: "Waiting for questionnaire",
  not_started: "Ready to start",
  processing: "Running",
  completed: "Completed",
  failed: "Failed",
}

const STATE_STYLE: Record<IntakeState, { bg: string; fg: string }> = {
  pending_questionnaire: { bg: "#fef3c7", fg: "#92400e" },
  not_started: { bg: "#e0e7ff", fg: "#3730a3" },
  processing: { bg: "#dbeafe", fg: "#1e40af" },
  completed: { bg: "#dcfce7", fg: "#166534" },
  failed: { bg: "#fee2e2", fg: "#991b1b" },
}

function StateIcon({ state }: { state: IntakeState }) {
  if (state === "processing") return <Loader2 className="w-3.5 h-3.5 animate-spin" />
  if (state === "completed") return <CheckCircle2 className="w-3.5 h-3.5" />
  if (state === "failed") return <AlertCircle className="w-3.5 h-3.5" />
  return <Clock className="w-3.5 h-3.5" />
}

// What the workflow is doing right now, read from how far the ledger has got.
// The workflow claims an order per product, then creates that product's ClickUp
// task, and only uploads files once every order exists — so the gap between
// those two counts says which stage a run is in without the workflow having to
// report progress separately.
function stageLabel(snap: IntakeSnapshot): string | null {
  if (snap.state !== "processing") return null
  const { orders_claimed, clickup_created } = snap.progress
  if (orders_claimed === 0) return "Gathering context and generating the brief"
  if (clickup_created < orders_claimed) return "Creating ClickUp tasks and orders"
  return "Uploading files to ClickUp"
}

function timeAgo(iso: string | null) {
  if (!iso) return ""
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function ProjectIntakePanel({
  projectId,
  initialQuestionnaireReceived,
  onChange,
}: {
  projectId: string | number
  initialQuestionnaireReceived?: string | null
  onChange?: (questionnaireReceived: "Yes" | "No") => void
}) {
  const [received, setReceived] = useState<string | null>(
    initialQuestionnaireReceived ?? null
  )
  const [snap, setSnap] = useState<IntakeSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  // Re-render on a timer so the "updated Ns ago" reading does not go stale
  // between polls.
  const [, tick] = useState(0)
  const prevState = useRef<IntakeState | null>(null)

  const base = `/api/projects/${encodeURIComponent(String(projectId))}`
  const state = snap?.state ?? "pending_questionnaire"
  const canManage = snap?.can_manage === true

  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`${base}/intake`, { cache: "no-store" })
      if (!res.ok) return
      const json = (await res.json()) as IntakeSnapshot
      setSnap(json)
      setCheckedAt(new Date().toISOString())
      if (json.questionnaire_received !== undefined) {
        setReceived(json.questionnaire_received)
      }
    } catch {
      // Leave the last known state on a transient failure.
    }
  }, [base])

  useEffect(() => {
    loadState()
  }, [loadState])

  // Poll fast while the workflow runs so the PM sees it finish without a
  // reload, and slowly otherwise — intake can also be started from the trigger
  // when someone edits questionnaire_received elsewhere, and this panel should
  // notice that rather than sit on a stale "waiting" badge.
  useEffect(() => {
    const period = state === "processing" ? 5000 : 30000
    const timer = setInterval(loadState, period)
    return () => clearInterval(timer)
  }, [state, loadState])

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // A run that finishes while the panel is open should clear any stale notice
  // left over from the click that started it.
  useEffect(() => {
    if (prevState.current === "processing" && state !== "processing") setNotice("")
    prevState.current = state
  }, [state])

  const setQuestionnaire = async (value: "Yes" | "No") => {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch(`${base}/questionnaire`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire_received: value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not update the questionnaire")

      setReceived(value)
      onChange?.(value)
      await loadState()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const runIntake = async (action: "start" | "retry") => {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch(`${base}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not start intake")
      if (!json.started) setNotice(json.reason || "Nothing to do")
      await loadState()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const style = STATE_STYLE[state]
  const run = snap?.intake ?? null
  const products = snap?.products ?? []
  const history = snap?.history ?? []
  const stage = snap ? stageLabel(snap) : null

  return (
    <div
      className="col-span-2 rounded-lg border p-4"
      style={{ borderColor: "#d7dce3", backgroundColor: "#fbfcfd" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#012e64" }}>
            Questionnaire &amp; Intake
          </h3>
          <p className="text-xs" style={{ color: "#5d6b88" }}>
            Marking the questionnaire as received starts the project intake:
            brief, ClickUp task and orders.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: style.bg, color: style.fg }}
          >
            <StateIcon state={state} />
            {STATE_LABEL[state]}
          </span>
          {checkedAt && (
            <span className="text-[11px]" style={{ color: "#8d9499" }}>
              updated {timeAgo(checkedAt)}
            </span>
          )}
        </div>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium" style={{ color: "#012e64" }}>
          Questionnaire received
        </span>
        <div
          className="inline-flex rounded-md border overflow-hidden"
          style={{ borderColor: "#8d9499" }}
        >
          {(["Yes", "No"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy || !canManage}
              onClick={() => setQuestionnaire(value)}
              className="px-4 py-1.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={
                received === value
                  ? { backgroundColor: "#012e64", color: "#ffffff" }
                  : { backgroundColor: "#ffffff", color: "#5d6b88" }
              }
            >
              {value}
            </button>
          ))}
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#5d6b88" }} />}

        {/* Only offered when the transition trigger cannot have fired: the
            project was created with the questionnaire already in hand. */}
        {canManage && state === "not_started" && (
          <Button type="button" size="sm" disabled={busy} onClick={() => runIntake("start")}>
            <PlayCircle className="w-4 h-4 mr-1.5" />
            Start intake
          </Button>
        )}
        {canManage && state === "failed" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => runIntake("retry")}
          >
            Retry intake
          </Button>
        )}
      </div>

      {/* Read-only view: the panel still reports where intake stands, it just
          cannot be driven from here. */}
      {!canManage && snap?.manage_blocked_reason && (
        <p className="mt-3 text-xs" style={{ color: "#92400e" }}>
          {snap.manage_blocked_reason}
        </p>
      )}

      {/* ── Live stage ─────────────────────────────────────────────────── */}
      {stage && (
        <div
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2"
          style={{ backgroundColor: "#eff6ff" }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#1e40af" }} />
          <span className="text-xs font-medium" style={{ color: "#1e40af" }}>
            {stage}
          </span>
          {snap && snap.progress.orders_claimed > 0 && (
            <span className="text-xs" style={{ color: "#5d6b88" }}>
              · {snap.progress.clickup_created}/{snap.progress.orders_claimed} tasks created
            </span>
          )}
        </div>
      )}

      {/* A run past the sweeper's window is already dead; say so rather than
          leaving a spinner turning until the sweeper marks it failed. */}
      {snap?.is_stale && (
        <p className="mt-2 text-xs" style={{ color: "#92400e" }}>
          This run has been going for over {snap.stale_after_minutes} minutes and has
          probably stalled. It will be marked failed automatically, then it can be
          retried — anything it already created will be reused.
        </p>
      )}

      {/* ── What intake produced ───────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#012e64" }}>
            Orders created ({products.length})
          </p>
          <div className="rounded-md border overflow-hidden" style={{ borderColor: "#e5e9f0" }}>
            {products.map((p, i) => (
              <div
                key={p.product_name}
                className="flex items-center justify-between gap-3 px-3 py-2"
                style={{
                  backgroundColor: i % 2 ? "#ffffff" : "#f8fafc",
                  borderTop: i ? "1px solid #eef2f7" : undefined,
                }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "#012e64" }}>
                    {p.product_name}
                  </p>
                  {p.order_id && (
                    <p className="text-[11px]" style={{ color: "#8d9499" }}>
                      {p.order_id}
                    </p>
                  )}
                </div>
                {p.clickup_url ? (
                  <a
                    href={p.clickup_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold shrink-0"
                    style={{ color: "#1e40af" }}
                  >
                    ClickUp
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] shrink-0" style={{ color: "#92400e" }}>
                    no task yet
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Current run ────────────────────────────────────────────────── */}
      {run?.triggered_at && (
        <p className="mt-3 text-xs" style={{ color: "#5d6b88" }}>
          Triggered {new Date(run.triggered_at).toLocaleString()}
          {run.attempts > 1 ? ` · attempt ${run.attempts}` : ""}
          {run.completed_at
            ? ` · finished ${new Date(run.completed_at).toLocaleString()}`
            : ""}
        </p>
      )}
      {state === "failed" && run?.last_error && (
        <p className="mt-2 text-xs" style={{ color: "#991b1b" }}>
          Last error: {run.last_error}
        </p>
      )}

      {/* ── Attempt history ────────────────────────────────────────────── */}
      {history.length > 1 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: "#5d6b88" }}
          >
            <ChevronDown
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: showHistory ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            {history.length} attempts
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.map((h) => (
                <div
                  key={h.run_id}
                  className="rounded-md px-2.5 py-1.5"
                  style={{ backgroundColor: "#f5f7fa" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: "#012e64" }}>
                      Attempt {h.attempt}
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color:
                          h.status === "completed"
                            ? "#166534"
                            : h.status === "failed"
                              ? "#991b1b"
                              : "#1e40af",
                      }}
                    >
                      {h.status}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: "#8d9499" }}>
                    {new Date(h.started_at).toLocaleString()}
                    {h.completed_at ? ` → ${new Date(h.completed_at).toLocaleTimeString()}` : ""}
                  </p>
                  {h.last_error && (
                    <p className="text-[11px] mt-0.5" style={{ color: "#991b1b" }}>
                      {h.last_error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className="mt-2 text-xs" style={{ color: "#92400e" }}>
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </div>
  )
}
