"use client"

import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// ---------------------------------------------------------------------------
// Shared per-column filter primitives used by the orders and projects tables.
//
// Filter kinds:
//   - "text"    free-text "contains" match (default)
//   - "multi"   multi-select dropdown of distinct values (pick any number)
//   - "numeric" comparison (=, >, <, >=, <=) against the amount in the cell
//   - "date"    from/to range, typed as dd/mm/yy (or dd/mm/yyyy)
// ---------------------------------------------------------------------------

export type NumericOp = "=" | ">" | "<" | ">=" | "<="
export type FilterKind = "text" | "multi" | "numeric" | "date"

export type ColumnFilter =
  | { kind: "text"; value: string }
  | { kind: "multi"; values: string[] }
  | { kind: "numeric"; op: NumericOp; value: string }
  | { kind: "date"; from: string; to: string }

export const defaultFilter = (kind: FilterKind): ColumnFilter => {
  switch (kind) {
    case "multi":
      return { kind: "multi", values: [] }
    case "numeric":
      return { kind: "numeric", op: "=", value: "" }
    case "date":
      return { kind: "date", from: "", to: "" }
    default:
      return { kind: "text", value: "" }
  }
}

// Pull a comparable number out of a displayed cell value, ignoring currency
// symbols, thousands separators, "%", "hours", etc. ("€1,234.56" -> 1234.56).
export const parseNumeric = (s: string): number | null => {
  const cleaned = s.replace(/[^0-9.\-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// Parse a user-typed dd/mm/yy or dd/mm/yyyy string. Two-digit years map to
// 2000+. Returns null for empty or malformed input (so a half-typed date
// doesn't blank out the table).
export const parseInputDate = (s: string): Date | null => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)
  if (m[3].length === 2) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (isNaN(d.getTime()) || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const isFilterActive = (filter: ColumnFilter): boolean => {
  switch (filter.kind) {
    case "multi":
      return filter.values.length > 0
    case "numeric":
      return parseNumeric(filter.value) !== null
    case "date":
      return parseInputDate(filter.from) !== null || parseInputDate(filter.to) !== null
    default:
      return filter.value.trim() !== ""
  }
}

// Compare the number shown in a cell against a numeric filter. Incomplete
// input passes (no-op); a non-numeric cell fails an active numeric filter.
export const matchesNumeric = (displayValue: string, filter: { op: NumericOp; value: string }): boolean => {
  const target = parseNumeric(filter.value)
  if (target === null) return true
  const cell = parseNumeric(displayValue)
  if (cell === null) return false
  switch (filter.op) {
    case ">":
      return cell > target
    case "<":
      return cell < target
    case ">=":
      return cell >= target
    case "<=":
      return cell <= target
    default:
      return cell === target
  }
}

export const matchesDate = (raw: any, filter: { from: string; to: string }): boolean => {
  const from = parseInputDate(filter.from)
  const to = parseInputDate(filter.to)
  if (!from && !to) return true
  if (raw == null || raw === "") return false
  const cell = new Date(raw)
  if (isNaN(cell.getTime())) return false
  const day = startOfDay(cell)
  if (from && day < startOfDay(from)) return false
  if (to && day > startOfDay(to)) return false
  return true
}

const inputClass = "w-full min-w-0 px-2 py-1 rounded text-xs bg-white"
const inputStyle = { border: "1px solid #cbd5e1", color: "#012e64" } as const

// --- UI components ---------------------------------------------------------

export function MultiSelectFilter({
  options,
  values,
  onChange,
}: {
  options: string[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener("mousedown", onDocClick)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [open])

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) })
    }
    setOpen((o) => !o)
  }

  const toggleValue = (opt: string) =>
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt])

  const label = values.length === 0 ? "All" : values.length === 1 ? values[0] : `${values.length} selected`

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`${inputClass} flex items-center justify-between gap-1 text-left`}
        style={{ ...inputStyle, color: values.length ? "#012e64" : "#8d9499" }}
        title={values.length ? values.join(", ") : "Select one or more"}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "#8d9499" }} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[60] rounded shadow-lg bg-white py-1 overflow-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 260, border: "1px solid #cbd5e1" }}
          >
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50"
                style={{ color: "#012e64" }}
              >
                Clear selection
              </button>
            )}
            {options.length === 0 && (
              <div className="px-3 py-1.5 text-xs" style={{ color: "#8d9499" }}>
                No values
              </div>
            )}
            {options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50"
                style={{ color: "#012e64" }}
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt)}
                  onChange={() => toggleValue(opt)}
                  className="h-3.5 w-3.5 accent-blue-700"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

const NUMERIC_OPS: NumericOp[] = ["=", ">", "<", ">=", "<="]

export function NumericFilter({
  filter,
  onChange,
}: {
  filter: { op: NumericOp; value: string }
  onChange: (filter: { kind: "numeric"; op: NumericOp; value: string }) => void
}) {
  return (
    <div className="flex gap-1">
      <select
        value={filter.op}
        onChange={(e) => onChange({ kind: "numeric", op: e.target.value as NumericOp, value: filter.value })}
        className="px-1 py-1 rounded text-xs bg-white shrink-0"
        style={{ ...inputStyle, width: 52 }}
        title="Comparison"
      >
        {NUMERIC_OPS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={filter.value}
        onChange={(e) => onChange({ kind: "numeric", op: filter.op, value: e.target.value })}
        placeholder="0"
        className={inputClass}
        style={inputStyle}
      />
    </div>
  )
}

export function DateRangeFilter({
  filter,
  onChange,
}: {
  filter: { from: string; to: string }
  onChange: (filter: { kind: "date"; from: string; to: string }) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        inputMode="numeric"
        value={filter.from}
        onChange={(e) => onChange({ kind: "date", from: e.target.value, to: filter.to })}
        placeholder="From dd/mm/yy"
        title="From date — type as dd/mm/yy, e.g. 25/06/26"
        className={inputClass}
        style={inputStyle}
      />
      <input
        type="text"
        inputMode="numeric"
        value={filter.to}
        onChange={(e) => onChange({ kind: "date", from: filter.from, to: e.target.value })}
        placeholder="To dd/mm/yy"
        title="To date — type as dd/mm/yy, e.g. 25/06/26"
        className={inputClass}
        style={inputStyle}
      />
    </div>
  )
}
