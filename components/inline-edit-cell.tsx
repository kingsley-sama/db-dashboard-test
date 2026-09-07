"use client"

import { Loader2, Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * A table cell you can type into.
 *
 * Click (or focus and press Enter) to edit, Enter or blur to save, Escape to
 * put the old value back. `onSave` must reject when the write fails: the cell
 * then stays open with the typed value and a red edge, so a failed save is
 * never left looking like a saved one. The row itself is updated by the parent,
 * which owns the data.
 */
export function InlineEditCell({
  value,
  onSave,
  label,
  hint,
  placeholder = "-",
  maxLength = 255,
}: {
  value: string | null | undefined
  /** Performs the write. Rejecting keeps the cell in edit mode. */
  onSave: (value: string) => Promise<void>
  /** Column name, used in the tooltips. */
  label?: string
  /** Extra tooltip line — e.g. that the value is shared across a project. */
  hint?: string
  placeholder?: string
  maxLength?: number
}) {
  const current = value == null ? "" : String(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Set while Escape is being handled so the blur it causes doesn't save.
  const cancelling = useRef(false)

  // Adopt a value changed elsewhere (another edit, a refresh) while idle.
  useEffect(() => {
    if (!editing) setDraft(current)
  }, [current, editing])

  useEffect(() => {
    if (!editing) return
    // Focus explicitly rather than relying on select() to do it, then select so
    // typing replaces the old value the way a spreadsheet cell does.
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEditing = () => {
    setDraft(current)
    setFailed(false)
    setEditing(true)
  }

  const cancel = () => {
    cancelling.current = true
    setDraft(current)
    setFailed(false)
    setEditing(false)
    // Cleared after the blur this triggers has been handled.
    setTimeout(() => {
      cancelling.current = false
    }, 0)
  }

  const commit = async () => {
    if (saving || cancelling.current) return
    const next = draft.trim()
    if (next === current.trim()) {
      setEditing(false)
      setFailed(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setFailed(false)
      setEditing(false)
    } catch {
      // The parent reverts the row and shows the error; keep the typed value
      // here so it can be retried without retyping it.
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        onDoubleClick={(e) => e.stopPropagation()}
        title={
          [`${label ?? "Value"}: click to edit`, hint].filter(Boolean).join(" — ")
        }
        className="group inline-flex items-center gap-1.5 min-w-0 max-w-full rounded px-1 py-0.5 -mx-1 text-left hover:bg-blue-50 focus:outline-none focus-visible:ring-2"
        style={{ color: current ? "#012e64" : "#8d9499", borderBottom: "1px dashed #b9d6f7" }}
      >
        <span className="truncate">{current || placeholder}</span>
        <Pencil
          className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "#5d6b88" }}
        />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={maxLength}
        disabled={saving}
        onChange={(e) => {
          setDraft(e.target.value)
          setFailed(false)
        }}
        onBlur={commit}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        }}
        title={failed ? "Could not be saved — press Enter to try again, Escape to undo" : undefined}
        className="min-w-0 w-full px-1.5 py-0.5 rounded text-sm bg-white"
        style={{
          border: `1px solid ${failed ? "#dc2626" : "#012e64"}`,
          color: "#012e64",
          userSelect: "text",
        }}
      />
      {saving && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: "#5d6b88" }} />}
    </span>
  )
}
