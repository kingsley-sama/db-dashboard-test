"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, Clock, AlertCircle, PlayCircle } from "lucide-react"

// The PM-facing control for the questionnaire handover.
//
// Marking the questionnaire as received is what starts the main project intake:
// the flag is written here, a database trigger notices the 'No' -> 'Yes'
// transition and fires the intake workflow. This component never calls the
// automation directly, so there is exactly one way for intake to start.
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

const STATE_LABEL: Record<IntakeState, string> = {
  pending_questionnaire: "Waiting for questionnaire",
  not_started: "Questionnaire received — intake not started",
  processing: "Intake running",
  completed: "Intake completed",
  failed: "Intake failed",
}

const STATE_STYLE: Record<IntakeState, { bg: string; fg: string }> = {
  pending_questionnaire: { bg: "#fef3c7", fg: "#92400e" },
  not_started: { bg: "#e0e7ff", fg: "#3730a3" },
  processing: { bg: "#dbeafe", fg: "#1e40af" },
  completed: { bg: "#dcfce7", fg: "#166534" },
  failed: { bg: "#fee2e2", fg: "#991b1b" },
}

function StateIcon({ state }: { state: IntakeState }) {
  if (state === "processing") return <Loader2 className="w-4 h-4 animate-spin" />
  if (state === "completed") return <CheckCircle2 className="w-4 h-4" />
  if (state === "failed") return <AlertCircle className="w-4 h-4" />
  return <Clock className="w-4 h-4" />
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
  const [state, setState] = useState<IntakeState>("pending_questionnaire")
  const [run, setRun] = useState<IntakeRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // Assumed false until the server says otherwise, so the controls can never
  // flash as usable for a PM who is not on this project.
  const [canManage, setCanManage] = useState(false)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  const base = `/api/projects/${encodeURIComponent(String(projectId))}`

  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`${base}/intake`)
      if (!res.ok) return
      const json = await res.json()
      setState(json.state as IntakeState)
      setRun(json.intake ?? null)
      setCanManage(json.can_manage === true)
      setBlockedReason(json.manage_blocked_reason ?? null)
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

  // While the workflow runs, poll so the PM sees it finish without a reload.
  useEffect(() => {
    if (state !== "processing") return
    const timer = setInterval(loadState, 5000)
    return () => clearInterval(timer)
  }, [state, loadState])

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

  return (
    <div
      className="col-span-2 rounded-lg border p-4"
      style={{ borderColor: "#d7dce3", backgroundColor: "#fbfcfd" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#012e64" }}>
            Questionnaire &amp; Intake
          </h3>
          <p className="text-xs" style={{ color: "#5d6b88" }}>
            Marking the questionnaire as received starts the project intake:
            brief, ClickUp task and orders.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          <StateIcon state={state} />
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium" style={{ color: "#012e64" }}>
          Questionnaire received
        </span>
        <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "#8d9499" }}>
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
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => runIntake("retry")}>
            Retry intake
          </Button>
        )}
      </div>

      {/* Read-only view: the panel still reports where intake stands, it just
          cannot be driven from here. */}
      {!canManage && blockedReason && (
        <p className="mt-3 text-xs" style={{ color: "#92400e" }}>
          {blockedReason}
        </p>
      )}

      {run?.triggered_at && (
        <p className="mt-3 text-xs" style={{ color: "#5d6b88" }}>
          Triggered {new Date(run.triggered_at).toLocaleString()}
          {run.attempts > 1 ? ` · attempt ${run.attempts}` : ""}
          {run.completed_at ? ` · finished ${new Date(run.completed_at).toLocaleString()}` : ""}
        </p>
      )}
      {state === "failed" && run?.last_error && (
        <p className="mt-2 text-xs" style={{ color: "#991b1b" }}>
          Last error: {run.last_error}
        </p>
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
