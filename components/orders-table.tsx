"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { OrdersDataTable } from "@/components/orders-data-table"
import { CreateOrderDialog } from "@/components/create-order-dialog"
import { EditOrderDialog } from "@/components/edit-order-dialog"

export function OrdersTable({ onOrdersChange }: { onOrdersChange?: () => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [filterType, setFilterType] = useState<string>("")
  const [filterPM, setFilterPM] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    totalPages: 0
  })

  // Fetch orders when page, search, or filter changes
  useEffect(() => {
    fetchOrders(currentPage)
  }, [currentPage, searchTerm, filterType, filterPM])

  const fetchOrders = async (page = 1) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '500',
      })
      
      if (searchTerm) params.append('search', searchTerm)
      if (filterType) params.append('filterType', filterType)
      if (filterPM) params.append('filterPM', filterPM)
      
      const response = await fetch(`/api/orders?${params.toString()}`)
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

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1)
    }
  }, [searchTerm, filterType, filterPM])

  // Handle search and filter
  // Note: Search and filter are now handled on the backend across all data

  const handleCreateOrder = async (newOrder: any) => {
    try {
      const response = await fetch('/api/orders', {
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
    <div className="h-full flex flex-col overflow-hidden bg-white rounded-xl" style={{ border: '1px solid #e5e5e5' }}>
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
            <Button 
              onClick={() => setShowCreateDialog(true)} 
              className="whitespace-nowrap text-white"
              style={{ backgroundColor: '#012e64' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Order
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
              Total Orders{searchTerm || filterType || filterPM ? ' (filtered)' : ''}
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2" style={{ color: '#5d6b88' }}>
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filter:</span>
          </div>
          {/* PM Filter */}
          <select
            value={filterPM}
            onChange={(e) => setFilterPM(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white"
            style={{ border: '1px solid #8d9499', color: filterPM ? '#012e64' : '#5d6b88' }}
          >
            <option value="">All PMs</option>
            {["Viktoria", "Sonia", "Vivien", "Nesrin", "Ani", "Viktoria & Sonia", "Viktoria und Vivien", "Sonia und Vivien", "Sonia & CH"].map((pm) => (
              <option key={pm} value={pm}>{pm}</option>
            ))}
          </select>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterType("")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                !filterType
                  ? "text-white"
                  : "hover:bg-gray-100"
              }`}
              style={!filterType ? { backgroundColor: '#012e64' } : { color: '#5d6b88', border: '1px solid #e5e5e5' }}
            >
              All
            </button>
            {["standard", "express", "custom"].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                  filterType === type
                    ? "text-white"
                    : "hover:bg-gray-100"
                }`}
                style={filterType === type ? { backgroundColor: '#012e64' } : { color: '#5d6b88', border: '1px solid #e5e5e5' }}
              >
                {type}
              </button>
            ))}
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
      <div className="flex-1 overflow-auto">
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
          <OrdersDataTable orders={orders} onEdit={setEditingOrder} />
        )}
      </div>

      {/* Bottom Pagination */}
      <PaginationControls />

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateOrderDialog onClose={() => setShowCreateDialog(false)} onCreate={handleCreateOrder} />
      )}

      {/* Edit Dialog */}
      {editingOrder && (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} onUpdate={handleUpdateOrder} />
      )}
    </div>
  )
}
