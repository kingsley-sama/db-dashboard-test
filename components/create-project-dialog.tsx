"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react"

type EnumMap = Record<string, string[]>

export function CreateProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (project: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState({
    project_id: "",
    project_name: "",
    project_manager: "",
    pm_type: "",
    sales_person: "",
    client_contact_name: "",
    company_email: "",
    client_rating: "",
    project_type: "",
    construction_type: "",
    property_type: "",
    project_status: "",
    questionnaire_received: "",
    deposit: "",
    first_or_next_project: "",
    order_confirmation_date: "",
    invoice_number: "",
    invoice_date: "",
    path_to_files: "",
  })
  const [enums, setEnums] = useState<EnumMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [projectCheck, setProjectCheck] = useState<{
    status: "idle" | "checking" | "available" | "taken" | "error"
    projectName?: string | null
  }>({ status: "idle" })

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

  // Debounced project_id uniqueness check (must NOT already exist)
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
          status: result.exists ? "taken" : "available",
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (projectCheck.status === "taken") {
      setError("A project with this ID already exists. Please use a unique Project ID.")
      return
    }
    if (projectCheck.status === "checking") {
      setError("Still verifying Project ID, please wait...")
      return
    }

    setLoading(true)
    setError("")

    const newProject: Record<string, any> = {
      project_id: formData.project_id.trim(),
      project_manager: formData.project_manager,
      project_name: formData.project_name || null,
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
      invoice_date: formData.invoice_date || null,
      path_to_files: formData.path_to_files || null,
    }
    // Leave DB defaults intact when these are not provided
    if (formData.order_confirmation_date) {
      newProject.order_confirmation_date = formData.order_confirmation_date
    }
    if (formData.invoice_number) {
      newProject.invoice_number = formData.invoice_number
    }

    const result = await onCreate(newProject)
    setLoading(false)

    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  const renderEnumSelect = (name: keyof typeof formData, label: string, enumName: string) => (
    <div>
      <label className="text-sm font-medium" style={{ color: '#012e64' }}>{label}</label>
      <select
        name={name}
        value={formData[name]}
        onChange={handleChange}
        className="w-full px-3 py-2 rounded-md bg-white text-gray-900 h-10"
        style={{ border: '1px solid #8d9499' }}
      >
        <option value="">Select...</option>
        {(enums[enumName] || []).map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white shadow-2xl" style={{ borderColor: '#e5e5e5' }}>
        <CardHeader className="flex flex-row items-center justify-between bg-white" style={{ borderBottom: '1px solid #e5e5e5' }}>
          <div>
            <CardTitle style={{ color: '#012e64' }}>Create New Project</CardTitle>
            <CardDescription style={{ color: '#5d6b88' }}>Add a new project to the system</CardDescription>
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
                        projectCheck.status === "available"
                          ? "#16a34a"
                          : projectCheck.status === "taken"
                          ? "#dc2626"
                          : "#8d9499",
                    }}
                    aria-invalid={projectCheck.status === "taken"}
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                    {projectCheck.status === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#5d6b88' }} />
                    )}
                    {projectCheck.status === "available" && (
                      <CheckCircle2 className="w-4 h-4" style={{ color: '#16a34a' }} />
                    )}
                    {projectCheck.status === "taken" && (
                      <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                    )}
                  </div>
                </div>
                {projectCheck.status === "available" && (
                  <p className="mt-1 text-xs" style={{ color: '#16a34a' }}>
                    Project ID is available
                  </p>
                )}
                {projectCheck.status === "taken" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>
                    A project with this ID already exists{projectCheck.projectName ? `: ${projectCheck.projectName}` : ""}
                  </p>
                )}
                {projectCheck.status === "error" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>
                    Could not verify project ID
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project Name</label>
                <Input name="project_name" value={formData.project_name} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Project Manager *</label>
                <Input name="project_manager" value={formData.project_manager} onChange={handleChange} required className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              {renderEnumSelect("pm_type", "PM Type", "pm_type")}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Sales Person</label>
                <Input name="sales_person" value={formData.sales_person} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client Contact Name</label>
                <Input name="client_contact_name" value={formData.client_contact_name} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Company Email</label>
                <Input name="company_email" type="email" value={formData.company_email} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client Rating</label>
                <Input name="client_rating" value={formData.client_rating} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              {renderEnumSelect("project_type", "Project Type", "project_type_values")}
              {renderEnumSelect("construction_type", "Construction Type", "construction_type_values")}
              {renderEnumSelect("property_type", "Property Type", "property_type_values")}
              {renderEnumSelect("project_status", "Project Status", "project_status_values")}
              {renderEnumSelect("questionnaire_received", "Questionnaire Received", "yes_no_values")}
              {renderEnumSelect("deposit", "Deposit", "yes_no_values")}
              {renderEnumSelect("first_or_next_project", "First/Next Project", "first_next_project")}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Order Confirmation Date</label>
                <Input
                  name="order_confirmation_date"
                  type="date"
                  value={formData.order_confirmation_date}
                  onChange={handleChange}
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Invoice Number</label>
                <Input name="invoice_number" value={formData.invoice_number} onChange={handleChange} placeholder="RE nicht erstellt" className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Invoice Date</label>
                <Input
                  name="invoice_date"
                  type="date"
                  value={formData.invoice_date}
                  onChange={handleChange}
                  className="bg-white text-gray-900"
                  style={{ borderColor: '#8d9499' }}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Path to Files</label>
                <Input name="path_to_files" value={formData.path_to_files} onChange={handleChange} className="bg-white text-gray-900" style={{ borderColor: '#8d9499' }} />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4" style={{ borderTop: '1px solid #e5e5e5' }}>
              <Button variant="outline" onClick={onClose} disabled={loading} className="hover:bg-gray-50" style={{ borderColor: '#8d9499', color: '#012e64' }}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="text-white" style={{ backgroundColor: '#012e64' }}>
                {loading ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
