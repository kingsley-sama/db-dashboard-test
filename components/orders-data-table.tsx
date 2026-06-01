"use client"

import { Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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

export function OrdersDataTable({ orders, onEdit }: { orders: any[]; onEdit: (order: any) => void }) {
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
    const ths = theadRef.current.querySelectorAll("th")
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

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="overflow-x-auto relative border-t"
        style={{ borderColor: '#e5e5e5' }}
      >
        <table className="w-full border-collapse text-sm">
          <thead ref={theadRef} style={{ backgroundColor: '#f8f8f8' }}>
            {renderHeaderCells(false)}
          </thead>
          <tbody>
            {orders.map((order, idx) => (
              <tr
                key={order.id}
                className="hover:bg-blue-50 transition-colors"
                style={{
                  borderBottom: '1px solid #e5e5e5',
                  backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa'
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
                              backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                              boxShadow: scrolledX
                                ? 'inset -1px 0 0 #cbd5e1, 6px 0 8px -4px rgba(0, 0, 0, 0.18)'
                                : 'inset -1px 0 0 #cbd5e1',
                            }
                          : {}),
                      }}
                      title={String(order[field.key] || '')}
                    >
                      {field.maxWidth ? (
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
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
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
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">No orders found</p>
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
