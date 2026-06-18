"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { X, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react"

type EnumMap = Record<string, string[]>

type RefStatus = "idle" | "checking" | "found" | "not_found" | "error"

const dateValue = (val: string | null | undefined) => (val ? val.split("T")[0] : "")
const asString = (val: unknown) => (val === null || val === undefined ? "" : String(val))

export function EditProjectDialog({
  project,
  onClose,
  onUpdate,
}: {
  project: any
  onClose: () => void
  onUpdate: (project: any) => Promise<{ success: boolean; error?: string }>
}) {
  const [formData, setFormData] = useState({
    ...project,
    email_id: asString(project.email_id),
    client_id: asString(project.client_id),
  })
  const [enums, setEnums] = useState<EnumMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailCheck, setEmailCheck] = useState<{
    status: RefStatus
    companyEmail?: string | null
    companyName?: string | null
    personName?: string | null
    personCount?: number
  }>({ status: "idle" })
  const [clientCheck, setClientCheck] = useState<{
    status: RefStatus
    companyName?: string | null
    clientRating?: string | null
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

  // Debounced Email ID lookup (only after the user changes it from the stored value).
  useEffect(() => {
    const trimmed = asString(formData.email_id).trim()
    if (!trimmed || trimmed === asString(project.email_id)) {
      setEmailCheck({ status: "idle" })
      return
    }

    setEmailCheck({ status: "checking" })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/projects/email-check?email_id=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          setEmailCheck({ status: "error" })
          return
        }
        const result = await response.json()
        if (!result.exists) {
          setEmailCheck({ status: "not_found" })
          return
        }
        setEmailCheck({
          status: "found",
          companyEmail: result.email?.company_email ?? null,
          companyName: result.email?.company_name ?? null,
          personName: result.person?.person_addressing ?? null,
          personCount: result.personCount ?? 0,
        })
        if (result.email?.client_id != null) {
          setFormData((prev: any) => ({ ...prev, client_id: String(result.email.client_id) }))
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setEmailCheck({ status: "error" })
        }
      }
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [formData.email_id, project.email_id])

  // Debounced Client ID lookup (only after the user changes it from the stored value).
  useEffect(() => {
    const trimmed = asString(formData.client_id).trim()
    if (!trimmed || trimmed === asString(project.client_id)) {
      setClientCheck({ status: "idle" })
      return
    }

    setClientCheck({ status: "checking" })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/projects/client-check?client_id=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          setClientCheck({ status: "error" })
          return
        }
        const result = await response.json()
        setClientCheck({
          status: result.exists ? "found" : "not_found",
          companyName: result.company?.company_name ?? null,
          clientRating: result.company?.client_rating ?? null,
        })
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setClientCheck({ status: "error" })
        }
      }
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [formData.client_id, project.client_id])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (emailCheck.status === "checking" || clientCheck.status === "checking") {
      setError("Still verifying entries, please wait...")
      return
    }
    if (emailCheck.status === "not_found") {
      setError("Email ID does not match any record. Restore it or enter a valid one.")
      return
    }
    if (clientCheck.status === "not_found") {
      setError("Client ID does not match any company. Restore it or enter a valid one.")
      return
    }

    setLoading(true)
    setError("")

    const emailIdStr = asString(formData.email_id).trim()
    const clientIdStr = asString(formData.client_id).trim()

    // Only send the fields we want to update
    const updatedProject: Record<string, any> = {
      id: formData.id,
      project_name: formData.project_name || null,
      project_manager: formData.project_manager,
      pm_type: formData.pm_type || null,
      sales_person: formData.sales_person || null,
      email_id: emailIdStr ? Number(emailIdStr) : null,
      client_id: clientIdStr ? Number(clientIdStr) : null,
      project_type: formData.project_type || null,
      construction_type: formData.construction_type || null,
      property_type: formData.property_type || null,
      project_status: formData.project_status || null,
      questionnaire_received: formData.questionnaire_received || null,
      deposit: formData.deposit || null,
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
    // If the email link changed, re-derive the company email / contact from it.
    if (emailCheck.status === "found") {
      updatedProject.company_email = emailCheck.companyEmail || null
      updatedProject.client_contact_name = emailCheck.personName || null
    }
    // client_rating and person_id are derived by DB triggers.

    const result = await onUpdate(updatedProject)
    setLoading(false)

    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  const renderEnumSelect = (name: string, label: string, enumName: string, required = false) => {
    const current = formData[name] || ""
    const options = enums[enumName] || []
    return (
      <div>
        <label className="text-sm font-medium" style={{ color: '#012e64' }}>{label}</label>
        <select
          name={name}
          value={current}
          onChange={handleChange}
          required={required}
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

  const refBorderColor = (status: RefStatus) =>
    status === "found" ? "#16a34a" : status === "not_found" ? "#dc2626" : "#8d9499"

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

              {/* Email ID — links the project to a company + contact. Drives person_id. */}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Email ID</label>
                <div className="relative">
                  <Input
                    name="email_id"
                    type="number"
                    value={formData.email_id}
                    onChange={handleChange}
                    placeholder="Contact email record ID"
                    className="bg-white text-gray-900 pr-9"
                    style={{ borderColor: refBorderColor(emailCheck.status) }}
                    aria-invalid={emailCheck.status === "not_found"}
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                    {emailCheck.status === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#5d6b88' }} />
                    )}
                    {emailCheck.status === "found" && (
                      <CheckCircle2 className="w-4 h-4" style={{ color: '#16a34a' }} />
                    )}
                    {emailCheck.status === "not_found" && (
                      <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                    )}
                  </div>
                </div>
                {emailCheck.status === "found" && (
                  <p className="mt-1 text-xs" style={{ color: '#16a34a' }}>
                    {emailCheck.companyEmail}
                    {emailCheck.companyName ? ` — ${emailCheck.companyName}` : ""}
                    {emailCheck.personCount === 1 && emailCheck.personName
                      ? ` (contact: ${emailCheck.personName})`
                      : ` (${emailCheck.personCount} contacts — Person ID stays empty)`}
                  </p>
                )}
                {emailCheck.status === "not_found" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>No email record with this ID</p>
                )}
              </div>

              {/* Client ID — drives the derived client_rating. */}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Client ID</label>
                <div className="relative">
                  <Input
                    name="client_id"
                    type="number"
                    value={formData.client_id}
                    onChange={handleChange}
                    placeholder="e.g., 12345"
                    className="bg-white text-gray-900 pr-9"
                    style={{ borderColor: refBorderColor(clientCheck.status) }}
                    aria-invalid={clientCheck.status === "not_found"}
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                    {clientCheck.status === "checking" && (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#5d6b88' }} />
                    )}
                    {clientCheck.status === "found" && (
                      <CheckCircle2 className="w-4 h-4" style={{ color: '#16a34a' }} />
                    )}
                    {clientCheck.status === "not_found" && (
                      <XCircle className="w-4 h-4" style={{ color: '#dc2626' }} />
                    )}
                  </div>
                </div>
                {clientCheck.status === "found" && (
                  <p className="mt-1 text-xs" style={{ color: '#16a34a' }}>
                    {clientCheck.companyName}
                    {clientCheck.clientRating ? ` — rating ${clientCheck.clientRating}` : " — no rating set"}
                  </p>
                )}
                {clientCheck.status === "not_found" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>No company with this Client ID</p>
                )}
              </div>

              {renderEnumSelect("project_manager", "Project Manager *", "project_manager", true)}
              {renderEnumSelect("pm_type", "PM Type", "pm_type")}
              {renderEnumSelect("sales_person", "Sales Person", "sales_person")}
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
