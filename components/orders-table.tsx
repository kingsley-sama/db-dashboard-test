"use client"

import { useEffect, useState } from "react"
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
import { usePersistedTableState, fetchAllRows, downloadCsv } from "@/lib/table-utils"
import { OrdersDataTable } from "@/components/orders-data-table"
import { CreateOrderDialog } from "@/components/create-order-dialog"
import { EditOrderDialog } from "@/components/edit-order-dialog"
import useSWR from "swr"
import { User } from "@/lib/db/schema"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function OrdersTable({
  onOrdersChange,
  apiPath = "/api/orders",
  enableCreate = true,
  enableActions = true,
}: {
  onOrdersChange?: () => void
  apiPath?: string
  enableCreate?: boolean
  enableActions?: boolean
}) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)
  // Row selection for export. Stores full row objects keyed by id so selections
  // survive changing pages, search, or column filters.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Map<any, any>>(new Map())
  // Search/page persist per table (orders vs all-orders) and restore on return
  const { searchTerm, setSearchTerm, currentPage, setCurrentPage, ready } =
    usePersistedTableState(`table-state:${apiPath}`)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [deletingOrder, setDeletingOrder] = useState<any>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const { data: user } = useSWR<User>("/api/user", fetcher)
  // Only owners and admins may delete orders (also enforced server-side).
  const canDelete = user?.role === "owner" || user?.role === "admin"
  // APMs have no access to the CSV export feature
  const canExport = user?.role !== "apm"
  // APMs don't see the Net Sum column
  const hiddenColumns = user?.role === "apm" ? ["net_sum"] : undefined
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    totalPages: 0
  })

  // Fetch orders when page, search, or filter changes (once saved state is restored)
  useEffect(() => {
    if (!ready) return
    fetchOrders(currentPage)
  }, [ready, currentPage, searchTerm])

  const fetchOrders = async (page = 1) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '500',
      })
      
      if (searchTerm) params.append('search', searchTerm)

      const response = await fetch(`${apiPath}?${params.toString()}`)
      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to fetch orders')
      } else {
        setOrders(result.data || [])
        setPagination(result.pagination || { page: 1, limit: 500, total: 0, totalPages: 0 })
        onOrdersChange?.()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle search and filter
  // Note: Search and filter are now handled on the backend across all data.
  // Changing the search resets to page 1 inside usePersistedTableState.

  const handleExportCsv = async (scope: "filtered" | "all" | "selected") => {
    setExporting(true)
    setError("")
    try {
      const rows =
        scope === "selected"
          ? Array.from(selectedRows.values())
          : await fetchAllRows(apiPath, scope === "filtered" ? searchTerm : undefined)
      if (rows.length === 0) {
        setError("Nothing to export")
        return
      }
      const table = apiPath.split("/").pop() || "orders"
      const suffix =
        scope === "selected" ? "_selected" : scope === "filtered" && searchTerm ? "_filtered" : ""
      downloadCsv(rows, `${table}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`)
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

  const handleToggleRow = (order: any, checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Map(prev)
      if (checked) next.set(order.id, order)
      else next.delete(order.id)
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

  const handleCreateOrder = async (newOrder: any) => {
    try {
      const response = await fetch(`${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      })
      
      const result = await response.json()

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to create order' }
      } else {
        await fetchOrders(currentPage) // Refresh current page
        setShowCreateDialog(false)
        onOrdersChange?.()
        return { success: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  const handleUpdateOrder = async (updatedOrder: any) => {
    try {
      const response = await fetch(`/api/orders/${updatedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      })
      
      const result = await response.json()

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to update order' }
      } else {
        await fetchOrders(currentPage) // Refresh current page
        setEditingOrder(null)
        onOrdersChange?.()
        return { success: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  const handleToggleSupplierPayment = async (order: any, value: boolean) => {
    // Optimistically update local state
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, supplier_payment: value } : o))
    )

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_payment: value })
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to update supplier payment')
      }

      onOrdersChange?.()
    } catch (err: any) {
      // Revert on failure
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, supplier_payment: !value } : o))
      )
      setError(err.message)
    }
  }

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return
    setDeleteLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/orders/${deletingOrder.id}`, {
        method: 'DELETE',
      })
      const result = await response.json()

      if (!response.ok) {
        // Surface the underlying error (e.g. 403 for non-owner/admin)
        setError(result.error || 'Failed to delete order')
      } else {
        setDeletingOrder(null)
        await fetchOrders(currentPage)
        onOrdersChange?.()
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
            ({orders.length} orders on this page)
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
              placeholder="Search by project, order ID, product, supplier, or company name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white"
              style={{ borderColor: '#8d9499', color: '#012e64' }}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => fetchOrders(currentPage)} 
              variant="outline"
              className="hover:bg-gray-50"
              style={{ borderColor: '#8d9499', color: '#012e64' }}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {canExport && (
            <>
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
                  disabled={!searchTerm}
                >
                  Filtered rows{searchTerm ? ` (${pagination.total.toLocaleString()})` : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportCsv("all")}>
                  All rows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
            )}
            {enableCreate && (
              <Button 
                onClick={() => setShowCreateDialog(true)} 
                className="whitespace-nowrap text-white"
                style={{ backgroundColor: '#012e64' }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Order
              </Button>
            )}
          </div>
        </div>

        {/* Total Count Display */}
        <div className="flex items-center justify-center py-3 px-4 rounded-lg" style={{ backgroundColor: '#f0f7ff', border: '1px solid #d0e7ff' }}>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: '#012e64' }}>
              {pagination.total.toLocaleString()}
            </div>
            <div className="text-sm font-medium" style={{ color: '#5d6b88' }}>
              Total Orders{searchTerm ? ' (filtered)' : ''}
            </div>
          </div>
        </div>

        {/* Current Page Info */}
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: '#5d6b88' }}>
            Showing <span className="font-semibold" style={{ color: '#012e64' }}>{orders.length}</span> orders on this page
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
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full animate-spin mx-auto mb-4" style={{ border: '3px solid #e5e5e5', borderTopColor: '#012e64' }}></div>
              <p style={{ color: '#5d6b88' }}>Loading orders...</p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-medium" style={{ color: '#012e64' }}>No orders found</p>
              <p className="text-sm mt-1" style={{ color: '#5d6b88' }}>Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          <OrdersDataTable
            orders={orders}
            onEdit={enableActions ? setEditingOrder : undefined}
            onDelete={enableActions && canDelete ? setDeletingOrder : undefined}
            onToggleSupplierPayment={enableActions ? handleToggleSupplierPayment : undefined}
            selectable={selectMode}
            selectedIds={new Set(selectedRows.keys())}
            onToggleRow={handleToggleRow}
            onToggleAll={handleToggleAll}
            hiddenColumns={hiddenColumns}
          />
        )}
      </div>

      {/* Bottom Pagination */}
      <PaginationControls />

      {/* Create Dialog */}
      {showCreateDialog && enableCreate && (
        <CreateOrderDialog onClose={() => setShowCreateDialog(false)} onCreate={handleCreateOrder} />
      )}

      {/* Edit Dialog */}
      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onUpdate={handleUpdateOrder} />
      )}

      {/* Delete Confirmation — owner/admin only (gated above and server-side) */}
      {deletingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6 space-y-4" style={{ border: '1px solid #e5e5e5' }}>
            <h2 className="text-lg font-semibold" style={{ color: '#012e64' }}>Delete order?</h2>
            <p className="text-sm" style={{ color: '#5d6b88' }}>
              This will permanently delete order{" "}
              <span className="font-semibold" style={{ color: '#012e64' }}>
                {deletingOrder.order_id}
                {deletingOrder.company_name ? ` — ${deletingOrder.company_name}` : ""}
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingOrder(null)}
                disabled={deleteLoading}
                className="hover:bg-gray-50"
                style={{ borderColor: '#8d9499', color: '#012e64' }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteOrder}
                disabled={deleteLoading}
                className="text-white"
                style={{ backgroundColor: '#dc2626' }}
              >
                {deleteLoading ? "Deleting..." : "Delete Order"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
