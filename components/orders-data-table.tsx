"use client"

import { Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const displayFields = [
  // User-specified column order
  { key: "person_id", label: "Customer Number", width: "min-w-[140px]" },
  { key: "client_rating", label: "Customer Ranking", width: "min-w-[150px]" },
  { key: "company_name", label: "Name", width: "min-w-[150px]", maxWidth: "400px" },
  { key: "project_name", label: "Project Name", width: "min-w-[150px]", maxWidth: "400px" },
  { key: "created_at", label: "Date Order Created", width: "min-w-[160px]" },
  { key: "PM", label: "PM", width: "min-w-[100px]" },
  { key: "questionnaire_received", label: "Questionnaire", width: "min-w-[130px]" },
  { key: "deposit", label: "Deposit", width: "min-w-[100px]" },
  { key: "supplier", label: "Supplier", width: "min-w-[150px]" },
  { key: "order_id", label: "Order ID", width: "min-w-[120px]" },
  { key: "cost", label: "Cost", width: "min-w-[120px]" },
  { key: "db_1", label: "DB 1 Margin", width: "min-w-[120px]" },
  { key: "date_information_complete", label: "Date Entry Final Docs", width: "min-w-[170px]" },
  { key: "due_delivery_date", label: "Due Delivery Date", width: "min-w-[150px]" },
  { key: "delivery_1_date", label: "Delivery Date 1", width: "min-w-[140px]" },
  { key: "delivery_2_date", label: "Delivery Date 2", width: "min-w-[140px]" },
  { key: "delivery_3_date", label: "Delivery Date 3", width: "min-w-[140px]" },
  { key: "delivery_4_date", label: "Delivery Date 4", width: "min-w-[140px]" },
  { key: "delivery_completion_date", label: "Date Delivery Complete", width: "min-w-[180px]" },
  { key: "net_sum", label: "Net Revenue", width: "min-w-[120px]" },
  // Remaining fields
  { key: "project_id", label: "Project ID", width: "min-w-[120px]" },
  { key: "order_number", label: "Order Number", width: "min-w-[140px]" },
  { key: "product_name", label: "Product Name", width: "min-w-[150px]" },
  { key: "comments", label: "Comments", width: "min-w-[20px]", maxWidth: "900px" },
  { key: "product", label: "Product", width: "min-w-[120px]" },
  { key: "product_type", label: "Product Type", width: "min-w-[120px]" },
  { key: "order_type", label: "Order Type", width: "min-w-[120px]" },
  { key: "sale_type", label: "Sale Type", width: "min-w-[120px]" },
  { key: "quantity", label: "Quantity", width: "min-w-[100px]" },
  { key: "unit_price", label: "Unit Price", width: "min-w-[120px]" },
  { key: "gross_sum", label: "Gross Sum", width: "min-w-[120px]" },
  { key: "profit_margin", label: "Profit Margin", width: "min-w-[130px]" },
  { key: "roi", label: "ROI", width: "min-w-[100px]" },
  { key: "ap_epcs_invoicing", label: "AP EPCS Invoicing", width: "min-w-[150px]" },
  { key: "delay_first_delivery", label: "Delay 1st Delivery", width: "min-w-[150px]" },
  { key: "delay_first_revision", label: "Delay 1st Revision", width: "min-w-[150px]" },
  { key: "delay_second_revision", label: "Delay 2nd Revision", width: "min-w-[150px]" },
  { key: "updated_at", label: "Updated At", width: "min-w-[160px]" },
]

export function OrdersDataTable({ orders, onEdit }: { orders: any[]; onEdit: (order: any) => void }) {
  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined) return "-"
    
    if ((key.includes("date") || key === "created_at" || key === "updated_at") && value) {
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return value
      }
    }
    
    if (["net_sum", "gross_sum", "db_1", "profit_margin", "roi", "unit_price", "cost"].includes(key)) {
      return typeof value === "number" ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value
    }
    
    if (["delay_first_delivery", "delay_first_revision", "delay_second_revision"].includes(key)) {
      return `${value} days`
    }
    
    return value
  }

  return (
    <div className="h-full overflow-auto relative border-t" style={{ borderColor: '#e5e5e5' }}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10" style={{ backgroundColor: '#f8f8f8' }}>
          <tr style={{ borderBottom: '2px solid #e5e5e5' }}>
            {displayFields.map((field) => (
              <th
                key={field.key}
                className={`${field.width} px-4 py-3 text-left font-semibold whitespace-nowrap`}
                style={{ color: '#012e64', borderRight: '1px solid #e5e5e5' }}
              >
                {field.label}
              </th>
            ))}
            <th 
              className="min-w-[80px] px-4 py-3 text-center font-semibold sticky right-0 z-20" 
              style={{ backgroundColor: '#f8f8f8', color: '#012e64', borderLeft: '2px solid #e5e5e5' }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => (
            <tr
              key={order.id}
              className="hover:bg-blue-50 transition-colors"
              style={{ 
                borderBottom: '1px solid #e5e5e5', 
                backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa' 
              }}
            >
              {displayFields.map((field) => (
                <td 
                  key={field.key} 
                  className={`${field.width} px-4 py-3 whitespace-nowrap`} 
                  style={{ color: '#012e64', borderRight: '1px solid #f0f0f0' }}
                  title={String(order[field.key] || '')}
                >
                  {field.maxWidth ? (
                    <div style={{ maxWidth: field.maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatValue(order[field.key], field.key)}
                    </div>
                  ) : formatValue(order[field.key], field.key)}
                </td>
              ))}
              <td 
                className="min-w-[80px] px-4 py-3 sticky right-0 z-10 text-center" 
                style={{ 
                  backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                  borderLeft: '2px solid #e5e5e5'
                }}
              >
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => onEdit(order)} 
                  className="h-8 w-8 p-0 hover:bg-blue-100" 
                  style={{ color: '#012e64' }}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">No orders found</p>
        </div>
      )}
    </div>
  )
}
