"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

interface ProductCode {
  id: number
  name: string
  abbreviation: string
}

export function CreateOrderDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (order: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState({
    project_id: "",
    supplier: "",
    cost: "",
    product_name: "",
    comments: "",
    order_type: "",
    quantity: "",
    product_type: "",
    sale_type: "",
    unit_price: "",
    order_number: "",
    ap_epcs_invoicing: "",
    company_name: "",
    client_rating: "",
    questionnaire_received: "",
    deposit: "",
    PM: "",
    db_1: "",
    net_sum: "",
  })
  const [productCodes, setProductCodes] = useState<ProductCode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [loadingProducts, setLoadingProducts] = useState(true)

  // Fetch product codes on mount
  useEffect(() => {
    const fetchProductCodes = async () => {
      try {
        const response = await fetch('/api/product-codes')
        if (response.ok) {
          const result = await response.json()
          setProductCodes(result.data || [])
        } else {
          setError('Failed to load product codes')
        }
      } catch (err) {
        setError('Failed to load product codes')
      } finally {
        setLoadingProducts(false)
      }
    }
    fetchProductCodes()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
      project_id: formData.project_id,
      supplier: formData.supplier || null,
      cost: formData.cost ? Number.parseFloat(formData.cost) : null,
      product_name: formData.product_name || null,
      comments: formData.comments || null,
      order_type: formData.order_type || null,
      quantity: formData.quantity ? Number.parseInt(formData.quantity) : null,
      product_type: formData.product_type || null,
      sale_type: formData.sale_type || null,
      unit_price: formData.unit_price ? Number.parseFloat(formData.unit_price) : null,
      order_number: formData.order_number || null,
      ap_epcs_invoicing: formData.ap_epcs_invoicing || null,
      company_name: formData.company_name || null,
      client_rating: formData.client_rating || null,
      questionnaire_received: formData.questionnaire_received || null,
      deposit: formData.deposit || null,
      PM: formData.PM || null,
      db_1: formData.db_1 ? Number.parseFloat(formData.db_1) : null,
      net_sum: formData.net_sum ? Number.parseFloat(formData.net_sum) : null,
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Supplier</label>
                <Input
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleChange}
                  placeholder="Supplier name"
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Name</label>
                <select
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleChange}
                  disabled={loadingProducts}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select a product...</option>
                  {productCodes.map((product) => (
                    <option key={product.id} value={product.name}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Type</label>
                <select
                  name="order_type"
                  value={formData.order_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select order type...</option>
                  <option value="Standard">Standard</option>
                  <option value="Internal">Internal</option>
                  <option value="Free of Charge">Free of Charge</option>
                  <option value="Express">Express</option>
                  <option value="Revision">Revision</option>
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Unit Price</label>
                <Input
                  name="unit_price"
                  type="number"
                  step="0.01"
                  value={formData.unit_price}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Type</label>
                <select
                  name="product_type"
                  value={formData.product_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select type...</option>
                  <option value="Standard">Standard</option>
                  <option value="Variation">Variation</option>
                  <option value="Revision">Revision</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Sale Type</label>
                <select
                  name="sale_type"
                  value={formData.sale_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select type...</option>
                  <option value="Standard">Standard</option>
                  <option value="PM Upsell">PM Upsell</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Number</label>
                <Input
                  name="order_number"
                  value={formData.order_number}
                  onChange={handleChange}
                  placeholder="Order number"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>AP/EPCS Invoicing</label>
                <Input
                  name="ap_epcs_invoicing"
                  value={formData.ap_epcs_invoicing}
                  onChange={handleChange}
                  placeholder="Invoicing info"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Company Name</label>
                <Input
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  placeholder="Company name"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client Rating</label>
                <select
                  name="client_rating"
                  value={formData.client_rating}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select rating...</option>
                  <option value="15 - P">15 - P</option>
                  <option value="14 - PU">14 - PU</option>
                  <option value="13 - PULS">13 - PULS</option>
                  <option value="12 - PUS">12 - PUS</option>
                  <option value="11 - PUL">11 - PUL</option>
                  <option value="10 - ULS">10 - ULS</option>
                  <option value="9 - US">9 - US</option>
                  <option value="8 - U">8 - U</option>
                  <option value="7 - UL">7 - UL</option>
                  <option value="6 - PLS">6 - PLS</option>
                  <option value="5 - PS">5 - PS</option>
                  <option value="4 - PL">4 - PL</option>
                  <option value="3 - LS">3 - LS</option>
                  <option value="2 - S">2 - S</option>
                  <option value="1 - L">1 - L</option>
                  <option value="0">0</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Questionnaire Received</label>
                <select
                  name="questionnaire_received"
                  value={formData.questionnaire_received}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Deposit</label>
                <select
                  name="deposit"
                  value={formData.deposit}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project Manager (PM)</label>
                <select
                  name="PM"
                  value={formData.PM}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select PM...</option>
                  <option value="Viktoria">Viktoria</option>
                  <option value="Sonia">Sonia</option>
                  <option value="Vivien">Vivien</option>
                  <option value="Nesrin">Nesrin</option>
                  <option value="Ani">Ani</option>
                  <option value="Viktoria & Sonia">Viktoria & Sonia</option>
                  <option value="Viktoria und Vivien">Viktoria und Vivien</option>
                  <option value="Sonia und Vivien">Sonia und Vivien</option>
                  <option value="Sonia & CH">Sonia & CH</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>DB Margin (db_1)</label>
                <Input
                  name="db_1"
                  type="number"
                  step="0.01"
                  value={formData.db_1}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Net Revenue (net_sum)</label>
                <Input
                  name="net_sum"
                  type="number"
                  step="0.01"
                  value={formData.net_sum}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Comments</label>
                <Textarea
                  name="comments"
                  value={formData.comments}
                  onChange={handleChange}
                  placeholder="Add any additional comments..."
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                  rows={3}
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
