"use client"

import { Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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

export function ProjectsDataTable({ projects, onEdit }: { projects: any[]; onEdit: (project: any) => void }) {
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
                      {field.maxWidth ? (
                        <div style={{ maxWidth: field.maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatValue(project[field.key], field.key)}
                        </div>
                      ) : formatValue(project[field.key], field.key)}
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
                    onClick={() => onEdit(project)}
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
        {projects.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">No projects found</p>
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
