"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle } from "lucide-react"

type EnumMap = Record<string, string[]>

const dateValue = (val: string | null | undefined) => (val ? val.split("T")[0] : "")

export function EditProjectDialog({
  project,
  onClose,
  onUpdate,
}: {
  project: any
  onClose: () => void
  onUpdate: (project: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState({ ...project })
  const [enums, setEnums] = useState<EnumMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Fetch enum values for dropdowns on mount
  useEffect(() => {
    const fetchEnums = async () => {
      try {
        const response = await fetch('/api/projects/enums')
        if (response.ok) {
          const result = await response.json()
          setEnums(result.enums || {})
        }
      } catch {
        // Dropdowns will just render empty if enums fail to load
      }
    }
    fetchEnums()
  }, [])

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

    // Only send the fields we want to update
    const updatedProject = {
      id: formData.id,
      project_name: formData.project_name || null,
      project_manager: formData.project_manager,
      pm_type: formData.pm_type || null,
      sales_person: formData.sales_person || null,
      client_contact_name: formData.client_contact_name || null,
      company_email: formData.company_email || null,
      client_rating: formData.client_rating || null,
      project_type: formData.project_type || null,
      construction_type: formData.construction_type || null,
      property_type: formData.property_type || null,
      project_status: formData.project_status || null,
      questionnaire_received: formData.questionnaire_received || null,
      deposit: formData.deposit || null,
      first_or_next_project: formData.first_or_next_project || null,
      order_confirmation_date: formData.order_confirmation_date || null,
      invoice_number: formData.invoice_number || null,
      invoice_date: formData.invoice_date || null,
      invoice_paid_date: formData.invoice_paid_date || null,
      partial_invoice: formData.partial_invoice || null,
      partial_invoice_paid_date: formData.partial_invoice_paid_date || null,
      delivery_completion_date: formData.delivery_completion_date || null,
      project_completion_date: formData.project_completion_date || null,
      path_to_files: formData.path_to_files || null,
    }

    const result = await onUpdate(updatedProject)
    setLoading(false)

    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  const renderEnumSelect = (name: string, label: string, enumName: string) => {
    const current = formData[name] || ""
    const options = enums[enumName] || []
    return (
      <div>
        <label className="text-sm font-medium" style={{ color: '#012e64' }}>{label}</label>
        <select
          name={name}
          value={current}
          onChange={handleChange}
          className="w-full px-3 py-2 rounded-md bg-white h-10"
          style={{ border: '1px solid #8d9499', color: '#012e64' }}
        >
          <option value="">Select...</option>
          {/* Keep the stored value selectable even if enums haven't loaded yet */}
          {current && !options.includes(current) && (
            <option value={current}>{current}</option>
          )}
          {options.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl" style={{ borderColor: '#e5e5e5' }}>
        <CardHeader className="flex flex-row items-center justify-between bg-white" style={{ borderBottom: '1px solid #e5e5e5' }}>
          <div>
            <CardTitle style={{ color: '#012e64' }}>Edit Project</CardTitle>
            <CardDescription style={{ color: '#5d6b88' }}>Project {project.project_id}</CardDescription>
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
                <Input name="project_id" value={formData.project_id} disabled className="bg-gray-50" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project Name</label>
                <Input name="project_name" value={formData.project_name || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project Manager *</label>
                <Input name="project_manager" value={formData.project_manager || ""} onChange={handleChange} required className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              {renderEnumSelect("pm_type", "PM Type", "pm_type")}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Sales Person</label>
                <Input name="sales_person" value={formData.sales_person || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client Contact Name</label>
                <Input name="client_contact_name" value={formData.client_contact_name || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Company Email</label>
                <Input name="company_email" type="email" value={formData.company_email || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client Rating</label>
                <Input name="client_rating" value={formData.client_rating || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              {renderEnumSelect("project_type", "Project Type", "project_type_values")}
              {renderEnumSelect("construction_type", "Construction Type", "construction_type_values")}
              {renderEnumSelect("property_type", "Property Type", "property_type_values")}
              {renderEnumSelect("project_status", "Project Status", "project_status_values")}
              {renderEnumSelect("questionnaire_received", "Questionnaire Received", "yes_no_values")}
              {renderEnumSelect("deposit", "Deposit", "yes_no_values")}
              {renderEnumSelect("first_or_next_project", "First/Next Project", "first_next_project")}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Path to Files</label>
                <Input name="path_to_files" value={formData.path_to_files || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>

              {/* Invoice Fields */}
              <div className="col-span-2">
                <h3 className="text-base font-semibold mb-3" style={{ color: '#012e64' }}>Invoicing</h3>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Invoice Number</label>
                <Input name="invoice_number" value={formData.invoice_number || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Invoice Date</label>
                <Input
                  name="invoice_date"
                  type="date"
                  value={dateValue(formData.invoice_date)}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Invoice Paid Date</label>
                <Input
                  name="invoice_paid_date"
                  type="date"
                  value={dateValue(formData.invoice_paid_date)}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Partial Invoice</label>
                <Input name="partial_invoice" value={formData.partial_invoice || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Partial Invoice Paid Date</label>
                <Input name="partial_invoice_paid_date" value={formData.partial_invoice_paid_date || ""} onChange={handleChange} className="bg-white" style={{ borderColor: '#8d9499', color: '#012e64' }} />
              </div>

              {/* Date Fields */}
              <div className="col-span-2">
                <h3 className="text-base font-semibold mb-3" style={{ color: '#012e64' }}>Dates</h3>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Confirmation Date</label>
                <Input
                  name="order_confirmation_date"
                  type="date"
                  value={dateValue(formData.order_confirmation_date)}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Date First Delivery Complete</label>
                <Input
                  name="delivery_completion_date"
                  type="date"
                  value={dateValue(formData.delivery_completion_date)}
                  onChange={handleChange}
                  className="bg-white"
                  style={{ borderColor: '#8d9499', color: '#012e64' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Date Project End</label>
                <Input
                  name="project_completion_date"
                  type="date"
                  value={dateValue(formData.project_completion_date)}
                  onChange={handleChange}
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
                {loading ? "Updating..." : "Update Project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
