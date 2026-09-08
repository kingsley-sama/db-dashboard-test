"use client"

import { CalendarDays, ChevronDown, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { createPortal } from "react-dom"
import type { CSSProperties } from "react"
import type { DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"

// ---------------------------------------------------------------------------
// Shared per-column filter primitives used by the orders and projects tables.
//
// Filter kinds:
//   - "text"    free-text match (default)
//   - "multi"   multi-select dropdown of distinct values (pick any number)
//   - "numeric" comparison against the amount in the cell
//   - "date"    single date or range, chosen from a calendar picker (stored as
//               mm/dd/yy or mm/dd/yy-mm/dd/yy so older typed filters still parse)
//
// Each kind carries an operator, chosen from the small dropdown to the left of
// its value control: contains / is / is not / is populated / is blank and so
// on, per kind (see FILTER_OPERATORS). "Is populated" and "is blank" hide the
// value control — they ask about the column itself.
// ---------------------------------------------------------------------------

// The filter shapes, operators and the `isFilterActive` predicate live in
// lib/column-filters.ts so the API routes can share them (a route can't import
// this file — it's a client component). Re-exported here so existing importers
// keep working.
import {
  FILTER_OPERATORS,
  buildDateFilter,
  describeFilter,
  filterOp,
  isFilterActive,
  isPresenceOp,
  operatorMeta,
  parseDateRange,
  parseNumeric,
  startOfDay,
  withOp,
  type ColumnFilter,
  type DateOp,
  type FilterKind,
  type FilterOp,
} from "@/lib/column-filters"

export type {
  NumericOp,
  FilterKind,
  FilterOp,
  ColumnFilter,
  PresenceOp,
} from "@/lib/column-filters"
export {
  defaultFilter,
  isFilterActive,
  describeFilter,
  filterOp,
  isPresenceOp,
  buildDateFilter,
  parseDateRange,
  parseInputDate,
  parseNumeric,
} from "@/lib/column-filters"

// Compare the number shown in a cell against a numeric filter. Incomplete
// input passes (no-op); a non-numeric cell fails an active numeric filter.
export const matchesNumeric = (
  displayValue: string,
  filter: { op: string; value: string }
): boolean => {
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

export const matchesDate = (raw: any, filter: { text: string }): boolean => {
  const { from, to } = parseDateRange(filter.text)
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

/** Whether a trigger is still within the viewport, even partly. */
const isOnScreen = (r: DOMRect): boolean =>
  r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth

/**
 * Keeps a floating panel attached to its trigger, and closes it when the user
 * clicks away, presses Escape, or scrolls the trigger out of sight.
 *
 * The panels are position:fixed so they can escape the table's overflow, which
 * means a scroll or a resize outside them would otherwise leave them stranded
 * where the trigger used to be. `reposition` moves the panel back onto the
 * trigger and reports whether the trigger is still on screen; only when it
 * isn't does the panel close. Simply closing on any outside scroll — which is
 * what these panels used to do — also closed them on the scroll the opening
 * click itself causes when the trigger is only partly visible, so a filter at
 * the edge of a table this wide flashed open and shut.
 *
 * Scrolling *inside* the panel is the user reading its own list.
 */
const useDismissOnOutside = (
  open: boolean,
  setOpen: (open: boolean) => void,
  refs: RefObject<HTMLElement | null>[],
  reposition?: () => boolean
) => {
  useEffect(() => {
    if (!open) return
    const insideAny = (target: Node) => refs.some((ref) => ref.current?.contains(target))
    const onDocClick = (e: MouseEvent) => {
      if (!insideAny(e.target as Node)) setOpen(false)
    }
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onScroll = (e: Event) => {
      if (insideAny(e.target as Node)) return
      if (reposition?.()) return
      close()
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", onScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

// --- Operator picker -------------------------------------------------------

/**
 * The "choose an operator" half of a column filter: a compact button showing
 * the operator's glyph, and a menu of the operators that make sense for the
 * column's kind. Its full name is on the button's tooltip, and the active
 * filter chips above the table spell the whole condition out.
 */
export function FilterOperatorSelect({
  filter,
  onChange,
  label,
}: {
  filter: ColumnFilter
  onChange: (filter: ColumnFilter) => void
  /** Column name, used in the tooltip so the condition reads as a sentence. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const kind: FilterKind = filter.kind
  const current = filterOp(filter)
  const meta = operatorMeta(kind, current)
  const operators = FILTER_OPERATORS[kind]

  /** Puts the panel under the button. False once the button is off screen. */
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r || !isOnScreen(r)) return false
    const width = 170
    const height = operators.length * 30 + 8
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const top =
      r.bottom + height > window.innerHeight - 8
        ? Math.max(8, r.top - height - 4)
        : r.bottom + 4
    setPos({ top, left })
    return true
  }

  useDismissOnOutside(open, setOpen, [panelRef, btnRef], place)

  const toggleOpen = () => {
    if (!open) place()
    setOpen((o) => !o)
  }

  const pick = (op: FilterOp) => {
    onChange(applyOperator(filter, op))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        title={`${label ? `${label}: ` : ""}${meta.label} — click to change the operator`}
        aria-label={`Filter operator: ${meta.label}`}
        className="shrink-0 flex items-center justify-center gap-0.5 rounded text-xs bg-white cursor-pointer"
        style={{
          ...inputStyle,
          width: 34,
          height: 26,
          fontWeight: 600,
          color: isPresenceOp(current) ? "#012e64" : "#5d6b88",
          backgroundColor: isPresenceOp(current) ? "#e8f1fd" : "#ffffff",
        }}
      >
        <span className="leading-none">{meta.glyph}</span>
        <ChevronDown className="w-2.5 h-2.5 shrink-0" style={{ color: "#8d9499" }} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[70] rounded shadow-lg bg-white py-1"
            style={{ top: pos.top, left: pos.left, width: 170, border: "1px solid #cbd5e1" }}
          >
            {operators.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => pick(entry.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50"
                style={{
                  color: "#012e64",
                  fontWeight: entry.value === current ? 600 : 400,
                  backgroundColor: entry.value === current ? "#f0f7ff" : undefined,
                }}
              >
                <span className="w-4 text-center" style={{ color: "#5d6b88" }}>
                  {entry.glyph}
                </span>
                <span className="truncate">{entry.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * Switches a filter's operator. "Before"/"after" compare against one day, so a
 * range typed under "on / between" collapses to its first date rather than
 * being silently half-used.
 */
const applyOperator = (filter: ColumnFilter, op: FilterOp): ColumnFilter => {
  if (filter.kind !== "date" || (op !== "before" && op !== "after")) {
    return withOp(filter, op)
  }
  const { from, to } = parseDateRange(filter.text)
  const day = from ?? to
  return day ? buildDateFilter(formatDate(day), op as DateOp) : withOp(filter, op)
}

// --- Value controls --------------------------------------------------------

export function MultiSelectFilter({
  options,
  values,
  onChange,
  onOpen,
}: {
  options: string[]
  values: string[]
  onChange: (values: string[]) => void
  /** Fired when the panel opens, so options can be loaded on demand. */
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r || !isOnScreen(r)) return false
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) })
    return true
  }

  useDismissOnOutside(open, setOpen, [panelRef, btnRef], place)

  const toggleOpen = () => {
    if (!open) {
      place()
      onOpen?.()
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

function NumericValueInput({
  filter,
  onChange,
}: {
  filter: Extract<ColumnFilter, { kind: "numeric" }>
  onChange: (filter: ColumnFilter) => void
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={filter.value}
      onChange={(e) => onChange({ ...filter, value: e.target.value })}
      placeholder="0"
      title="Value to compare against"
      className={inputClass}
      style={inputStyle}
    />
  )
}

// --- Date picker -----------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0")

// Serialize back into the mm/dd/yy text the filter logic already understands.
const formatDate = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${pad2(d.getFullYear() % 100)}`

const serializeRange = (from: Date | null, to: Date | null): string => {
  if (!from && !to) return ""
  if (from && to) return startOfDay(from) === startOfDay(to) ? formatDate(from) : `${formatDate(from)}-${formatDate(to)}`
  if (from) return `${formatDate(from)}-`
  return `-${formatDate(to!)}`
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// Quick ranges, resolved against "today" when the panel is opened.
const PRESETS: { label: string; range: (today: Date) => { from: Date; to: Date } }[] = [
  { label: "Today", range: (t) => ({ from: t, to: t }) },
  { label: "Yesterday", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { label: "Last 7 days", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { label: "Last 30 days", range: (t) => ({ from: addDays(t, -29), to: t }) },
  {
    label: "This month",
    range: (t) => ({ from: new Date(t.getFullYear(), t.getMonth(), 1), to: t }),
  },
  {
    label: "Last month",
    range: (t) => ({
      from: new Date(t.getFullYear(), t.getMonth() - 1, 1),
      to: new Date(t.getFullYear(), t.getMonth(), 0),
    }),
  },
  {
    label: "This year",
    range: (t) => ({ from: new Date(t.getFullYear(), 0, 1), to: t }),
  },
]

const PANEL_WIDTH = 470
const SINGLE_PANEL_WIDTH = 340

// Recolor the shared shadcn calendar to the table's navy palette by overriding
// the theme tokens it reads (globals.css stores them as bare HSL triplets).
const calendarTheme = {
  "--primary": "213 98% 20%", // #012e64 — range ends / single day
  "--primary-foreground": "0 0% 100%",
  "--accent": "213 45% 92%", // days between the two ends
  "--accent-foreground": "213 98% 20%",
} as CSSProperties

export function DateRangeFilter({
  filter,
  onChange,
}: {
  filter: Extract<ColumnFilter, { kind: "date" }>
  onChange: (filter: ColumnFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const op = filterOp(filter) as DateOp
  // "Before"/"after" compare against one day, so the panel picks a single day
  // and drops the range presets.
  const singleDay = op === "before" || op === "after"
  const width = singleDay ? SINGLE_PANEL_WIDTH : PANEL_WIDTH

  const { from, to } = parseDateRange(filter.text)
  const selected: DateRange | undefined = from || to ? { from: from ?? undefined, to: to ?? undefined } : undefined

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r || !isOnScreen(r)) return false
    // Keep the panel on screen: flip above when it would run off the bottom,
    // and pull it left when it would run off the right edge.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const estHeight = 360
    const top = r.bottom + estHeight > window.innerHeight - 8 ? Math.max(8, r.top - estHeight - 4) : r.bottom + 4
    setPos({ top, left })
    return true
  }

  useDismissOnOutside(open, setOpen, [panelRef, btnRef], place)

  const toggleOpen = () => {
    if (!open) place()
    setOpen((o) => !o)
  }

  const commit = (range: DateRange | undefined) =>
    onChange(buildDateFilter(serializeRange(range?.from ?? null, range?.to ?? null), op))

  const commitDay = (day: Date | undefined) =>
    onChange(buildDateFilter(day ? formatDate(day) : "", op))

  const label = !from && !to
    ? singleDay
      ? "Pick a date"
      : "All dates"
    : singleDay
    ? formatDate((from ?? to)!)
    : from && to && startOfDay(from) === startOfDay(to)
    ? formatDate(from)
    : `${from ? formatDate(from) : "…"} – ${to ? formatDate(to) : "…"}`

  const today = new Date()

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`${inputClass} flex items-center gap-1.5 text-left`}
        style={{ ...inputStyle, color: from || to ? "#012e64" : "#8d9499" }}
        title={singleDay ? "Pick the date to compare against" : "Pick a single date or a date range"}
      >
        <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: "#8d9499" }} />
        <span className="truncate flex-1">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "#8d9499" }} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[60] flex rounded-md shadow-lg bg-white overflow-hidden"
            style={{ top: pos.top, left: pos.left, width, border: "1px solid #cbd5e1" }}
          >
            {!singleDay && (
              <div className="shrink-0 py-2 flex flex-col" style={{ width: 132, borderRight: "1px solid #e2e8f0" }}>
                <div
                  className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "#8d9499" }}
                >
                  Quick ranges
                </div>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      const r = p.range(today)
                      commit(r)
                      setOpen(false)
                    }}
                    className="px-3 py-1.5 text-left text-xs hover:bg-blue-50"
                    style={{ color: "#012e64" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col">
              <div style={calendarTheme}>
                {singleDay ? (
                  <Calendar
                    mode="single"
                    selected={from ?? to ?? undefined}
                    defaultMonth={from ?? to ?? today}
                    numberOfMonths={1}
                    captionLayout="dropdown"
                    startMonth={new Date(2015, 0)}
                    endMonth={new Date(today.getFullYear() + 2, 11)}
                    onSelect={(day) => commitDay(day ?? undefined)}
                    className="p-3"
                  />
                ) : (
                  <Calendar
                    mode="range"
                    selected={selected}
                    defaultMonth={from ?? to ?? today}
                    numberOfMonths={1}
                    captionLayout="dropdown"
                    startMonth={new Date(2015, 0)}
                    endMonth={new Date(today.getFullYear() + 2, 11)}
                    onSelect={(range) => commit(range)}
                    className="p-3"
                  />
                )}
              </div>
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{ borderTop: "1px solid #e2e8f0" }}
              >
                <span className="text-xs truncate" style={{ color: from || to ? "#012e64" : "#8d9499" }}>
                  {from || to
                    ? `${operatorMeta("date", op).phrase} ${label}`
                    : singleDay
                    ? "Click the day to compare against"
                    : "Click a day, then a second day for a range"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onChange(buildDateFilter("", op))}
                    className="px-2 py-1 rounded text-xs hover:bg-blue-50"
                    style={{ color: "#8d9499", border: "1px solid #cbd5e1" }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-2.5 py-1 rounded text-xs text-white"
                    style={{ backgroundColor: "#012e64" }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// --- One column's filter cell ----------------------------------------------

/**
 * Operator + value for one column, as both data tables render it in the header
 * row under the column label.
 *
 * `filterable: false` is for a column the API has no filter for: the input is
 * disabled rather than accepting a condition the server would silently drop.
 */
export function ColumnFilterControl({
  filter,
  onChange,
  label,
  options = [],
  onOpenOptions,
  filterable = true,
}: {
  filter: ColumnFilter
  onChange: (filter: ColumnFilter) => void
  label?: string
  options?: string[]
  onOpenOptions?: () => void
  filterable?: boolean
}) {
  if (!filterable) {
    return (
      <input
        type="text"
        value=""
        disabled
        readOnly
        placeholder="Not filterable"
        title="This column can't be filtered on the server, so no filter is offered for it."
        className="w-full min-w-0 px-2 py-1 rounded text-xs cursor-not-allowed"
        style={{ border: "1px dashed #cbd5e1", color: "#8d9499", backgroundColor: "#f8f8f8" }}
      />
    )
  }

  const op = filterOp(filter)
  const meta = operatorMeta(filter.kind, op)

  return (
    <div className="flex items-center gap-1">
      <FilterOperatorSelect filter={filter} onChange={onChange} label={label} />
      {!meta.needsValue ? (
        <div
          className="flex-1 min-w-0 px-2 py-1 rounded text-xs truncate"
          title={
            op === "blank"
              ? `Rows where ${label ?? "this column"} has no value at all`
              : `Rows where ${label ?? "this column"} has any value`
          }
          style={{ border: "1px dashed #cbd5e1", color: "#5d6b88", backgroundColor: "#f1f5f9" }}
        >
          {op === "blank" ? "No value" : "Any value"}
        </div>
      ) : filter.kind === "multi" ? (
        <MultiSelectFilter
          options={options}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
          onOpen={onOpenOptions}
        />
      ) : filter.kind === "numeric" ? (
        <NumericValueInput filter={filter} onChange={onChange} />
      ) : filter.kind === "date" ? (
        <DateRangeFilter filter={filter} onChange={onChange} />
      ) : (
        <input
          type="text"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          placeholder={op === "contains" || op === "not_contains" ? "Contains…" : "Exact value…"}
          title={`Filter: ${meta.label.toLowerCase()}`}
          className={inputClass}
          style={inputStyle}
        />
      )}
    </div>
  )
}

// --- Active filter summary -------------------------------------------------

/**
 * The conditions currently narrowing the table, one chip each, so a stack of
 * filters stays readable without scrolling sideways to find the inputs.
 *
 * Clicking a chip scrolls its column's filter into view; the × drops that one
 * condition and leaves the others in place.
 */
export function ActiveFilterChips({
  fields,
  filters,
  onChange,
  onSelectColumn,
}: {
  fields: { key: string; label: string }[]
  filters: Record<string, ColumnFilter>
  onChange: (filters: Record<string, ColumnFilter>) => void
  onSelectColumn?: (key: string) => void
}) {
  const active = Object.entries(filters).filter(([, filter]) => isFilterActive(filter))
  if (active.length === 0) return null

  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key

  const remove = (key: string) => {
    const next = { ...filters }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map(([key, filter]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-xs"
          style={{ backgroundColor: "#ffffff", border: "1px solid #b9d6f7", color: "#012e64" }}
        >
          <button
            type="button"
            onClick={() => onSelectColumn?.(key)}
            className="inline-flex items-center gap-1 max-w-[420px]"
            title={`${labelFor(key)} ${describeFilter(filter)} — click to jump to this column's filter`}
          >
            <span className="font-semibold truncate">{labelFor(key)}</span>
            <span className="truncate" style={{ color: "#5d6b88" }}>
              {describeFilter(filter)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => remove(key)}
            title={`Remove the ${labelFor(key)} filter`}
            aria-label={`Remove the ${labelFor(key)} filter`}
            className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-blue-100"
            style={{ color: "#5d6b88" }}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
