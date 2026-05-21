"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react"
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
    unit_price: "",
    pm_type: "",
    discount: "",
  })
  const [productCodes, setProductCodes] = useState<ProductCode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [projectCheck, setProjectCheck] = useState<{
    status: "idle" | "checking" | "found" | "not_found" | "error"
    projectName?: string | null
  }>({ status: "idle" })

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

  // Debounced project_id existence check
  useEffect(() => {
    const trimmed = formData.project_id.trim()
    if (!trimmed) {
      setProjectCheck({ status: "idle" })
      return
    }

    setProjectCheck({ status: "checking" })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/projects/check?project_id=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          setProjectCheck({ status: "error" })
          return
        }
        const result = await response.json()
        setProjectCheck({
          status: result.exists ? "found" : "not_found",
          projectName: result.project?.project_name ?? null,
        })
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setProjectCheck({ status: "error" })
        }
      }
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [formData.project_id])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (projectCheck.status === "not_found") {
      setError("Project ID does not exist. Please enter a valid project.")
      return
    }
    if (projectCheck.status === "checking") {
      setError("Still verifying Project ID, please wait...")
      return
    }

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
      product_type: formData.product_type,
      unit_price: formData.unit_price ? Number.parseFloat(formData.unit_price) : null,
      pm_type: formData.pm_type || null,
      discount: formData.discount ? Number.parseFloat(formData.discount) : null,
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
                <div className="relative">
                  <Input
                    name="project_id"
                    value={formData.project_id}
                    onChange={handleChange}
                    required
                    placeholder="e.g., PROJ-001"
                    className="bg-white text-gray-900 pr-9"
                    style={{
                      borderColor:
                        projectCheck.status === "found"
                          ? "#16a34a"
                          : projectCheck.status === "not_found"
                          ? "#dc2626"
                          : "#8d9499",
                    }}
                    aria-invalid={projectCheck.status === "not_found"}
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                    {projectCheck.status === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#5d6b88' }} />
                    )}
                    {projectCheck.status === "found" && (
                      <CheckCircle2 className="w-4 h-4" style={{ color: '#16a34a' }} />
                    )}
                    {projectCheck.status === "not_found" && (
                      <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                    )}
                  </div>
                </div>
                {projectCheck.status === "found" && (
                  <p className="mt-1 text-xs" style={{ color: '#16a34a' }}>
                    Project found{projectCheck.projectName ? `: ${projectCheck.projectName}` : ""}
                  </p>
                )}
                {projectCheck.status === "not_found" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>
                    No project with this ID exists
                  </p>
                )}
                {projectCheck.status === "error" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>
                    Could not verify project ID
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Supplier</label>
                <select
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select supplier...</option>
                  <option value="Studio98">Studio98</option>
                  <option value="Khoa">Khoa</option>
                  <option value="Nhat">Nhat</option>
                  <option value="3D Sakura">3D Sakura</option>
                  <option value="Boris">Boris</option>
                </select>
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Product Type *</label>
                <select
                  name="product_type"
                  value={formData.product_type}
                  onChange={handleChange}
                  required
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
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>PM Type</label>
                <select
                  name="pm_type"
                  value={formData.pm_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
                  style={{ border: '1px solid #8d9499' }}
                >
                  <option value="">Select PM type...</option>
                  <option value="dedicated">Dedicated</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Discount</label>
                <Input
                  name="discount"
                  type="number"
                  step="0.01"
                  value={formData.discount}
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
