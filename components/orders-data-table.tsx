"use client"

import { Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const displayFields = [
  { key: "order_id", label: "Order ID", width: "min-w-[140px]" },
  { key: "client_rating", label: "Ranking", width: "min-w-[110px]" },
  { key: "company_name", label: "Company Name", width: "min-w-[180px]", maxWidth: "400px" },
  { key: "product_name", label: "Product Name", width: "min-w-[150px]" },
  { key: "quantity", label: "Quantity", width: "min-w-[100px]" },
  { key: "PM", label: "PM", width: "min-w-[100px]" },
  { key: "pm_type", label: "PM Type", width: "min-w-[120px]" },
  { key: "supplier", label: "Supplier", width: "min-w-[130px]" },
  { key: "cost", label: "Cost", width: "min-w-[110px]" },
  { key: "profit_margin", label: "Profit Margin", width: "min-w-[130px]" },
  { key: "net_sum", label: "Net Sum", width: "min-w-[110px]" },
  { key: "supplier_payment", label: "Supplier Payment", width: "min-w-[150px]" },
  { key: "deposit", label: "Deposit", width: "min-w-[100px]" },
  { key: "date_information_complete", label: "Date Info Complete", width: "min-w-[160px]" },
  { key: "due_delivery_date", label: "Due Delivery Date", width: "min-w-[150px]" },
  { key: "delivery_1_date", label: "delivery_1", width: "min-w-[130px]" },
  { key: "delivery_2_date", label: "delivery_2", width: "min-w-[130px]" },
  { key: "delivery_3_date", label: "delivery_3", width: "min-w-[130px]" },
  { key: "delivery_4_date", label: "delivery_4", width: "min-w-[130px]" },
  { key: "delivery_completion_date", label: "Date First Delivery Complete", width: "min-w-[210px]" },
  { key: "project_completion_date", label: "Date Project End", width: "min-w-[150px]" },
  { key: "delay_first_delivery", label: "Delay 1st Delivery", width: "min-w-[150px]" },
  { key: "delay_first_revision", label: "Delay 1st Revision", width: "min-w-[150px]" },
  { key: "delay_second_revision", label: "Delay 2nd Revision", width: "min-w-[150px]" },
  { key: "customer_name", label: "Customer Name", width: "min-w-[150px]" },
  { key: "customer_email", label: "Customer Email", width: "min-w-[180px]" },
  { key: "customer_type", label: "Customer Type", width: "min-w-[140px]" },
  { key: "comments", label: "Comments", width: "min-w-[20px]", maxWidth: "900px" },
  { key: "created_at", label: "Date Order Entry", width: "min-w-[150px]" },
]

export function OrdersDataTable({ orders, onEdit }: { orders: any[]; onEdit: (order: any) => void }) {
  const formatValue = (value: any, key: string, order?: any) => {
    if (key === "profit_margin") {
      if (order && (order.cost === 0 || order.cost === null)) return "100%"
      if (order && order.db_1 != null && order.net_sum != null && order.net_sum !== 0) {
        return `${(order.db_1 / order.net_sum * 100).toFixed(1)}%`
      }
      return "-"
    }

    if (value === null || value === undefined) return "-"

    if ((key.includes("date") || key === "created_at") && value) {
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return value
      }
    }

    if (["net_sum", "cost"].includes(key)) {
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
                      {formatValue(order[field.key], field.key, order)}
                    </div>
                  ) : formatValue(order[field.key], field.key, order)}
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
