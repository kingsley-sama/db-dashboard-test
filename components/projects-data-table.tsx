"use client"

import { Edit2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ColumnFilter,
  DateRangeFilter,
  MultiSelectFilter,
  NumericFilter,
  defaultFilter,
  isFilterActive,
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

// Date-ish columns get a single date/range filter typed as mm/dd/yy.
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
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  columnFilters,
  onColumnFiltersChange,
  filterOptions = {},
  onRequestFilterOptions,
  totalRows,
}: {
  projects: any[]
  onEdit: (project: any) => void
  onDelete?: (project: any) => void
  selectable?: boolean
  selectedIds?: Set<any>
  onToggleRow?: (project: any, checked: boolean) => void
  onToggleAll?: (projects: any[], checked: boolean) => void
  /**
   * Per-column filters are owned by the parent and sent to the API, so they
   * apply across the whole table rather than just the loaded page.
   */
  columnFilters: Record<string, ColumnFilter>
  onColumnFiltersChange: (filters: Record<string, ColumnFilter>) => void
  /** Distinct values per column, fetched from the server. */
  filterOptions?: Record<string, string[]>
  /** Called when a dropdown opens, so the parent can load its options. */
  onRequestFilterOptions?: (column: string) => void
  /** Server-wide row count for the active filters. */
  totalRows?: number
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
  }, [projects.length, selectable])

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

  // Per-column filters. These are applied by the API against the raw column
  // values, so they match every row in the table rather than only the loaded
  // page. Note that means they compare the *stored* value, not the formatted
  // cell text.
  const getFilter = (key: string): ColumnFilter =>
    columnFilters[key] ?? defaultFilter(filterKind(key))
  const setColumnFilter = (key: string, filter: ColumnFilter) =>
    onColumnFiltersChange({ ...columnFilters, [key]: filter })
  const clearFilters = () => onColumnFiltersChange({})
  const activeFilterCount = Object.values(columnFilters).filter(isFilterActive).length

  // Select-all applies to the rows on the current page.
  const allFilteredSelected =
    projects.length > 0 && projects.every((p) => selectedIds?.has(p.id))

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
            {isFirst && selectable ? (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => onToggleAll?.(projects, e.target.checked)}
                  title="Select all rows on this page (matching filters)"
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: '#012e64' }}
                />
                <span>{field.label}</span>
              </div>
            ) : (
              field.label
            )}
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
                onOpen={() => onRequestFilterOptions?.(field.key)}
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
            {totalRows !== undefined ? (
              <>
                <span className="font-semibold" style={{ color: '#012e64' }}>
                  {totalRows.toLocaleString()}
                </span>{" "}
                matching {totalRows === 1 ? 'project' : 'projects'} across all pages
              </>
            ) : (
              <>
                <span className="font-semibold" style={{ color: '#012e64' }}>
                  {projects.length}
                </span>{" "}
                matching {projects.length === 1 ? 'project' : 'projects'}
              </>
            )}
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
            {projects.map((project, idx) => {
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
                      {isFirst && selectable ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedIds?.has(project.id))}
                            onChange={(e) => onToggleRow?.(project, e.target.checked)}
                            className="h-4 w-4 cursor-pointer shrink-0"
                            style={{ accentColor: '#012e64' }}
                          />
                          <div className="min-w-0">
                            {field.maxWidth ? (
                              <div style={{ maxWidth: field.maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {formatValue(project[field.key], field.key)}
                              </div>
                            ) : formatValue(project[field.key], field.key)}
                          </div>
                        </div>
                      ) : field.maxWidth ? (
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
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-gray-500">
              {activeFilterCount > 0 ? "No projects match the current filters" : "No projects found"}
            </p>
            {activeFilterCount > 0 && (
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
        className="fixed"
        style={{
          top: 68,
          zIndex: 40,
          display: stuck ? 'block' : 'none',
          pointerEvents: 'auto',
        }}
      >
        <div ref={floatingScrollRef} className="overflow-hidden">
          <table
            className="border-collapse text-sm"
            style={{ width: tableWidth || 'auto', tableLayout: 'fixed' }}
          >
            <thead style={{ backgroundColor: '#f8f8f8' }}>
              {renderHeaderCells(true)}
              {renderFilterRow()}
            </thead>
          </table>
        </div>
      </div>
    </div>
  )
}
