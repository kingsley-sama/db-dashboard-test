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
    email_id: "",
    client_id: "",
    project_type: "",
    construction_type: "",
    property_type: "",
    project_status: "",
    questionnaire_received: "",
    deposit: "",
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

  // Debounced Email ID lookup. Resolves the company + linked person; person_id and
  // first/next are auto-filled server-side by triggers from this email.
  useEffect(() => {
    const trimmed = formData.email_id.trim()
    if (!trimmed) {
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
        // Auto-suggest the Client ID from the email's company when not set yet.
        if (result.email?.client_id != null) {
          setFormData((prev) =>
            prev.client_id.trim() ? prev : { ...prev, client_id: String(result.email.client_id) }
          )
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
  }, [formData.email_id])

  // Debounced Client ID lookup. client_rating is derived from this server-side.
  useEffect(() => {
    const trimmed = formData.client_id.trim()
    if (!trimmed) {
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
  }, [formData.client_id])

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
    if (projectCheck.status === "checking" || emailCheck.status === "checking" || clientCheck.status === "checking") {
      setError("Still verifying entries, please wait...")
      return
    }
    if (emailCheck.status !== "found") {
      setError("Please enter a valid Email ID — it links the project to a company and contact.")
      return
    }
    if (formData.client_id.trim() && clientCheck.status === "not_found") {
      setError("Client ID does not match any company. Clear it or enter a valid one.")
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
      email_id: Number(formData.email_id),
      client_id: formData.client_id.trim() ? Number(formData.client_id) : null,
      // Derived from the linked email/person rather than typed by the user.
      company_email: emailCheck.companyEmail || null,
      client_contact_name: emailCheck.personName || null,
      project_type: formData.project_type || null,
      construction_type: formData.construction_type || null,
      property_type: formData.property_type || null,
      project_status: formData.project_status || null,
      questionnaire_received: formData.questionnaire_received || null,
      deposit: formData.deposit || null,
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
    // person_id, client_rating and first_or_next_project are filled by DB triggers.

    const result = await onCreate(newProject)
    setLoading(false)

    if (!result.success && result.error) {
      setError(result.error)
    }
  }

  const renderEnumSelect = (
    name: keyof typeof formData,
    label: string,
    enumName: string,
    required = false
  ) => (
    <div>
      <label className="text-sm font-medium" style={{ color: '#012e64' }}>{label}</label>
      <select
        name={name}
        value={formData[name]}
        onChange={handleChange}
        required={required}
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

  const refBorderColor = (status: RefStatus) =>
    status === "found" ? "#16a34a" : status === "not_found" ? "#dc2626" : "#8d9499"

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

              {/* Email ID — links the project to a company + contact. Drives person_id. */}
              <div>
                <label className="text-sm font-medium" style={{ color: '#012e64' }}>Email ID *</label>
                <div className="relative">
                  <Input
                    name="email_id"
                    type="number"
                    value={formData.email_id}
                    onChange={handleChange}
                    required
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
                      : emailCheck.personCount === 0
                      ? " (no linked contact — Person ID stays empty)"
                      : ` (${emailCheck.personCount} contacts — Person ID stays empty)`}
                  </p>
                )}
                {emailCheck.status === "not_found" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>No email record with this ID</p>
                )}
                {emailCheck.status === "error" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>Could not verify email ID</p>
                )}
              </div>

              {/* Client ID — drives the derived client_rating. Auto-suggested from the email. */}
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
                {clientCheck.status === "error" && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>Could not verify client ID</p>
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
