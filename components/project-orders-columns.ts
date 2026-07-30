import type { DisplayField } from "@/components/orders-data-table"

/**
 * Columns shown for `project_orders_view` (projects left-joined to all_orders).
 * Project context comes first, then delivery dates, then the order and its
 * financials, then invoicing and metadata.
 *
 * The view's surrogate keys (id/order_pk/client_id/email_id/person_id) are
 * intentionally not displayed — they carry no meaning for reporting. They are
 * still present in the API response, so CSV exports include them.
 */
export const projectOrdersFields: DisplayField[] = [
  // Project
  { key: "project_id", label: "Project ID", width: "min-w-[130px]" },
  { key: "project_name", label: "Project Name", width: "min-w-[220px]", maxWidth: "400px" },
  { key: "project_status", label: "Project Status", width: "min-w-[140px]" },
  { key: "company_name", label: "Company Name", width: "min-w-[180px]", maxWidth: "400px" },
  { key: "client_contact_name", label: "Client Contact", width: "min-w-[160px]" },
  { key: "company_email", label: "Company Email", width: "min-w-[190px]", maxWidth: "300px" },
  { key: "client_rating", label: "Ranking", width: "min-w-[110px]" },
  { key: "project_manager", label: "Project Manager", width: "min-w-[150px]" },
  { key: "PM", label: "PM", width: "min-w-[100px]" },
  { key: "pm_type", label: "PM Type", width: "min-w-[120px]" },
  { key: "sales_person", label: "Sales Person", width: "min-w-[130px]" },
  { key: "project_type", label: "Project Type", width: "min-w-[130px]" },
  { key: "construction_type", label: "Construction Type", width: "min-w-[160px]" },
  { key: "property_type", label: "Property Type", width: "min-w-[140px]" },
  { key: "first_or_next_project", label: "First / Next Project", width: "min-w-[160px]" },
  { key: "questionnaire_received", label: "Questionnaire Received", width: "min-w-[190px]" },

  // Dates
  { key: "order_confirmation_date", label: "Order Confirmation Date", width: "min-w-[190px]" },
  { key: "date_information_complete", label: "Date Info Complete", width: "min-w-[160px]" },
  { key: "due_delivery_date", label: "Due Delivery Date", width: "min-w-[150px]" },
  { key: "delivery_1_date", label: "delivery_1", width: "min-w-[130px]" },
  { key: "delivery_2_date", label: "delivery_2", width: "min-w-[130px]" },
  { key: "delivery_3_date", label: "delivery_3", width: "min-w-[130px]" },
  { key: "delivery_4_date", label: "delivery_4", width: "min-w-[130px]" },
  { key: "delivery_completion_date", label: "Delivery Completion Date", width: "min-w-[200px]" },
  { key: "project_completion_date", label: "Date Project End", width: "min-w-[150px]" },
  { key: "delay_first_delivery", label: "Delay 1st Delivery", width: "min-w-[150px]" },
  { key: "delay_first_revision", label: "Delay 1st Revision", width: "min-w-[150px]" },
  { key: "delay_second_revision", label: "Delay 2nd Revision", width: "min-w-[150px]" },

  // Order
  { key: "order_id", label: "Order ID", width: "min-w-[140px]" },
  { key: "order_number", label: "Order Number", width: "min-w-[140px]" },
  { key: "product", label: "Product", width: "min-w-[160px]" },
  { key: "product_name", label: "Product Name", width: "min-w-[150px]" },
  { key: "product_type", label: "Product Type", width: "min-w-[130px]" },
  { key: "order_type", label: "Order Type", width: "min-w-[120px]" },
  { key: "sale_type", label: "Sale Type", width: "min-w-[120px]" },
  { key: "quantity", label: "Quantity", width: "min-w-[100px]" },
  { key: "unit_price", label: "Unit Price", width: "min-w-[120px]" },
  { key: "supplier", label: "Supplier", width: "min-w-[130px]" },
  { key: "supplier_payment", label: "Supplier Payment", width: "min-w-[150px]" },

  // Financials
  { key: "cost", label: "Cost", width: "min-w-[110px]" },
  { key: "net_sum", label: "Net Sum", width: "min-w-[110px]" },
  { key: "gross_sum", label: "Gross Sum", width: "min-w-[120px]" },
  { key: "db_1", label: "DB 1", width: "min-w-[110px]" },
  { key: "profit_margin", label: "Profit Margin", width: "min-w-[130px]" },
  { key: "roi", label: "ROI", width: "min-w-[100px]" },
  { key: "discount", label: "Discount", width: "min-w-[110px]" },
  { key: "deposit", label: "Deposit", width: "min-w-[100px]" },

  // Invoicing
  { key: "invoice_number", label: "Invoice Number", width: "min-w-[160px]" },
  { key: "invoice_date", label: "Invoice Date", width: "min-w-[130px]" },
  { key: "invoice_paid_date", label: "Invoice Paid Date", width: "min-w-[150px]" },
  { key: "partial_invoice", label: "Partial Invoice", width: "min-w-[160px]" },
  { key: "partial_invoice_paid_date", label: "Partial Invoice Paid", width: "min-w-[170px]" },
  { key: "ap_epcs_invoicing", label: "AP/EPCS Invoicing", width: "min-w-[160px]" },

  // Metadata
  { key: "click_up_task_link", label: "ClickUp Task", width: "min-w-[150px]", maxWidth: "300px" },
  { key: "path_to_files", label: "Path to Files", width: "min-w-[150px]", maxWidth: "300px" },
  { key: "comments", label: "Comments", width: "min-w-[20px]", maxWidth: "900px" },
  { key: "created_at", label: "Created", width: "min-w-[130px]" },
  { key: "updated_at", label: "Updated", width: "min-w-[130px]" },
]
