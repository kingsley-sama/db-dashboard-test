"use client"

import { useEffect, useState } from "react"
import type { ColumnFilter } from "@/lib/column-filters"

/**
 * Persists a table's search/filter state to localStorage (per storageKey) so it
 * survives navigation — leaving the page and coming back restores the same view,
 * like the Supabase table editor. `ready` is false until the saved state has been
 * restored; consumers should hold off fetching until then to avoid a double fetch.
 */
export function usePersistedTableState(storageKey: string) {
  const [searchTerm, setSearchTermState] = useState("")
  const [statusFilter, setStatusFilterState] = useState("")
  const [columnFilters, setColumnFiltersState] = useState<Record<string, ColumnFilter>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (typeof saved.search === "string") setSearchTermState(saved.search)
        if (typeof saved.status === "string") setStatusFilterState(saved.status)
        if (typeof saved.page === "number" && saved.page > 0) setCurrentPage(saved.page)
        // Absent in state saved before column filters were persisted.
        if (saved.columnFilters && typeof saved.columnFilters === "object") {
          setColumnFiltersState(saved.columnFilters)
        }
      }
    } catch {
      // corrupted saved state — start fresh
    }
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          search: searchTerm,
          status: statusFilter,
          page: currentPage,
          columnFilters,
        })
      )
    } catch {
      // storage full/unavailable — persistence is best-effort
    }
  }, [ready, storageKey, searchTerm, statusFilter, currentPage, columnFilters])

  // Changing the search always jumps back to page 1
  const setSearchTerm = (value: string) => {
    setSearchTermState(value)
    setCurrentPage(1)
  }

  // Same for the order-status drill-down
  const setStatusFilter = (value: string) => {
    setStatusFilterState(value)
    setCurrentPage(1)
  }

  // And for the per-column filters, whose result set is now server-wide.
  const setColumnFilters = (value: Record<string, ColumnFilter>) => {
    setColumnFiltersState(value)
    setCurrentPage(1)
  }

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    columnFilters,
    setColumnFilters,
    currentPage,
    setCurrentPage,
    ready,
  }
}

/**
 * Fetches every row from a paginated API endpoint (page/limit/search/status/
 * columnFilters params, {data, pagination} response shape) by walking all pages.
 * The filters must match the ones the table is showing, or an export of
 * "filtered rows" would quietly contain more than the user can see.
 */
export async function fetchAllRows(
  apiPath: string,
  filters: { search?: string; status?: string; columnFilters?: string } = {}
): Promise<any[]> {
  const limit = 1000
  const all: any[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
    if (filters.search) params.append("search", filters.search)
    if (filters.status) params.append("status", filters.status)
    if (filters.columnFilters) params.append("columnFilters", filters.columnFilters)

    const response = await fetch(`${apiPath}?${params.toString()}`)
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || "Failed to fetch rows for export")
    }

    const rows = result.data || []
    all.push(...rows)

    const totalPages = result.pagination?.totalPages ?? 1
    if (page >= totalPages || rows.length === 0) break
    page++
  }

  return all
}

/** Converts rows to CSV and triggers a browser download. */
export function downloadCsv(rows: Record<string, any>[], filename: string) {
  // Column order: union of keys in order of first appearance
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }

  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return ""
    const text =
      typeof value === "object" ? JSON.stringify(value) : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const lines = [
    columns.map(escapeCell).join(","),
    ...rows.map((row) => columns.map((col) => escapeCell(row[col])).join(","))
  ]

  // BOM so Excel detects UTF-8
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8"
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
