'use client'

import { OrdersTable, type InlineEditConfig, type RowEditor } from '@/components/orders-table'
import { EditOrderDialog } from '@/components/edit-order-dialog'
import { EditProjectDialog } from '@/components/edit-project-dialog'
import { projectOrdersFields } from '@/components/project-orders-columns'
import { readJsonResponse } from '@/lib/table-utils'
import { INLINE_EDITABLE_FIELDS } from '@/lib/project-order-edits'
import { FolderPen, Info, Pencil, SquarePen } from 'lucide-react'

// ---------------------------------------------------------------------------
// A row of project_orders_view is two records: one project, one order. So the
// row carries two identities — `project_pk` and `order_pk` — and edits address
// whichever half they belong to. Both go through /api/project-orders, which is
// gated to the roles allowed to write from this view and accepts only the
// fields listed in lib/project-order-edits.ts.
// ---------------------------------------------------------------------------

const rowId = (row: any) =>
  row.order_pk == null ? `${row.project_pk}` : `${row.project_pk}-${row.order_pk}`

/** PUTs one half of a row and reports the server's message on failure. */
const saveRow = async (row: any, body: Record<string, unknown>) => {
  if (!row?.project_pk) {
    throw new Error('This row has no project to save against')
  }
  const response = await fetch(`/api/project-orders/${rowId(row)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(result.error || 'Failed to save')
  }
}

/**
 * Fields the edit dialogs submit that this view does not write.
 *
 * `id` and `project_id` are identity — the URL says which row is being edited.
 * `questionnaire_received` is the intake trigger, deliberately left to the
 * Projects module (the order dialog's own input for it is hidden here), and
 * `first_or_next_project` is rendered by the project dialog but has never been
 * part of its payload.
 */
const IDENTITY_AND_AUTOMATION = new Set(['id', 'project_id', 'questionnaire_received'])

const editableHalf = (payload: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(payload).filter(([key]) => !IDENTITY_AND_AUTOMATION.has(key))
  )

const invoiceNumberHint =
  'Stored on the project, so it applies to every order row of that project'

export function ProjectOrdersClient({ canEdit = false }: { canEdit?: boolean }) {
  const inlineEdit: InlineEditConfig | undefined = canEdit
    ? {
        fields: [...INLINE_EDITABLE_FIELDS],
        save: (row, key, value) => saveRow(row, { project: { [key]: value } }),
        // One invoice number is stored per project and shown on each of its
        // order rows, so an edit has to land on all of them at once.
        appliesTo: (edited, candidate) => candidate.project_pk === edited.project_pk,
        hints: { invoice_number: invoiceNumberHint },
      }
    : undefined

  const rowEditors: RowEditor[] | undefined = canEdit
    ? [
        {
          key: 'order',
          title: 'Edit this order',
          icon: <SquarePen className="w-4 h-4" />,
          // A project with no orders has an empty order half to edit.
          available: (row) => row.order_pk != null,
          save: (row, payload) =>
            saveRow(row, {
              order: editableHalf(payload),
              // The view's order side comes from all_orders while the write
              // goes to orders, so the server re-reads the row and checks it
              // against the keys shown here before overwriting anything.
              expect: { order_id: row.order_id ?? null, project_id: row.project_id },
            }),
          render: ({ row, onClose, onUpdate }) => (
            <EditOrderDialog
              // The view's `id` is a composite of both records; the dialog
              // wants the order's own key.
              order={{ ...row, id: row.order_pk }}
              onClose={onClose}
              onUpdate={onUpdate}
              showQuestionnaire={false}
            />
          ),
        },
        {
          key: 'project',
          title: 'Edit this row’s project (invoicing, dates, contacts)',
          icon: <FolderPen className="w-4 h-4" />,
          save: (row, payload) => saveRow(row, { project: editableHalf(payload) }),
          render: ({ row, onClose, onUpdate }) => (
            <EditProjectDialog
              project={{ ...row, id: row.project_pk }}
              onClose={onClose}
              onUpdate={onUpdate}
              showIntakePanel={false}
            />
          ),
        },
      ]
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
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
        <span>
          One row per order. Projects with several orders repeat their project details on each row;
          a project with no orders shows empty order columns. Every column header carries an
          operator — <strong>contains</strong>, <strong>is</strong>, <strong>is not</strong>,{' '}
          <strong>is populated</strong>, <strong>is blank</strong>, and before/after/between on
          dates. Stack as many as you need; each active condition appears as a chip above the table
          and can be removed on its own.
        </span>
      </div>

      {canEdit && (
        <div
          className="flex items-start gap-2 text-sm px-4 py-3 rounded-lg"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#5d6b88' }}
        >
          <Pencil className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#012e64' }} />
          <span>
            <strong>Invoice Number</strong> is editable straight in the table — click the cell, type,
            press Enter. For anything else, the Actions column opens the row’s{' '}
            <strong>order</strong> or its <strong>project</strong>. Project fields — invoice number
            and dates included — are stored once per project, so they apply to every order row of
            that project. Questionnaire and intake stay under Projects.
          </span>
        </div>
      )}

      <div className="min-h-[500px]">
        <OrdersTable
          apiPath="/api/project-orders"
          fields={projectOrdersFields}
          enableCreate={false}
          enableActions={false}
          noun="project orders"
          searchPlaceholder="Search by project, project name, order ID, product, supplier, company, invoice, PM, or sales person..."
          inlineEdit={inlineEdit}
          rowEditors={rowEditors}
        />
      </div>
    </div>
  )
}
