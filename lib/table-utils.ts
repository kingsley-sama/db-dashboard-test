"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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

// ---------------------------------------------------------------------------
// Row highlighting
// ---------------------------------------------------------------------------

/**
 * Marks one row so it stays visually tied together across a table far wider
 * than the screen. Double-clicking any cell marks its row; double-clicking it
 * again clears it.
 *
 * This is separate from the export selection: selected rows are highlighted the
 * same way, but that state belongs to the toolbar's select mode and is passed
 * in from there.
 */
export function useRowHighlight() {
  const [highlightedRow, setHighlightedRow] = useState<unknown>(null)

  // Escape clears it, as it drops a selection in a spreadsheet.
  useEffect(() => {
    if (highlightedRow === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHighlightedRow(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [highlightedRow])

  const toggleRow = useCallback((rowId: unknown) => {
    // No need to clear a text selection here: the cells that accept this
    // gesture set `user-select: none`, so double-clicking one never starts one.
    setHighlightedRow((prev: unknown) => (prev === rowId ? null : rowId))
  }, [])

  return { highlightedRow, toggleRow }
}

// A deep emerald, matching the green already used for a paid supplier but far
// stronger, so a marked row is unmistakable at a glance across a wide table.
// Still translucent, so the row's own colour reads through underneath.
const ROW_HIGHLIGHT_TINT = "rgba(4, 120, 87, 0.22)"

/**
 * Builds the box-shadow that tints a highlighted row, keeping any shadow the
 * cell already had.
 *
 * A tint rather than a background colour: the rows already say things in colour
 * — red for a delayed order, green for a paid supplier, alternating stripes for
 * readability — and overwriting backgroundColor would erase all of it. A large
 * inset shadow paints over the existing background instead. Shadows earlier in
 * the list paint on top, so the sticky column's edge and separator are passed
 * first and stay visible above the tint.
 */
export function rowHighlightShadow(
  highlighted: boolean,
  existing?: string
): string | undefined {
  if (!highlighted) return existing
  const tint = `inset 0 0 0 9999px ${ROW_HIGHLIGHT_TINT}`
  return existing ? `${existing}, ${tint}` : tint
}

/** How long the table waits after the last keystroke before it queries. */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * Debounces the search box and the column filters down to the values actually
 * sent to the API, so a word typed into either costs one query instead of one
 * per keystroke.
 *
 * The state restored by usePersistedTableState is adopted immediately rather
 * than after the debounce: waiting would fire a first request with an empty
 * search and a second with the restored one. `hydrated` stays false until that
 * has happened, and callers must not fetch before it flips.
 */
export function useDebouncedTableQuery(
  ready: boolean,
  search: string,
  columnFilters: string,
  delay: number = SEARCH_DEBOUNCE_MS
): { search: string; columnFilters: string; hydrated: boolean } {
  const [applied, setApplied] = useState({ search: "", columnFilters: "" })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!hydrated) {
      setApplied({ search, columnFilters })
      setHydrated(true)
      return
    }
    // Editing back to what is already applied — deleting a character and
    // retyping it, or a filter edit that serializes the same — must not
    // re-query, and must cancel the pending one.
    if (search === applied.search && columnFilters === applied.columnFilters) return
    const timer = setTimeout(() => setApplied({ search, columnFilters }), delay)
    return () => clearTimeout(timer)
  }, [ready, hydrated, search, columnFilters, applied.search, applied.columnFilters, delay])

  return { search: applied.search, columnFilters: applied.columnFilters, hydrated }
}

/**
 * Guards a table against its own in-flight requests.
 *
 * Search fires a request per change, and the server does not answer them in the
 * order they were sent: without this, the slow response for "ab" lands after the
 * quick one for "abc" and leaves the wrong rows sitting under the search box.
 * Starting a request aborts the one it supersedes — so the browser connection
 * and the Postgres query behind it are dropped instead of finishing for nobody —
 * and stamps it, so a response that still arrives is ignored rather than
 * overwriting fresher rows.
 */
export function useLatestRequest() {
  const seq = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  // Unmounting supersedes everything still open.
  useEffect(() => () => inFlight.current?.abort(), [])

  return useCallback(() => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const id = ++seq.current
    return {
      signal: controller.signal,
      /** False once a newer request has started — leave the state alone. */
      isCurrent: () => id === seq.current,
    }
  }, [])
}

/**
 * Reads a JSON API response, tolerating one that isn't JSON.
 *
 * These endpoints promise `{ data, pagination }` or `{ error }`, but a route
 * that throws while *loading* — a missing env var, a bad import — never runs
 * its own error handling, and Next answers with an HTML error page instead.
 * `response.json()` on that rejects with `Unexpected token '<', "<!DOCTYPE "...
 * is not valid JSON`, which names the parser rather than the request that
 * actually failed, and that string is what ends up in the table's error banner.
 * Report the status instead, and point at the logs that carry the stack.
 */
export async function readJsonResponse(response: Response): Promise<any> {
  const body = await response.text()
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(
      `The server returned ${response.status}` +
        `${response.statusText ? ` ${response.statusText}` : ""} instead of data. ` +
        `Check the server logs for the failing request.`
    )
  }
}

/** True for the error fetch rejects with when a request is aborted. */
export const isAbortError = (err: unknown): boolean =>
  (err as { name?: string } | null)?.name === "AbortError"

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
    const result = await readJsonResponse(response)
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
