'use client'

import { OrdersTable, type InlineEditConfig } from '@/components/orders-table'
import { projectOrdersFields } from '@/components/project-orders-columns'
import { readJsonResponse } from '@/lib/table-utils'
import { PROJECT_ORDER_EDITABLE_FIELDS } from '@/lib/project-order-edits'
import { Info, Lock, Pencil } from 'lucide-react'

/**
 * Writes one edited cell back to the project behind the row.
 *
 * The view is read-only, so the update goes to the underlying `projects` row,
 * addressed by the `project_pk` the API hands back with every row. Rejecting is
 * how the table learns the save failed — it reverts the row and keeps the cell
 * open, so a failed edit is never left looking saved.
 */
const saveProjectOrderField: InlineEditConfig['save'] = async (row, key, value) => {
  if (!row?.project_pk) {
    throw new Error('This row has no project to save against')
  }
  const response = await fetch(`/api/project-orders/${row.project_pk}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  })
  const result = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(result.error || `Failed to save ${key}`)
  }
}

const invoiceNumberHint =
  'Stored on the project, so it applies to every order row of that project'

export function ProjectOrdersClient({ canEdit = false }: { canEdit?: boolean }) {
  const inlineEdit: InlineEditConfig | undefined = canEdit
    ? {
        fields: Object.keys(PROJECT_ORDER_EDITABLE_FIELDS),
        save: saveProjectOrderField,
        // One invoice number is stored per project and shown on each of its
        // order rows, so an edit has to land on all of them at once.
        appliesTo: (edited, candidate) => candidate.project_pk === edited.project_pk,
        hints: { invoice_number: invoiceNumberHint },
      }
    : undefined

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Project Orders</h1>
        <p className="text-gray-500 mt-1">
          Every order with its project context, from the <code>project_orders_view</code> database
          view. Filter it down to the orders you need, then edit them here.
        </p>
      </div>

      <div
        className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg"
        style={{ backgroundColor: '#f0f7ff', border: '1px solid #d0e7ff', color: '#5d6b88' }}
      >
        <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
        <span>
          One row per order. Projects with several orders repeat their project details on each row;
          a project with no orders shows empty order columns. Other fields are edited under Orders
          or Projects.
        </span>
      </div>

      <div
        className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg"
        style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#5d6b88' }}
      >
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
        <span>
          Every column header carries an operator — <strong>contains</strong>, <strong>is</strong>,{' '}
          <strong>is not</strong>, <strong>is populated</strong>, <strong>is blank</strong>, and
          before/after/between on dates. Stack as many as you need; each active condition appears as
          a chip above the table and can be removed on its own.
          {canEdit && (
            <>
              {' '}
              <Pencil className="w-3.5 h-3.5 inline-block align-text-bottom" />{' '}
              <strong>Invoice Number</strong> is editable in place — click the cell, type, press
              Enter. It is stored on the project, so it applies to every order row of that project.
            </>
          )}
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
          inlineEdit={inlineEdit}
        />
      </div>
    </div>
  )
}
