"use client"

import { Edit2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ColumnFilter,
  DateRangeFilter,
  MultiSelectFilter,
  NumericFilter,
  defaultFilter,
  isFilterActive,
  matchesDate,
  matchesNumeric,
} from "@/components/data-table-filters"

const displayFields = [
  { key: "project_id", label: "Project ID", width: "min-w-[140px]" },
  { key: "project_name", label: "Project Name", width: "min-w-[180px]", maxWidth: "400px" },
  { key: "client_rating", label: "Ranking", width: "min-w-[110px]" },
  { key: "project_status", label: "Status", width: "min-w-[140px]" },
  { key: "project_manager", label: "Project Manager", width: "min-w-[150px]" },
  { key: "pm_type", label: "PM Type", width: "min-w-[120px]" },
  { key: "sales_person", label: "Sales Person", width: "min-w-[130px]" },
  { key: "client_contact_name", label: "Client Contact", width: "min-w-[150px]" },
  { key: "company_email", label: "Company Email", width: "min-w-[180px]" },
  { key: "project_type", label: "Project Type", width: "min-w-[140px]" },
  { key: "construction_type", label: "Construction Type", width: "min-w-[160px]" },
  { key: "property_type", label: "Property Type", width: "min-w-[140px]" },
  { key: "first_or_next_project", label: "First/Next Project", width: "min-w-[150px]" },
  { key: "questionnaire_received", label: "Questionnaire", width: "min-w-[130px]" },
  { key: "deposit", label: "Deposit", width: "min-w-[100px]" },
  { key: "order_confirmation_date", label: "Order Confirmation", width: "min-w-[160px]" },
  { key: "invoice_number", label: "Invoice Number", width: "min-w-[150px]" },
  { key: "invoice_date", label: "Invoice Date", width: "min-w-[130px]" },
  { key: "invoice_paid_date", label: "Invoice Paid", width: "min-w-[130px]" },
  { key: "partial_invoice", label: "Partial Invoice", width: "min-w-[140px]" },
  { key: "partial_invoice_paid_date", label: "Partial Invoice Paid", width: "min-w-[160px]" },
  { key: "delivery_completion_date", label: "Date First Delivery Complete", width: "min-w-[210px]" },
  { key: "project_completion_date", label: "Date Project End", width: "min-w-[150px]" },
  { key: "path_to_files", label: "Path to Files", width: "min-w-[150px]", maxWidth: "400px" },
  { key: "created_at", label: "Date Entry", width: "min-w-[140px]" },
]

// Columns whose filter is a multi-select dropdown of the distinct values
// present in the data (pick any number) rather than a free-text "contains" box.
const selectColumns = new Set([
  "client_rating",
  "project_status",
  "project_manager",
  "pm_type",
  "sales_person",
  "project_type",
  "construction_type",
  "property_type",
  "first_or_next_project",
  "questionnaire_received",
  "deposit",
  "partial_invoice",
])

// Amount-style columns get a comparison filter (=, >, <, >=, <=).
const numericColumns = new Set<string>([])

// Date-ish columns get a from/to range filter typed as dd/mm/yy.
const isDateKey = (key: string) => key.includes("date") || key === "created_at"

const filterKind = (key: string) =>
  selectColumns.has(key)
    ? "multi"
    : numericColumns.has(key)
    ? "numeric"
    : isDateKey(key)
    ? "date"
    : "text"

export function ProjectsDataTable({
  projects,
  onEdit,
  onDelete,
}: {
  projects: any[]
  onEdit: (project: any) => void
  onDelete?: (project: any) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const floatingOuterRef = useRef<HTMLDivElement>(null)
  const floatingScrollRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const [scrolledX, setScrolledX] = useState(false)
  const [colWidths, setColWidths] = useState<number[]>([])
  const [tableWidth, setTableWidth] = useState(0)

  const measure = () => {
    if (!theadRef.current || !scrollRef.current) return
    // Measure only the label row (rows[0]); the filter row below it mirrors the
    // same column widths and must not offset the floating-header measurements.
    const labelRow = theadRef.current.rows[0]
    if (!labelRow) return
    const ths = labelRow.querySelectorAll("th")
    setColWidths(Array.from(ths).map((th) => th.getBoundingClientRect().width))
    setTableWidth(scrollRef.current.scrollWidth)
  }

  useLayoutEffect(() => {
    measure()
  }, [projects.length])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const update = () => {
      const rect = container.getBoundingClientRect()
      const theadH = theadRef.current?.getBoundingClientRect().height ?? 46
      const navEl = document.querySelector<HTMLElement>('header.sticky')
      const navOffset = navEl?.getBoundingClientRect().height ?? 68
      const shouldStick = rect.top < navOffset && rect.bottom > navOffset + theadH
      setStuck(shouldStick)
      setScrolledX(container.scrollLeft > 0)
      if (floatingOuterRef.current) {
        floatingOuterRef.current.style.top = `${navOffset}px`
        floatingOuterRef.current.style.left = `${rect.left}px`
        floatingOuterRef.current.style.width = `${rect.width}px`
      }
      if (floatingScrollRef.current) {
        floatingScrollRef.current.scrollLeft = container.scrollLeft
      }
    }

    const syncHorizontal = () => {
      setScrolledX(container.scrollLeft > 0)
      if (floatingScrollRef.current) {
        floatingScrollRef.current.scrollLeft = container.scrollLeft
      }
    }

    const onResize = () => {
      measure()
      update()
    }

    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", onResize)
    container.addEventListener("scroll", syncHorizontal, { passive: true })

    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", onResize)
      container.removeEventListener("scroll", syncHorizontal)
    }
  }, [projects.length])

  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined || value === "") return "-"

    if ((key.includes("date") || key === "created_at") && value) {
      try {
        const parsed = new Date(value)
        if (isNaN(parsed.getTime())) return value
        return parsed.toLocaleDateString()
      } catch {
        return value
      }
    }

    return value
  }

  // Per-column filters. Text/multi columns filter against the *displayed*
  // value, so what the user types/picks matches what they see in the cell
  // (status labels, Yes/No, etc.).
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const getFilter = (key: string): ColumnFilter =>
    columnFilters[key] ?? defaultFilter(filterKind(key))
  const setColumnFilter = (key: string, filter: ColumnFilter) =>
    setColumnFilters((prev) => ({ ...prev, [key]: filter }))
  const clearFilters = () => setColumnFilters({})
  const activeFilterCount = Object.values(columnFilters).filter(isFilterActive).length

  // Distinct values for dropdown columns, derived from the loaded rows.
  const filterOptions = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const field of displayFields) {
      if (!selectColumns.has(field.key)) continue
      const set = new Set<string>()
      for (const project of projects) {
        const formatted = String(formatValue(project[field.key], field.key) ?? "")
        if (formatted && formatted !== "-") set.add(formatted)
      }
      map[field.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      )
    }
    return map
  }, [projects])

  const filteredProjects = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, f]) => isFilterActive(f))
    if (active.length === 0) return projects
    return projects.filter((project) =>
      active.every(([key, filter]) => {
        const display = String(formatValue(project[key], key) ?? "")
        switch (filter.kind) {
          case "multi":
            return filter.values.includes(display)
          case "numeric":
            return matchesNumeric(display, filter)
          case "date":
            return matchesDate(project[key], filter)
          default:
            return display.toLowerCase().includes(filter.value.trim().toLowerCase())
        }
      })
    )
  }, [projects, columnFilters])

  const renderHeaderCells = (fixedWidths: boolean) => (
    <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
      {displayFields.map((field, i) => {
        const isFirst = i === 0
        return (
          <th
            key={field.key}
            className={`${fixedWidths ? '' : field.width} px-4 py-3 text-left font-semibold whitespace-nowrap${isFirst ? ' sticky left-0 z-40' : ''}`}
            style={{
              backgroundColor: '#f8f8f8',
              color: '#012e64',
              borderRight: isFirst ? undefined : '1px solid #cbd5e1',
              ...(isFirst
                ? {
                    boxShadow: scrolledX
                      ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                      : 'inset -1px 0 0 #cbd5e1',
                  }
                : {}),
              ...(fixedWidths && colWidths[i]
                ? { width: colWidths[i], minWidth: colWidths[i], maxWidth: colWidths[i] }
                : {}),
            }}
          >
            {field.label}
          </th>
        )
      })}
      <th
        className={`${fixedWidths ? '' : 'min-w-[110px]'} px-4 py-3 text-center font-semibold sticky right-0 z-40`}
        style={{
          backgroundColor: '#f8f8f8',
          color: '#012e64',
          borderLeft: '2px solid #e5e5e5',
          ...(fixedWidths && colWidths[displayFields.length]
            ? {
                width: colWidths[displayFields.length],
                minWidth: colWidths[displayFields.length],
                maxWidth: colWidths[displayFields.length],
              }
            : {}),
        }}
      >
        Actions
      </th>
    </tr>
  )

  const renderFilterRow = () => (
    <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
      {displayFields.map((field, i) => {
        const isFirst = i === 0
        const filter = getFilter(field.key)
        return (
          <th
            key={field.key}
            className={`${field.width} px-2 py-2 align-top font-normal${isFirst ? ' sticky left-0 z-40' : ''}`}
            style={{
              backgroundColor: '#f8f8f8',
              borderRight: isFirst ? undefined : '1px solid #cbd5e1',
              ...(isFirst
                ? {
                    boxShadow: scrolledX
                      ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                      : 'inset -1px 0 0 #cbd5e1',
                  }
                : {}),
            }}
          >
            {filter.kind === "multi" ? (
              <MultiSelectFilter
                options={filterOptions[field.key] ?? []}
                values={filter.values}
                onChange={(values) => setColumnFilter(field.key, { kind: "multi", values })}
              />
            ) : filter.kind === "numeric" ? (
              <NumericFilter filter={filter} onChange={(f) => setColumnFilter(field.key, f)} />
            ) : filter.kind === "date" ? (
              <DateRangeFilter filter={filter} onChange={(f) => setColumnFilter(field.key, f)} />
            ) : (
              <input
                type="text"
                value={filter.value}
                onChange={(e) => setColumnFilter(field.key, { kind: "text", value: e.target.value })}
                placeholder="Contains…"
                title="Filter: shows rows containing this text"
                className="w-full min-w-0 px-2 py-1 rounded text-xs bg-white"
                style={{ border: '1px solid #cbd5e1', color: '#012e64' }}
              />
            )}
          </th>
        )
      })}
      <th
        className="min-w-[110px] px-2 py-2 sticky right-0 z-40 text-center align-middle"
        style={{ backgroundColor: '#f8f8f8', borderLeft: '2px solid #e5e5e5' }}
      >
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-blue-100 transition-colors"
            style={{ color: '#012e64' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </th>
    </tr>
  )

  return (
    <div className="relative">
      {activeFilterCount > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm"
          style={{ backgroundColor: '#f0f7ff', borderBottom: '1px solid #d0e7ff', color: '#5d6b88' }}
        >
          <span>
            Showing <span className="font-semibold" style={{ color: '#012e64' }}>{filteredProjects.length}</span> of{" "}
            <span className="font-semibold" style={{ color: '#012e64' }}>{projects.length}</span> on this page
            {" "}({activeFilterCount} column {activeFilterCount === 1 ? 'filter' : 'filters'})
          </span>
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 font-medium hover:underline"
            style={{ color: '#012e64' }}
          >
            <X className="w-4 h-4" />
            Clear filters
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="overflow-x-auto relative border-t"
        style={{ borderColor: '#e5e5e5', overscrollBehaviorX: 'contain' }}
      >
        <table className="w-full border-collapse text-sm">
          <thead ref={theadRef} style={{ backgroundColor: '#f8f8f8' }}>
            {renderHeaderCells(false)}
            {renderFilterRow()}
          </thead>
          <tbody>
            {filteredProjects.map((project, idx) => {
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafafa'
              return (
              <tr
                key={project.id}
                className="transition-colors hover:bg-blue-50"
                style={{
                  borderBottom: '1px solid #e5e5e5',
                  backgroundColor: rowBg
                }}
              >
                {displayFields.map((field, i) => {
                  const isFirst = i === 0
                  return (
                    <td
                      key={field.key}
                      className={`${field.width} px-4 py-3 whitespace-nowrap${isFirst ? ' sticky left-0 z-10' : ''}`}
                      style={{
                        color: '#012e64',
                        borderRight: isFirst ? undefined : '1px solid #cbd5e1',
                        ...(isFirst
                          ? {
                              backgroundColor: rowBg,
                              boxShadow: scrolledX
                                ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                                : 'inset -1px 0 0 #cbd5e1',
                            }
                          : {}),
                      }}
                      title={String(project[field.key] || '')}
                    >
                      {field.maxWidth ? (
                        <div style={{ maxWidth: field.maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatValue(project[field.key], field.key)}
                        </div>
                      ) : formatValue(project[field.key], field.key)}
                    </td>
                  )
                })}
                <td
                  className="min-w-[110px] px-4 py-3 sticky right-0 z-10 text-center"
                  style={{
                    backgroundColor: rowBg,
                    borderLeft: '2px solid #e5e5e5'
                  }}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(project)}
                      className="h-8 w-8 p-0 hover:bg-blue-100"
                      style={{ color: '#012e64' }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(project)}
                        className="h-8 w-8 p-0 hover:bg-red-100"
                        style={{ color: '#dc2626' }}
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-gray-500">
              {projects.length === 0 ? "No projects found" : "No projects match the current filters"}
            </p>
            {projects.length > 0 && activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm font-medium hover:underline"
                style={{ color: '#012e64' }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div
        ref={floatingOuterRef}
        aria-hidden="true"
        className="fixed"
        style={{
          top: 68,
          zIndex: 40,
          display: stuck ? 'block' : 'none',
          pointerEvents: 'none',
        }}
      >
        <div ref={floatingScrollRef} className="overflow-hidden">
          <table
            className="border-collapse text-sm"
            style={{ width: tableWidth || 'auto', tableLayout: 'fixed' }}
          >
            <thead style={{ backgroundColor: '#f8f8f8' }}>
              {renderHeaderCells(true)}
            </thead>
          </table>
        </div>
      </div>
    </div>
  )
}
