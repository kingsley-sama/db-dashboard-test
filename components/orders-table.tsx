"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Search, Filter, RefreshCw } from "lucide-react"
import { OrdersDataTable } from "@/components/orders-data-table"
import { CreateOrderDialog } from "@/components/create-order-dialog"
import { EditOrderDialog } from "@/components/edit-order-dialog"

export function OrdersTable({ onOrdersChange }: { onOrdersChange?: () => void }) {
  const [orders, setOrders] = useState<any[]>([])
  const [filteredOrders, setFilteredOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [filterType, setFilterType] = useState<string>("")

  // Fetch orders
  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch('/api/orders')
      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to fetch orders')
      } else {
        setOrders(result.data || [])
        setFilteredOrders(result.data || [])
        onOrdersChange?.()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle search and filter
  useEffect(() => {
    let result = orders

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (order) =>
          order.order_number?.toLowerCase().includes(term) ||
          order.project_id?.toLowerCase().includes(term) ||
          order.product?.toLowerCase().includes(term) ||
          order.product_name?.toLowerCase().includes(term) ||
          order.supplier?.toLowerCase().includes(term),
      )
    }

    if (filterType) {
      result = result.filter((order) => order.order_type === filterType)
    }

    setFilteredOrders(result)
  }, [searchTerm, filterType, orders])

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
        setOrders([...orders, ...result.data])
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
        setOrders(orders.map((order) => (order.id === updatedOrder.id ? { ...order, ...updatedOrder } : order)))
        setEditingOrder(null)
        onOrdersChange?.()
        return { success: true }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
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
              placeholder="Search by order #, project, product, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white"
              style={{ borderColor: '#8d9499', color: '#012e64' }}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={fetchOrders} 
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

        {/* Filter Bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2" style={{ color: '#5d6b88' }}>
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filter:</span>
          </div>
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

        {/* Results Info */}
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: '#5d6b88' }}>
            Showing <span className="font-semibold" style={{ color: '#012e64' }}>{filteredOrders.length}</span> of{" "}
            <span className="font-semibold" style={{ color: '#012e64' }}>{orders.length}</span> orders
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full animate-spin mx-auto mb-4" style={{ border: '3px solid #e5e5e5', borderTopColor: '#012e64' }}></div>
              <p style={{ color: '#5d6b88' }}>Loading orders...</p>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-medium" style={{ color: '#012e64' }}>No orders found</p>
              <p className="text-sm mt-1" style={{ color: '#5d6b88' }}>Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          <OrdersDataTable orders={filteredOrders} onEdit={setEditingOrder} />
        )}
      </div>

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
