"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, Download, Loader2, CheckSquare } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  usePersistedTableState,
  useDebouncedTableQuery,
  useLatestRequest,
  isAbortError,
  readJsonResponse,
  fetchAllRows,
  downloadCsv,
} from "@/lib/table-utils"
import { serializeColumnFilters } from "@/lib/column-filters"
import { ProjectsDataTable } from "@/components/projects-data-table"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { EditProjectDialog } from "@/components/edit-project-dialog"

export function ProjectsTable({
  onProjectsChange,
}: {
  /** Called after a row is created, edited or deleted — not after a re-read. */
  onProjectsChange?: () => void
}) {
  const [projects, setProjects] = useState<any[]>([])
  // `loaded` gates the one full-page spinner, on the very first request.
  // `refreshing` is every request after that, which runs *under* the table
  // rather than replacing it.
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)
  // Row selection for export. Stores full row objects keyed by id so selections
  // survive changing pages, search, or column filters.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Map<any, any>>(new Map())
  // Search/filters/page persist to localStorage and restore when returning here
  const {
    searchTerm,
    setSearchTerm,
    columnFilters,
    setColumnFilters,
    currentPage,
    setCurrentPage,
    ready,
  } = usePersistedTableState("table-state:projects")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [deletingProject, setDeletingProject] = useState<any>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    totalPages: 0
  })

  // Column filters go to the API alongside the search box, so they narrow the
  // whole table rather than just the rows already loaded.
  const serializedFilters = useMemo(() => serializeColumnFilters(columnFilters), [columnFilters])

  // Typing in a filter or the search box shouldn't fire a query per keystroke.
  // These are the values the requests actually carry.
  const {
    search: appliedSearch,
    columnFilters: appliedFilters,
    hydrated,
  } = useDebouncedTableQuery(ready, searchTerm, serializedFilters)

  // Fetch projects when the page or the applied search/filters change.
  // `hydrated` holds this off until the saved state has been restored, so the
  // first request already carries it instead of firing twice.
  useEffect(() => {
    if (!hydrated) return
    fetchProjects(currentPage)
  }, [hydrated, currentPage, appliedSearch, appliedFilters])

  const beginRequest = useLatestRequest()

  const fetchProjects = async (page = 1) => {
    // Supersedes whatever is in flight: responses arrive out of order, and the
    // last one to land — not the last one requested — would otherwise win.
    const { signal, isCurrent } = beginRequest()
    setRefreshing(true)
    setError("")
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '500',
      })

      // The applied values, not the raw inputs: the request has to match the
      // state that triggered it, or a keystroke landing mid-flight sends a
      // search the table isn't showing yet.
      if (appliedSearch) params.append('search', appliedSearch)
      if (appliedFilters) params.append('columnFilters', appliedFilters)

      const response = await fetch(`/api/projects?${params.toString()}`, { signal })
      const result = await readJsonResponse(response)
      if (!isCurrent()) return

      if (!response.ok) {
        setError(result.error || 'Failed to fetch projects')
      } else {
        setProjects(result.data || [])
        setPagination(result.pagination || { page: 1, limit: 500, total: 0, totalPages: 0 })
        // Deliberately NOT onProjectsChange(): that reports a *mutation*, and
        // the page answers it by re-reading /api/projects for its stat cards.
        // Firing it here meant every search pulled the whole unfiltered first
        // page a second time.
      }
    } catch (err: any) {
      if (isAbortError(err) || !isCurrent()) return
      setError(err.message)
    } finally {
      if (isCurrent()) {
        setRefreshing(false)
        // Even a failed first request retires the spinner — the error alert and
        // the table's own empty state say more than a spinner that never stops.
        setLoaded(true)
      }
    }
  }

  // Changing the search resets to page 1 inside usePersistedTableState

  // Distinct values for the multi-select column filters. Fetched per column the
  // first time its dropdown opens — the whole table's values, not just the
  // loaded page's — and kept for the life of the mounted table.
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({})
  const requestedOptions = useRef<Set<string>>(new Set())

  const handleRequestFilterOptions = useCallback(async (column: string) => {
    if (requestedOptions.current.has(column)) return
    requestedOptions.current.add(column)
    try {
      const response = await fetch(
        `/api/projects/filter-options?column=${encodeURIComponent(column)}`
      )
      const result = await readJsonResponse(response)
      if (!response.ok) throw new Error(result.error || "Failed to load filter options")
      setFilterOptions((prev) => ({ ...prev, [column]: result.values || [] }))
    } catch {
      // Leave the dropdown empty and allow a retry on the next open.
      requestedOptions.current.delete(column)
    }
  }, [])

  // The applied values, so the label and the export agree with the rows and the
  // total on screen rather than with a search still inside the debounce.
  const hasFilters = Boolean(appliedSearch || appliedFilters)

  const handleExportCsv = async (scope: "filtered" | "all" | "selected") => {
    setExporting(true)
    setError("")
    try {
      const rows =
        scope === "selected"
          ? Array.from(selectedRows.values())
          : await fetchAllRows(
              "/api/projects",
              scope === "filtered"
                ? { search: appliedSearch, columnFilters: appliedFilters }
                : {}
            )
      if (rows.length === 0) {
        setError("Nothing to export")
        return
      }
      const suffix =
        scope === "selected" ? "_selected" : scope === "filtered" && hasFilters ? "_filtered" : ""
      downloadCsv(rows, `projects${suffix}_${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const toggleSelectMode = () => {
    setSelectMode((on) => {
      if (on) setSelectedRows(new Map()) // leaving select mode clears the selection
      return !on
    })
  }

  const handleToggleRow = (project: any, checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Map(prev)
      if (checked) next.set(project.id, project)
      else next.delete(project.id)
      return next
    })
  }

  const handleToggleAll = (rows: any[], checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Map(prev)
      for (const row of rows) {
        if (checked) next.set(row.id, row)
        else next.delete(row.id)
      }
      return next
    })
  }

  const handleCreateProject = async (newProject: any) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      })

      const result = await readJsonResponse(response)

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to create project' }
      } else {
        await fetchProjects(currentPage) // Refresh current page
        setShowCreateDialog(false)
        onProjectsChange?.()
        return { success: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  const handleUpdateProject = async (updatedProject: any) => {
    try {
      const response = await fetch(`/api/projects/${updatedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject)
      })

      const result = await readJsonResponse(response)

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to update project' }
      } else {
        await fetchProjects(currentPage) // Refresh current page
        setEditingProject(null)
        onProjectsChange?.()
        return { success: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  const handleDeleteProject = async () => {
    if (!deletingProject) return
    setDeleteLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/projects/${deletingProject.id}`, {
        method: 'DELETE',
      })
      const result = await readJsonResponse(response)

      if (!response.ok) {
        // Surface the underlying error (e.g. project still has orders)
        setError(result.error || 'Failed to delete project')
      } else {
        setDeletingProject(null)
        await fetchProjects(currentPage)
        onProjectsChange?.()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Pagination component
  const PaginationControls = () => {
    if (pagination.totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: '#e5e5e5', backgroundColor: '#fafafa' }}>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium" style={{ color: '#012e64' }}>
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="text-sm" style={{ color: '#5d6b88' }}>
            ({projects.length} projects on this page)
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="hover:bg-gray-50"
            style={{ borderColor: '#8d9499', color: '#012e64' }}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          {/* Page Numbers */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className={pageNum === currentPage ? "text-white" : "hover:bg-gray-50"}
                  style={
                    pageNum === currentPage
                      ? { backgroundColor: '#012e64' }
                      : { borderColor: '#8d9499', color: '#012e64' }
                  }
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === pagination.totalPages}
            className="hover:bg-gray-50"
            style={{ borderColor: '#8d9499', color: '#012e64' }}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #e5e5e5' }}>
      <div className="shrink-0 p-6 space-y-4">
        {error && (
          <Alert variant="destructive" className="animate-in slide-in-from-top-2" style={{ border: '1px solid #f05d5e', backgroundColor: '#fef2f2' }}>
            <AlertDescription className="flex items-center justify-between" style={{ color: '#991b1b' }}>
              {error}
              <button onClick={() => setError("")} className="text-sm hover:underline font-medium">
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Search and Actions Bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#8d9499' }} />
            <Input
              type="text"
              placeholder="Search by project ID, name, manager, sales person, invoice, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white"
              style={{ borderColor: '#8d9499', color: '#012e64' }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => fetchProjects(currentPage)}
              variant="outline"
              title="Refresh"
              className="hover:bg-gray-50"
              style={{ borderColor: '#8d9499', color: '#012e64' }}
            >
              <RefreshCw className={`w-4 h-4${refreshing ? ' animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={toggleSelectMode}
              variant="outline"
              title={selectMode ? "Exit select mode (clears selection)" : "Select rows to export"}
              className={selectMode ? "" : "hover:bg-gray-50"}
              style={
                selectMode
                  ? { backgroundColor: '#012e64', borderColor: '#012e64', color: '#ffffff' }
                  : { borderColor: '#8d9499', color: '#012e64' }
              }
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              {selectMode
                ? `Selecting${selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}`
                : 'Select'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={exporting}
                  className="hover:bg-gray-50"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleExportCsv("selected")}
                  disabled={selectedRows.size === 0}
                >
                  Selected rows{selectedRows.size > 0 ? ` (${selectedRows.size.toLocaleString()})` : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportCsv("filtered")}
                  disabled={!hasFilters}
                >
                  Filtered rows{hasFilters ? ` (${pagination.total.toLocaleString()})` : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportCsv("all")}>
                  All rows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="whitespace-nowrap text-white"
              style={{ backgroundColor: '#012e64' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* Total Count Display */}
        <div className="flex items-center justify-center py-3 px-4 rounded-lg" style={{ backgroundColor: '#f0f7ff', border: '1px solid #d0e7ff' }}>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: '#012e64' }}>
              {pagination.total.toLocaleString()}
            </div>
            <div className="text-sm font-medium" style={{ color: '#5d6b88' }}>
              Total Projects{hasFilters ? ' (filtered)' : ''}
            </div>
          </div>
        </div>

        {/* Current Page Info */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2" style={{ color: '#5d6b88' }}>
            Showing <span className="font-semibold" style={{ color: '#012e64' }}>{projects.length}</span> projects on this page
            {/* The only thing that moves while re-querying — the rows below stay
                put so the header's filter inputs keep focus. */}
            {refreshing && loaded && (
              <span className="flex items-center gap-1.5" style={{ color: '#8d9499' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Updating...
              </span>
            )}
          </span>
          {pagination.totalPages > 1 && (
            <span style={{ color: '#5d6b88' }}>
              Page <span className="font-semibold" style={{ color: '#012e64' }}>{pagination.page}</span> of{" "}
              <span className="font-semibold" style={{ color: '#012e64' }}>{pagination.totalPages}</span>
            </span>
          )}
        </div>
      </div>

      {/* Top Pagination */}
      <PaginationControls />

      {/* Table */}
      <div className="flex-1" aria-busy={refreshing}>
        {!loaded ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full animate-spin mx-auto mb-4" style={{ border: '3px solid #e5e5e5', borderTopColor: '#012e64' }}></div>
              <p style={{ color: '#5d6b88' }}>Loading projects...</p>
            </div>
          </div>
        ) : (
          // Past the first load the table is never swapped out — not for a
          // re-query and not for an empty result. Its header carries the search
          // and column filter inputs, so unmounting it pulled the caret out of
          // the box mid-word, dropped the horizontal scroll position, and left
          // no way to clear the filter that emptied the table. Zero rows are
          // handled by the table's own empty state, below the header.
          <ProjectsDataTable
            projects={projects}
            onEdit={setEditingProject}
            onDelete={setDeletingProject}
            selectable={selectMode}
            selectedIds={new Set(selectedRows.keys())}
            onToggleRow={handleToggleRow}
            onToggleAll={handleToggleAll}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            filterOptions={filterOptions}
            onRequestFilterOptions={handleRequestFilterOptions}
            totalRows={pagination.total}
          />
        )}
      </div>

      {/* Bottom Pagination */}
      <PaginationControls />

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateProjectDialog onClose={() => setShowCreateDialog(false)} onCreate={handleCreateProject} />
      )}

      {/* Edit Dialog */}
      {editingProject && (
        <EditProjectDialog project={editingProject} onClose={() => setEditingProject(null)} onUpdate={handleUpdateProject} />
      )}

      {/* Delete Confirmation */}
      {deletingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 space-y-4" style={{ border: '1px solid #e5e5e5' }}>
            <h2 className="text-lg font-semibold" style={{ color: '#012e64' }}>Delete project?</h2>
            <p className="text-sm" style={{ color: '#5d6b88' }}>
              This will permanently delete project{" "}
              <span className="font-semibold" style={{ color: '#012e64' }}>
                {deletingProject.project_id}
                {deletingProject.project_name ? ` — ${deletingProject.project_name}` : ""}
              </span>
              . This action cannot be undone. Projects that still have orders cannot be deleted.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingProject(null)}
                disabled={deleteLoading}
                className="hover:bg-gray-50"
                style={{ borderColor: '#8d9499', color: '#012e64' }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteProject}
                disabled={deleteLoading}
                className="text-white"
                style={{ backgroundColor: '#dc2626' }}
              >
                {deleteLoading ? "Deleting..." : "Delete Project"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
