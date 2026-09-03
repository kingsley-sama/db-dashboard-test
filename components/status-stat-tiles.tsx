"use client"

import { useEffect, useState } from "react"
import { isAbortError, readJsonResponse } from "@/lib/table-utils"
import { Card } from "@/components/ui/card"
import { Package, CheckCircle, AlertTriangle, AlertOctagon } from "lucide-react"
import { ORDER_STATUSES, ORDER_STATUS_STYLES, type OrderStatus } from "@/lib/order-status"

const statusIcons: Record<OrderStatus, typeof Package> = {
  Normal: CheckCircle,
  Challenging: AlertTriangle,
  Problematic: AlertOctagon,
}

type Tile = {
  /** "" is the All Orders tile. */
  value: string
  label: string
  Icon: typeof Package
  accent: string
  iconBg: string
  ring: string
}

const tiles: Tile[] = [
  {
    value: "",
    label: "All Orders",
    Icon: Package,
    accent: "text-blue-600",
    iconBg: "bg-blue-100",
    ring: "ring-blue-400",
  },
  ...ORDER_STATUSES.map((status) => ({
    value: status,
    label: status,
    Icon: statusIcons[status],
    accent: ORDER_STATUS_STYLES[status].accent,
    iconBg: ORDER_STATUS_STYLES[status].iconBg,
    ring:
      status === "Normal"
        ? "ring-emerald-400"
        : status === "Challenging"
        ? "ring-amber-400"
        : "ring-red-400",
  })),
]

/**
 * The orders dashboard tiles. Each tile is a drill-down: selecting one filters
 * the table below to that order status, and selecting it again clears back to
 * All Orders. Counts come from `pagination.total` on the orders endpoint, so
 * they are exact rather than limited to the rows the table has loaded.
 */
export function StatusStatTiles({
  apiPath,
  value,
  onChange,
  refreshKey = 0,
  search = "",
  columnFilters = "",
}: {
  apiPath: string
  value: string
  onChange: (status: string) => void
  /** Bump to re-fetch the counts (e.g. after the table creates/edits a row). */
  refreshKey?: number
  /**
   * The table's active search and serialized column filters. The tiles count
   * the same rows the table is showing, so the numbers can't contradict it.
   */
  search?: string
  columnFilters?: string
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    // One controller for the batch: a new search supersedes all four counts, and
    // aborting drops the queries behind them instead of letting them finish for
    // a render that will never happen.
    const controller = new AbortController()

    const fetchCount = async (status: string) => {
      // limit=0 asks the endpoint for the count alone. The tiles never render
      // rows, so pulling a page of them was four wasted reads per keystroke.
      const params = new URLSearchParams({ page: "1", limit: "0" })
      if (status) params.append("status", status)
      if (search) params.append("search", search)
      if (columnFilters) params.append("columnFilters", columnFilters)
      const response = await fetch(`${apiPath}?${params.toString()}`, {
        signal: controller.signal,
      })
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.error || "Failed to fetch counts")
      return result.pagination?.total ?? 0
    }

    Promise.all(tiles.map((tile) => fetchCount(tile.value)))
      .then((totals) => {
        setCounts(Object.fromEntries(tiles.map((tile, i) => [tile.value, totals[i]])))
      })
      .catch((err) => {
        if (isAbortError(err)) return
        console.error("Error fetching status counts:", err)
      })

    return () => controller.abort()
  }, [apiPath, refreshKey, search, columnFilters])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles.map(({ value: tileValue, label, Icon, accent, iconBg, ring }) => {
        const selected = value === tileValue
        // Clicking the active tile clears the drill-down.
        const select = () => onChange(selected ? "" : tileValue)

        return (
          <Card
            key={tileValue || "all"}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={select}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                select()
              }
            }}
            className={`p-6 bg-white hover:shadow-lg transition-all border border-gray-200 cursor-pointer ${
              selected ? `ring-2 ring-offset-2 ${ring}` : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${accent}`}>
                  {(counts[tileValue] ?? 0).toLocaleString()}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
                <Icon className={`w-6 h-6 ${accent}`} />
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
