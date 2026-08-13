"use client"

import { Check, ChevronDown, Edit2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ColumnFilter,
  DateRangeFilter,
  MultiSelectFilter,
  NumericFilter,
  defaultFilter,
  isFilterActive,
} from "@/components/data-table-filters"
import {
  ORDER_STATUSES,
  ORDER_STATUS_FALLBACK,
  ORDER_STATUS_STYLES,
  type OrderStatus,
} from "@/lib/order-status"

export type DisplayField = {
  key: string
  label: string
  width: string
  maxWidth?: string
}

const displayFields: DisplayField[] = [
  { key: "order_id", label: "Order ID", width: "min-w-[140px]" },
  { key: "client_rating", label: "Ranking", width: "min-w-[110px]" },
  { key: "company_name", label: "Company Name", width: "min-w-[180px]", maxWidth: "400px" },
  { key: "product_name", label: "Product Name", width: "min-w-[150px]" },
  { key: "quantity", label: "Quantity", width: "min-w-[100px]" },
  { key: "PM", label: "PM", width: "min-w-[100px]" },
  { key: "pm_type", label: "PM Type", width: "min-w-[120px]" },
  { key: "supplier", label: "Supplier", width: "min-w-[130px]" },
  { key: "cost", label: "Cost", width: "min-w-[110px]" },
  { key: "profit_margin", label: "Profit Margin", width: "min-w-[130px]" },
  { key: "net_sum", label: "Net Sum", width: "min-w-[110px]" },
  { key: "discount", label: "Discount", width: "min-w-[110px]" },
  { key: "deposit", label: "Deposit", width: "min-w-[100px]" },
  { key: "date_information_complete", label: "Date Info Complete", width: "min-w-[160px]" },
  { key: "due_delivery_date", label: "Due Delivery Date", width: "min-w-[150px]" },
  { key: "delivery_1_date", label: "delivery_1", width: "min-w-[130px]" },
  { key: "delivery_2_date", label: "delivery_2", width: "min-w-[130px]" },
  { key: "delivery_3_date", label: "delivery_3", width: "min-w-[130px]" },
  { key: "delivery_4_date", label: "delivery_4", width: "min-w-[130px]" },
  { key: "date_first_delivery_complete", label: "Date First Delivery Complete", width: "min-w-[210px]" },
  { key: "project_completion_date", label: "Date Project End", width: "min-w-[150px]" },
  { key: "delay_first_delivery", label: "Delay 1st Delivery", width: "min-w-[150px]" },
  { key: "delay_first_revision", label: "Delay 1st Revision", width: "min-w-[150px]" },
  { key: "delay_second_revision", label: "Delay 2nd Revision", width: "min-w-[150px]" },
  { key: "customer_name", label: "Customer Name", width: "min-w-[150px]" },
  { key: "customer_email", label: "Customer Email", width: "min-w-[180px]" },
  { key: "customer_type", label: "Customer Type", width: "min-w-[140px]" },
  { key: "comments", label: "Comments", width: "min-w-[20px]", maxWidth: "900px" },
  { key: "created_at", label: "Date Order Entry", width: "min-w-[150px]" },
  { key: "supplier_payment", label: "Supplier Payment", width: "min-w-[150px]" },
  { key: "order_status", label: "Order Status", width: "min-w-[140px]" },
]

// Columns whose filter is a multi-select dropdown of the distinct values
// present in the data (pick any number) rather than a free-text "contains" box.
const selectColumns = new Set([
  "order_status",
  "client_rating",
  "product_name",
  "PM",
  "pm_type",
  "supplier",
  "customer_type",
  "deposit",
  "supplier_payment",
  // project_orders_view: low-cardinality project/order columns (mostly enums)
  "project_status",
  "project_type",
  "construction_type",
  "property_type",
  "questionnaire_received",
  "first_or_next_project",
  "project_manager",
  "sales_person",
  "order_type",
  "product_type",
  "sale_type",
  "product",
])

// Amount-style columns get a comparison filter (=, >, <, >=, <=) against the
// number shown in the cell.
const numericColumns = new Set([
  "quantity",
  "cost",
  "profit_margin",
  "net_sum",
  "discount",
  "delay_first_delivery",
  "delay_first_revision",
  "delay_second_revision",
  // project_orders_view financials
  "gross_sum",
  "db_1",
  "roi",
  "unit_price",
])

// Badge colors for order_status live in lib/order-status.ts, shared with the
// create/edit dialogs and the dashboard tiles. Rows created before the column
// existed are null and fall back to the plain "-" the other columns use.

// Currency-formatted columns (rendered as "€1,234.00").
const currencyColumns = new Set(["net_sum", "cost", "gross_sum", "db_1", "unit_price"])

// Date-ish columns get a single date/range filter typed as mm/dd/yy.
const isDateKey = (key: string) =>
  key.includes("date") || key === "created_at" || key === "updated_at"

const filterKind = (key: string) =>
  selectColumns.has(key)
    ? "multi"
    : numericColumns.has(key)
    ? "numeric"
    : isDateKey(key)
    ? "date"
    : "text"

export function OrdersDataTable({
  orders,
  onEdit,
  onDelete,
  onToggleSupplierPayment,
  onChangeOrderStatus,
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  hiddenColumns,
  fields = displayFields,
  columnFilters,
  onColumnFiltersChange,
  filterOptions = {},
  onRequestFilterOptions,
  totalRows,
}: {
  orders: any[]
  onEdit?: (order: any) => void
  onDelete?: (order: any) => void
  onToggleSupplierPayment?: (order: any, value: boolean) => void
  /** Set on editable tables to make the status cell an inline dropdown. */
  onChangeOrderStatus?: (order: any, value: string) => void
  selectable?: boolean
  selectedIds?: Set<any>
  onToggleRow?: (order: any, checked: boolean) => void
  onToggleAll?: (orders: any[], checked: boolean) => void
  hiddenColumns?: string[]
  /** Column set to render. Defaults to the all_orders/orders columns. */
  fields?: DisplayField[]
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
  const visibleFields = useMemo(
    () =>
      hiddenColumns?.length
        ? fields.filter((f) => !hiddenColumns.includes(f.key))
        : fields,
    [hiddenColumns, fields]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const floatingOuterRef = useRef<HTMLDivElement>(null)
  const floatingScrollRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const [scrolledX, setScrolledX] = useState(false)
  const [colWidths, setColWidths] = useState<number[]>([])
  const [tableWidth, setTableWidth] = useState(0)
  const showActions = Boolean(onEdit || onDelete)

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
  }, [orders.length, selectable, visibleFields.length])

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
  }, [orders.length])

  const formatValue = (value: any, key: string, order?: any) => {
    if (key === "profit_margin") {
      if (order && (order.cost === 0 || order.cost === null)) return "100%"
      if (order && order.db_1 != null && order.net_sum != null && order.net_sum !== 0) {
        return `${(order.db_1 / order.net_sum * 100).toFixed(1)}%`
      }
      return "-"
    }

    // supplier_payment is a boolean shown as Yes/No — handle it before the
    // null/undefined guard so unpaid rows (null/false) read "No", not "-".
    if (key === "supplier_payment") {
      return value ? "Yes" : "No"
    }

    if (value === null || value === undefined) return "-"

    if (isDateKey(key) && value) {
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return value
      }
    }

    if (key === "discount") {
      return typeof value === "number"
        ? `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
        : value
    }

    if (currencyColumns.has(key)) {
      return typeof value === "number"
        ? `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : value
    }

    if (["delay_first_delivery", "delay_first_revision", "delay_second_revision"].includes(key)) {
      return `${value} hours`
    }

    return value
  }

  // Per-column filters. These are applied by the API against the raw column
  // values, so they match every row in the table rather than only the loaded
  // page. Note that means they compare the *stored* value, not the formatted
  // cell text — see the caveats on profit_margin/supplier_payment below.
  const getFilter = (key: string): ColumnFilter =>
    columnFilters[key] ?? defaultFilter(filterKind(key))
  const setColumnFilter = (key: string, filter: ColumnFilter) =>
    onColumnFiltersChange({ ...columnFilters, [key]: filter })
  const clearFilters = () => onColumnFiltersChange({})
  const activeFilterCount = Object.values(columnFilters).filter(isFilterActive).length

  // Select-all applies to the rows on the current page.
  const allFilteredSelected =
    orders.length > 0 && orders.every((o) => selectedIds?.has(o.id))

  const renderHeaderCells = (fixedWidths: boolean) => (
    <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
      {visibleFields.map((field, i) => {
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
                  onChange={(e) => onToggleAll?.(orders, e.target.checked)}
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
      {showActions && (
        <th
          className={`${fixedWidths ? '' : 'min-w-[110px]'} px-4 py-3 text-center font-semibold sticky right-0 z-40`}
          style={{
            backgroundColor: '#f8f8f8',
            color: '#012e64',
            borderLeft: '2px solid #e5e5e5',
            ...(fixedWidths && colWidths[visibleFields.length]
              ? {
                  width: colWidths[visibleFields.length],
                  minWidth: colWidths[visibleFields.length],
                  maxWidth: colWidths[visibleFields.length],
                }
              : {}),
          }}
        >
          Actions
        </th>
      )}
    </tr>
  )

  const renderFilterRow = () => (
    <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
      {visibleFields.map((field, i) => {
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
      {showActions && (
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
      )}
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
                matching {totalRows === 1 ? 'row' : 'rows'} across all pages
              </>
            ) : (
              <>
                <span className="font-semibold" style={{ color: '#012e64' }}>
                  {orders.length}
                </span>{" "}
                matching {orders.length === 1 ? 'row' : 'rows'}
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
            {orders.map((order, idx) => {
              const delayed = ["delay_first_delivery", "delay_first_revision", "delay_second_revision"].some(
                (k) => Number(order[k]) > 0
              )
              const supplierPaid = Boolean(order.supplier_payment)
              // Whole row turns red when delayed; the order-ID cell turns green
              // when the supplier has been paid. Both can apply at once
              // (red row + green order-ID cell).
              const rowBg = delayed
                ? (idx % 2 === 0 ? '#fef2f2' : '#fee2e2')
                : (idx % 2 === 0 ? '#ffffff' : '#fafafa')
              const orderIdBg = supplierPaid
                ? (idx % 2 === 0 ? '#f2fef8' : '#e8fdf2')
                : rowBg
              return (
              <tr
                key={order.id}
                className={`transition-colors ${delayed ? 'hover:bg-red-100' : 'hover:bg-blue-50'}`}
                style={{
                  borderBottom: '1px solid #e5e5e5',
                  backgroundColor: rowBg
                }}
              >
                {visibleFields.map((field, i) => {
                  const isFirst = i === 0
                  const cellContent =
                    field.key === "order_status" && onChangeOrderStatus ? (
                      // Inline editor, mirroring the supplier_payment checkbox.
                      // The trigger keeps the badge's pill shape and colours so
                      // the column still scans at a glance; the popup is the
                      // same Radix menu as the toolbar filter, not a native
                      // <select> (which the browser styles on its own terms).
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                            style={{
                              backgroundColor: order.order_status
                                ? ORDER_STATUS_STYLES[order.order_status as OrderStatus]?.bg ??
                                  ORDER_STATUS_FALLBACK.bg
                                : 'transparent',
                              color: order.order_status
                                ? ORDER_STATUS_STYLES[order.order_status as OrderStatus]?.fg ??
                                  ORDER_STATUS_FALLBACK.fg
                                : '#5d6b88',
                            }}
                          >
                            {order.order_status || "-"}
                            <ChevronDown className="w-3 h-3 opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[9rem]">
                          {ORDER_STATUSES.map((status) => (
                            <DropdownMenuItem
                              key={status}
                              onClick={() => onChangeOrderStatus(order, status)}
                              className="cursor-pointer text-sm"
                              style={{ color: '#012e64' }}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: ORDER_STATUS_STYLES[status].fg }}
                              />
                              {status}
                              {order.order_status === status && (
                                <Check className="w-3.5 h-3.5 ml-auto" style={{ color: '#012e64' }} />
                              )}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onChangeOrderStatus(order, "")}
                            className="cursor-pointer text-sm"
                            style={{ color: '#5d6b88' }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ border: '1px solid #8d9499' }}
                            />
                            Clear
                            {!order.order_status && (
                              <Check className="w-3.5 h-3.5 ml-auto" style={{ color: '#5d6b88' }} />
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : field.key === "order_status" ? (
                      order.order_status ? (
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor:
                              ORDER_STATUS_STYLES[order.order_status as OrderStatus]?.bg ??
                              ORDER_STATUS_FALLBACK.bg,
                            color:
                              ORDER_STATUS_STYLES[order.order_status as OrderStatus]?.fg ??
                              ORDER_STATUS_FALLBACK.fg,
                          }}
                        >
                          {order.order_status}
                        </span>
                      ) : (
                        "-"
                      )
                    ) : field.key === "supplier_payment" && !onToggleSupplierPayment ? (
                      // Read-only tables (All Orders, Project Orders) show the
                      // value as text rather than a checkbox that can't be used.
                      <span style={{ color: order.supplier_payment ? '#047857' : '#5d6b88', fontWeight: 500 }}>
                        {order.supplier_payment ? "Yes" : "No"}
                      </span>
                    ) : field.key === "supplier_payment" ? (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(order.supplier_payment)}
                          onChange={(e) => onToggleSupplierPayment?.(order, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-green-600"
                        />
                        <span style={{ color: order.supplier_payment ? '#047857' : '#5d6b88', fontWeight: 500 }}>
                          {order.supplier_payment ? "Yes" : "No"}
                        </span>
                      </label>
                    ) : field.maxWidth ? (
                      <div style={{ maxWidth: field.maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatValue(order[field.key], field.key, order)}
                      </div>
                    ) : (
                      formatValue(order[field.key], field.key, order)
                    )
                  return (
                    <td
                      key={field.key}
                      className={`${field.width} px-4 py-3 whitespace-nowrap${isFirst ? ' sticky left-0 z-10' : ''}`}
                      style={{
                        color: '#012e64',
                        borderRight: isFirst ? undefined : '1px solid #cbd5e1',
                        ...(isFirst
                          ? {
                              backgroundColor: orderIdBg,
                              boxShadow: scrolledX
                                ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                                : 'inset -1px 0 0 #cbd5e1',
                            }
                          : {}),
                      }}
                      title={String(order[field.key] || '')}
                    >
                      {isFirst && selectable ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedIds?.has(order.id))}
                            onChange={(e) => onToggleRow?.(order, e.target.checked)}
                            className="h-4 w-4 cursor-pointer shrink-0"
                            style={{ accentColor: '#012e64' }}
                          />
                          <div className="min-w-0">{cellContent}</div>
                        </div>
                      ) : (
                        cellContent
                      )}
                    </td>
                  )
                })}
                {showActions && (
                  <td
                    className="min-w-[110px] px-4 py-3 sticky right-0 z-10 text-center"
                    style={{
                      backgroundColor: rowBg,
                      borderLeft: '2px solid #e5e5e5'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(order)}
                          className="h-8 w-8 p-0 hover:bg-blue-100"
                          style={{ color: '#012e64' }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(order)}
                          className="h-8 w-8 p-0 hover:bg-red-100"
                          style={{ color: '#dc2626' }}
                          title="Delete order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              )
            })}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-gray-500">
              {activeFilterCount === 0 ? "No orders found" : "No orders match the current filters"}
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
