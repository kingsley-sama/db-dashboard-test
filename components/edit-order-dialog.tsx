"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle } from "lucide-react"

export function EditOrderDialog({
  order,
  onClose,
  onUpdate,
}: {
  order: any
  onClose: () => void
  onUpdate: (order: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState(order)
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

    const updatedOrder = {
      ...formData,
      quantity: formData.quantity ? Number.parseInt(formData.quantity) : null,
      cost: formData.cost ? Number.parseFloat(formData.cost) : null,
      unit_price: formData.unit_price ? Number.parseFloat(formData.unit_price) : null,
      net_sum: formData.net_sum ? Number.parseFloat(formData.net_sum) : null,
      gross_sum: formData.gross_sum ? Number.parseFloat(formData.gross_sum) : null,
      db_1: formData.db_1 ? Number.parseFloat(formData.db_1) : null,
      profit_margin: formData.profit_margin ? Number.parseFloat(formData.profit_margin) : null,
      roi: formData.roi ? Number.parseFloat(formData.roi) : null,
      delay_first_delivery: formData.delay_first_delivery ? Number.parseInt(formData.delay_first_delivery) : 0,
      delay_first_revision: formData.delay_first_revision ? Number.parseInt(formData.delay_first_revision) : 0,
      delay_second_revision: formData.delay_second_revision ? Number.parseInt(formData.delay_second_revision) : 0,
      due_delivery_date: formData.due_delivery_date || null,
      delivery_1_date: formData.delivery_1_date || null,
      delivery_2_date: formData.delivery_2_date || null,
      delivery_3_date: formData.delivery_3_date || null,
      delivery_4_date: formData.delivery_4_date || null,
      date_information_complete: formData.date_information_complete || null,
    }

    const result = await onUpdate(updatedOrder)
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
            <CardTitle style={{ color: '#012e64' }}>Edit Order</CardTitle>
            <CardDescription style={{ color: '#5d6b88' }}>Order #{order.order_number}</CardDescription>
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project ID</label>
                <Input name="project_id" value={formData.project_id} onChange={handleChange} disabled className="bg-gray-50" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Number</label>
                <Input name="order_number" value={formData.order_number} onChange={handleChange} disabled className="bg-gray-50" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product</label>
                <Input name="product" value={formData.product || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Name</label>
                <Input name="product_name" value={formData.product_name || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Type</label>
                <select
                  name="order_type"
                  value={formData.order_type || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white"
                  style={{ border: '1px solid #8d9499', color: '#012e64' }}
                >
                  <option value="">Select type</option>
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Quantity</label>
                <Input name="quantity" type="number" value={formData.quantity || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Cost</label>
                <Input
                  name="cost"
                  type="number"
                  step="0.01"
                  value={formData.cost || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Supplier</label>
                <Input name="supplier" value={formData.supplier || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Status</label>
                <select
                  name="status"
                  value={formData.status || ""}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white"
                  style={{ border: '1px solid #8d9499', color: '#012e64' }}
                >
                  <option value="">Select status</option>
                  <option>pending</option>
                  <option>processing</option>
                  <option>completed</option>
                  <option>cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Notes</label>
                <Input
                  name="notes"
                  value={formData.notes || ""}
                  onChange={handleChange}
                  placeholder="Add notes..."
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Due Delivery Date</label>
                <Input
                  name="due_delivery_date"
                  type="date"
                  value={formData.due_delivery_date ? formData.due_delivery_date.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delivery 1 Date</label>
                <Input
                  name="delivery_1_date"
                  type="date"
                  value={formData.delivery_1_date ? formData.delivery_1_date.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delivery 2 Date</label>
                <Input
                  name="delivery_2_date"
                  type="date"
                  value={formData.delivery_2_date ? formData.delivery_2_date.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delivery 3 Date</label>
                <Input
                  name="delivery_3_date"
                  type="date"
                  value={formData.delivery_3_date ? formData.delivery_3_date.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delivery 4 Date</label>
                <Input
                  name="delivery_4_date"
                  type="date"
                  value={formData.delivery_4_date ? formData.delivery_4_date.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Date Information Complete</label>
                <Input
                  name="date_information_complete"
                  type="date"
                  value={formData.date_information_complete ? formData.date_information_complete.split("T")[0] : ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Unit Price</label>
                <Input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  value={formData.unit_price || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Net Sum</label>
                <Input
                  name="net_sum"
                  type="number"
                  step="0.01"
                  value={formData.net_sum || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Gross Sum</label>
                <Input
                  name="gross_sum"
                  type="number"
                  step="0.01"
                  value={formData.gross_sum || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>DB 1</label>
                <Input
                  name="db_1"
                  type="number"
                  step="0.01"
                  value={formData.db_1 || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Profit Margin</label>
                <Input
                  name="profit_margin"
                  type="number"
                  step="0.01"
                  value={formData.profit_margin || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>ROI</label>
                <Input
                  name="roi"
                  type="number"
                  step="0.01"
                  value={formData.roi || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Type</label>
                <Input
                  name="product_type"
                  value={formData.product_type || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Sale Type</label>
                <Input
                  name="sale_type"
                  value={formData.sale_type || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>AP EPCS Invoicing</label>
                <Input
                  name="ap_epcs_invoicing"
                  value={formData.ap_epcs_invoicing || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>PM</label>
                <Input
                  name="PM"
                  value={formData.PM || ""}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delay 1st Delivery (days)</label>
                <Input
                  name="delay_first_delivery"
                  type="number"
                  value={formData.delay_first_delivery || 0}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delay 1st Revision (days)</label>
                <Input
                  name="delay_first_revision"
                  type="number"
                  value={formData.delay_first_revision || 0}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Delay 2nd Revision (days)</label>
                <Input
                  name="delay_second_revision"
                  type="number"
                  value={formData.delay_second_revision || 0}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Comments</label>
                <Input
                  name="comments"
                  value={formData.comments || ""}
                  onChange={handleChange}
                  placeholder="Add comments..."
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4" style={{ borderTop: '1px solid #e5e5e5' }}>
              <Button variant="outline" onClick={onClose} disabled={loading} className="hover:bg-gray-50" style={{ borderColor: '#8d9499', color: '#012e64' }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="text-white" style={{ backgroundColor: '#012e64' }}>
                {loading ? "Updating..." : "Update Order"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
