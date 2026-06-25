"use client"

import { Edit2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

const displayFields = [
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
  { key: "delivery_completion_date", label: "Date First Delivery Complete", width: "min-w-[210px]" },
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
]

// Columns whose filter is a dropdown of the distinct values present in the data
// (rather than a free-text "contains" box).
const selectColumns = new Set([
  "client_rating",
  "PM",
  "pm_type",
  "supplier",
  "customer_type",
  "deposit",
  "supplier_payment",
])

export function OrdersDataTable({
  orders,
  onEdit,
  onDelete,
  onToggleSupplierPayment,
}: {
  orders: any[]
  onEdit: (order: any) => void
  onDelete?: (order: any) => void
  onToggleSupplierPayment?: (order: any, value: boolean) => void
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
  }, [orders.length])

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

    if (value === null || value === undefined) return "-"

    if (key === "supplier_payment") {
      return value ? "Yes" : "No"
    }

    if ((key.includes("date") || key === "created_at") && value) {
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

    if (["net_sum", "cost"].includes(key)) {
      return typeof value === "number"
        ? `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : value
    }

    if (["delay_first_delivery", "delay_first_revision", "delay_second_revision"].includes(key)) {
      return `${value} hours`
    }

    return value
  }

  // Per-column filters. Each column filters against its *displayed* value, so
  // what the user types/picks matches what they see in the cell (formatted
  // dates, "€" amounts, "Yes"/"No", computed margins, etc.).
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const setColumnFilter = (key: string, value: string) =>
    setColumnFilters((prev) => ({ ...prev, [key]: value }))
  const clearFilters = () => setColumnFilters({})
  const activeFilterCount = Object.values(columnFilters).filter((v) => v !== "").length

  // Distinct values for dropdown columns, derived from the loaded rows.
  const filterOptions = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const field of displayFields) {
      if (!selectColumns.has(field.key)) continue
      const set = new Set<string>()
      for (const order of orders) {
        const formatted = String(formatValue(order[field.key], field.key, order) ?? "")
        if (formatted && formatted !== "-") set.add(formatted)
      }
      map[field.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      )
    }
    return map
  }, [orders])

  const filteredOrders = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, v]) => v !== "")
    if (active.length === 0) return orders
    return orders.filter((order) =>
      active.every(([key, val]) => {
        const formatted = String(formatValue(order[key], key, order) ?? "")
        if (selectColumns.has(key)) return formatted === val
        return formatted.toLowerCase().includes(val.toLowerCase())
      })
    )
  }, [orders, columnFilters])

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
        className={`${fixedWidths ? '' : 'min-w-[80px]'} px-4 py-3 text-center font-semibold sticky right-0 z-40`}
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
        const value = columnFilters[field.key] || ""
        const isSelect = selectColumns.has(field.key)
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
            {isSelect ? (
              <select
                value={value}
                onChange={(e) => setColumnFilter(field.key, e.target.value)}
                className="w-full min-w-0 px-2 py-1 rounded text-xs bg-white"
                style={{ border: '1px solid #cbd5e1', color: value ? '#012e64' : '#8d9499' }}
              >
                <option value="">All</option>
                {filterOptions[field.key]?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => setColumnFilter(field.key, e.target.value)}
                placeholder="Filter…"
                className="w-full min-w-0 px-2 py-1 rounded text-xs bg-white"
                style={{ border: '1px solid #cbd5e1', color: '#012e64' }}
              />
            )}
          </th>
        )
      })}
      <th
        className="min-w-[80px] px-2 py-2 sticky right-0 z-40 text-center align-middle"
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
            Showing <span className="font-semibold" style={{ color: '#012e64' }}>{filteredOrders.length}</span> of{" "}
            <span className="font-semibold" style={{ color: '#012e64' }}>{orders.length}</span> on this page
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
        style={{ borderColor: '#e5e5e5' }}
      >
        <table className="w-full border-collapse text-sm">
          <thead ref={theadRef} style={{ backgroundColor: '#f8f8f8' }}>
            {renderHeaderCells(false)}
            {renderFilterRow()}
          </thead>
          <tbody>
            {filteredOrders.map((order, idx) => {
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
                              backgroundColor: orderIdBg,
                              boxShadow: scrolledX
                                ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                                : 'inset -1px 0 0 #cbd5e1',
                            }
                          : {}),
                      }}
                      title={String(order[field.key] || '')}
                    >
                      {field.key === "supplier_payment" ? (
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
                      ) : formatValue(order[field.key], field.key, order)}
                    </td>
                  )
                })}
                <td
                  className="min-w-[80px] px-4 py-3 sticky right-0 z-10 text-center"
                  style={{
                    backgroundColor: rowBg,
                    borderLeft: '2px solid #e5e5e5'
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(order)}
                    className="h-8 w-8 p-0 hover:bg-blue-100"
                    style={{ color: '#012e64' }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-gray-500">
              {orders.length === 0 ? "No orders found" : "No orders match the current filters"}
            </p>
            {orders.length > 0 && activeFilterCount > 0 && (
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
