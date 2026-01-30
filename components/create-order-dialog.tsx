"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle } from "lucide-react"

export function CreateOrderDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (order: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState({
    project_id: "",
    order_number: "",
    product: "",
    product_name: "",
    order_type: "standard",
    quantity: "",
    cost: "",
    supplier: "",
    due_delivery_date: "",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const newOrder = {
      ...formData,
      quantity: formData.quantity ? Number.parseInt(formData.quantity) : null,
      cost: formData.cost ? Number.parseFloat(formData.cost) : null,
      due_delivery_date: formData.due_delivery_date || null,
    }

    const result = await onCreate(newOrder)
    setLoading(false)
    
    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl" style={{ borderColor: '#e5e5e5' }}>
        <CardHeader className="flex flex-row items-center justify-between bg-white" style={{ borderBottom: '1px solid #e5e5e5' }}>
          <div>
            <CardTitle style={{ color: '#012e64' }}>Create New Order</CardTitle>
            <CardDescription style={{ color: '#5d6b88' }}>Add a new order to the system</CardDescription>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors" style={{ color: '#5d6b88' }}>
            <X className="w-5 h-5" />
          </button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError("")}
                  className="text-sm hover:underline font-medium ml-2"
                >
                  Dismiss
                </button>
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project ID *</label>
                <Input
                  name="project_id"
                  value={formData.project_id}
                  onChange={handleChange}
                  required
                  placeholder="e.g., PROJ-001"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Number *</label>
                <Input
                  name="order_number"
                  value={formData.order_number}
                  onChange={handleChange}
                  required
                  placeholder="e.g., ORD-2025-001"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product *</label>
                <Input
                  name="product"
                  value={formData.product}
                  onChange={handleChange}
                  required
                  placeholder="Product type"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Name</label>
                <Input
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleChange}
                  placeholder="Product name"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Type</label>
                <select
                  name="order_type"
                  value={formData.order_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Quantity</label>
                <Input
                  name="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="0"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Cost</label>
                <Input
                  name="cost"
                  type="number"
                  step="0.01"
                  value={formData.cost}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Supplier</label>
                <Input name="supplier" value={formData.supplier} onChange={handleChange} placeholder="Supplier name" className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Due Delivery Date</label>
                <Input
                  name="due_delivery_date"
                  type="date"
                  value={formData.due_delivery_date}
                  onChange={handleChange}
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4" style={{ borderTop: '1px solid #e5e5e5' }}>
              <Button variant="outline" onClick={onClose} disabled={loading} className="hover:bg-gray-50" style={{ borderColor: '#8d9499', color: '#012e64' }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="text-white" style={{ backgroundColor: '#012e64' }}>
                {loading ? "Creating..." : "Create Order"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
