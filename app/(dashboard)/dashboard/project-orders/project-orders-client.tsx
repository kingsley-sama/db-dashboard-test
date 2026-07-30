'use client'

import { OrdersTable } from '@/components/orders-table'
import { projectOrdersFields } from '@/components/project-orders-columns'
import { Lock } from 'lucide-react'

export function ProjectOrdersClient() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Project Orders</h1>
        <p className="text-gray-500 mt-1">
          Every order with its project context, from the <code>project_orders_view</code> database
          view. Read-only — edit records under Orders or Projects.
        </p>
      </div>

      <div
        className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg"
        style={{ backgroundColor: '#f0f7ff', border: '1px solid #d0e7ff', color: '#5d6b88' }}
      >
        <Lock className="w-4 h-4 shrink-0" style={{ color: '#012e64' }} />
        <span>
          One row per order. Projects with several orders repeat their project details on each row;
          a project with no orders shows empty order columns.
        </span>
      </div>

      <div className="min-h-[500px]">
        <OrdersTable
          apiPath="/api/project-orders"
          fields={projectOrdersFields}
          enableCreate={false}
          enableActions={false}
          noun="project orders"
          searchPlaceholder="Search by project, project name, order ID, product, supplier, company, invoice, PM, or sales person..."
        />
      </div>
    </div>
  )
}
